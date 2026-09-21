// Website content: public read, admin edit, image upload. Mounted at /api/site (admin) and used by /api/public/site.
import { Hono } from 'hono';
import { requireAuth } from '../lib/auth.js';
import { getSite, saveSite, SITE_KEYS } from '../lib/site.js';
import { getDefaultDealer } from '../lib/util.js';
import { resizeImage } from './images.js';

export const publicSite = new Hono();
publicSite.get('/', async c => {
  const d = await getDefaultDealer(c.env);
  const s = await getSite(c.env, d.id);
  const { hero_image_key, about_image_key, ...pub } = s;
  return c.json(pub);
});

export const site = new Hono();
site.use('*', requireAuth());

site.get('/', async c => c.json(await getSite(c.env, c.get('dealerId'))));

site.patch('/', async c => {
  const body = await c.req.json().catch(() => ({}));
  const patch = {};
  for (const k of SITE_KEYS) if (k in body) patch[k] = body[k];
  if (patch.site_title && String(patch.site_title).length > 120) return c.json({ error: 'Page title is too long (max 120 characters)' }, 400);
  if (patch.site_description && String(patch.site_description).length > 320) return c.json({ error: 'Description is too long (max 320 characters)' }, 400);
  await saveSite(c.env, c.get('dealerId'), patch);
  return c.json(await getSite(c.env, c.get('dealerId')));
});

// POST /api/site/image?kind=hero|about  (multipart field "image")
site.post('/image', async c => {
  const kind = c.req.query('kind') === 'about' ? 'about' : 'hero';
  const body = await c.req.parseBody();
  const file = body.image;
  if (!file || typeof file !== 'object' || !('arrayBuffer' in file)) return c.json({ error: 'No image provided' }, 400);
  if (file.type && !file.type.startsWith('image/')) return c.json({ error: 'Not an image' }, 400);
  if (file.size > 20 * 1024 * 1024) return c.json({ error: 'File too large (max 20MB)' }, 400);
  const dealerId = c.get('dealerId');
  const key = `site/${dealerId}/${kind}-${crypto.randomUUID()}.jpg`;
  const img = await resizeImage(c.env, file, 1800, 82);
  await c.env.BUCKET.put(key, img.buffer, { httpMetadata: { contentType: img.type, cacheControl: 'public, max-age=31536000, immutable' } });
  const prev = (await getSite(c.env, dealerId))[`${kind}_image_key`];
  await saveSite(c.env, dealerId, { [`${kind}_image_key`]: key });
  if (prev) c.executionCtx.waitUntil(c.env.BUCKET.delete(prev).catch(() => {}));
  return c.json(await getSite(c.env, dealerId));
});

// DELETE /api/site/image?kind=hero|about — back to the built-in picture
site.delete('/image', async c => {
  const kind = c.req.query('kind') === 'about' ? 'about' : 'hero';
  const dealerId = c.get('dealerId');
  const prev = (await getSite(c.env, dealerId))[`${kind}_image_key`];
  await saveSite(c.env, dealerId, { [`${kind}_image_key`]: '' });
  if (prev) c.executionCtx.waitUntil(c.env.BUCKET.delete(prev).catch(() => {}));
  return c.json(await getSite(c.env, dealerId));
});
