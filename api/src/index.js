// Dealer platform API — Cloudflare Worker entry point.
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import auth from './routes/auth.js';
import vehicles from './routes/vehicles.js';
import { uploads, images, files } from './routes/images.js';
import pub from './routes/public.js';
import enquiries from './routes/enquiries.js';
import { reviews, finance, highlighted, reg } from './routes/misc.js';
import { site, publicSite } from './routes/site.js';
import { registerSeo, notFound } from './routes/seo.js';
import { getDefaultDealer } from './lib/util.js';
import { getPhotoVersion } from './lib/site.js';

const app = new Hono();

app.use('/api/*', async (c, next) => {
  const allowed = (c.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  return cors({
    origin: origin => (!origin || allowed.includes(origin) || allowed.includes('*')) ? (origin || '*') : null,
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400
  })(c, next);
});

// A relative PUBLIC_IMAGE_BASE (e.g. /api/files) is made absolute per request, so image URLs
// work from the admin panel or any other origin, not just the Worker's own pages.
app.use('*', async (c, next) => {
  const base = c.env.PUBLIC_IMAGE_BASE || '/api/files';
  const dealer = await getDefaultDealer(c.env).catch(() => null);
  const ver = dealer ? await getPhotoVersion(c.env, dealer.id).catch(() => '1') : '1';
  c.env = Object.assign(Object.create(null), c.env, { PUBLIC_IMAGE_BASE: base.startsWith('/') ? new URL(c.req.url).origin + base : base, IMG_VER: ver });
  await next();
});

app.get('/api/health', c => c.json({ status: 'ok', time: new Date().toISOString() }));

app.route('/api/auth', auth);
app.route('/api/vehicles', uploads);      // POST /api/vehicles/:id/images
app.route('/api/vehicles', vehicles);
app.route('/api/images', images);
app.route('/api/files', files);
app.route('/api/public', pub);
app.route('/api/enquiries', enquiries);
app.route('/api/reviews', reviews);
app.route('/api/finance', finance);
app.route('/api/highlighted', highlighted);
app.route('/api/reg', reg);
app.route('/api/site', site);
app.route('/api/public/site', publicSite);
registerSeo(app);

app.notFound(c => c.req.path.startsWith('/api/') ? c.json({ error: 'Not found' }, 404) : notFound(c));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message || 'Internal server error' }, 500);
});

export default app;
