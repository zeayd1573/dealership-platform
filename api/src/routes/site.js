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
  const { hero_image_key, about_image_key, watermark_key, ...pub } = s;
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
  const kind = ['about', 'watermark'].includes(c.req.query('kind')) ? c.req.query('kind') : 'hero';
  const body = await c.req.parseBody();
  const file = body.image;
  if (!file || typeof file !== 'object' || !('arrayBuffer' in file)) return c.json({ error: 'No image provided' }, 400);
  if (file.type && !file.type.startsWith('image/')) return c.json({ error: 'Not an image' }, 400);
  if (file.size > 20 * 1024 * 1024) return c.json({ error: 'File too large (max 20MB)' }, 400);
  const dealerId = c.get('dealerId');
  const png = kind === 'watermark';
  const key = `site/${dealerId}/${kind}-${crypto.randomUUID()}.${png ? 'png' : 'jpg'}`;
  const img = png ? { buffer: await file.arrayBuffer(), type: file.type || 'image/png' } : await resizeImage(c.env, file, 1800, 82);
  await c.env.BUCKET.put(key, img.buffer, { httpMetadata: { contentType: img.type, cacheControl: 'public, max-age=31536000, immutable' } });
  const keyName = kind === 'watermark' ? 'watermark_key' : `${kind}_image_key`;
  const prev = (await getSite(c.env, dealerId))[keyName];
  await saveSite(c.env, dealerId, { [keyName]: key });
  if (prev) c.executionCtx.waitUntil(c.env.BUCKET.delete(prev).catch(() => {}));
  return c.json(await getSite(c.env, dealerId));
});

// DELETE /api/site/image?kind=hero|about|watermark — back to the built-in picture
site.delete('/image', async c => {
  const kind = ['about', 'watermark'].includes(c.req.query('kind')) ? c.req.query('kind') : 'hero';
  const dealerId = c.get('dealerId');
  const keyName = kind === 'watermark' ? 'watermark_key' : `${kind}_image_key`;
  const prev = (await getSite(c.env, dealerId))[keyName];
  await saveSite(c.env, dealerId, { [keyName]: '' });
  if (prev) c.executionCtx.waitUntil(c.env.BUCKET.delete(prev).catch(() => {}));
  return c.json(await getSite(c.env, dealerId));
});
