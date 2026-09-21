// Image upload/management (auth) and public file serving from R2.
import { Hono } from 'hono';
import { requireAuth } from '../lib/auth.js';
import { shapeImage } from '../lib/util.js';

/** Single resize (used for site images). Falls back to the original bytes without the Images binding. */
export async function resizeImage(env, file, width, quality = 82) {
  const original = await file.arrayBuffer();
  if (!env.IMAGES) return { buffer: original, type: file.type || 'image/jpeg', resized: false };
  try {
    const r = await env.IMAGES.input(new Blob([original]).stream()).transform({ width, fit: 'scale-down' }).output({ format: 'image/jpeg', quality });
    return { buffer: await r.response().arrayBuffer(), type: 'image/jpeg', resized: true };
  } catch (err) {
    console.warn('Images binding transform failed, storing original:', err.message);
    return { buffer: original, type: file.type || 'image/jpeg', resized: false };
  }
}

/** Resize with the Images binding when available; otherwise store the original bytes. */
async function processImage(env, file) {
  const original = await file.arrayBuffer();
  const out = { main: original, thumb: original, type: file.type || 'image/jpeg', resized: false };
  if (!env.IMAGES) return out;
  try {
    const run = async (width, quality) => {
      const r = await env.IMAGES.input(new Blob([original]).stream()).transform({ width, fit: 'scale-down' }).output({ format: 'image/jpeg', quality });
      return r.response().arrayBuffer();
    };
    out.main = await run(1200, 85); out.thumb = await run(480, 80); out.type = 'image/jpeg'; out.resized = true;
  } catch (err) {
    console.warn('Images binding transform failed, storing original:', err.message);
  }
  return out;
}

export const uploads = new Hono();      // mounted at /api/vehicles  (POST /:id/images)
export const images = new Hono();       // mounted at /api/images
export const files = new Hono();        // mounted at /api/files (public)

uploads.use('*', requireAuth());
images.use('*', requireAuth());

// POST /api/vehicles/:id/images  (multipart, field "images", up to 20 files)
uploads.post('/:id/images', async c => {
  const dealerId = c.get('dealerId'); const id = c.req.param('id');
  const vehicle = await c.env.DB.prepare('SELECT id FROM vehicles WHERE id = ? AND dealer_id = ?').bind(id, dealerId).first();
  if (!vehicle) return c.json({ error: 'Vehicle not found' }, 404);

  const body = await c.req.parseBody({ all: true });
  let list = body.images || body['images[]'] || [];
  if (!Array.isArray(list)) list = [list];
  list = list.filter(f => f && typeof f === 'object' && 'arrayBuffer' in f).slice(0, 20);
  if (!list.length) return c.json({ error: 'No images provided' }, 400);
  for (const f of list) {
    if (f.type && !f.type.startsWith('image/')) return c.json({ error: `Not an image: ${f.name}` }, 400);
    if (f.size > 20 * 1024 * 1024) return c.json({ error: `File too large (max 20MB): ${f.name}` }, 400);
  }

  const hasPrimary = await c.env.DB.prepare('SELECT 1 FROM vehicle_images WHERE vehicle_id = ? AND is_primary = 1').bind(id).first();
  let sort = (await c.env.DB.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM vehicle_images WHERE vehicle_id = ?').bind(id).first('n')) || 0;

  const saved = [];
  for (let i = 0; i < list.length; i++) {
    const file = list[i];
    const uid = crypto.randomUUID();
    const ext = 'jpg';
    const key = `vehicles/${id}/${uid}.${ext}`, thumbKey = `vehicles/${id}/${uid}-thumb.${ext}`;
    const img = await processImage(c.env, file);
    await Promise.all([
      c.env.BUCKET.put(key, img.main, { httpMetadata: { contentType: img.type, cacheControl: 'public, max-age=31536000, immutable' } }),
      c.env.BUCKET.put(thumbKey, img.thumb, { httpMetadata: { contentType: img.type, cacheControl: 'public, max-age=31536000, immutable' } })
    ]);
    const isPrimary = !hasPrimary && i === 0 ? 1 : 0;
    const row = await c.env.DB.prepare('INSERT INTO vehicle_images (vehicle_id, key, thumb_key, is_primary, sort_order) VALUES (?, ?, ?, ?, ?) RETURNING *')
      .bind(id, key, thumbKey, isPrimary, sort++).first();
    saved.push({ ...shapeImage(c.env, row), resized: img.resized });
  }
  return c.json(saved, 201);
});

async function ownedImage(c) {
  return c.env.DB.prepare('SELECT vi.* FROM vehicle_images vi JOIN vehicles v ON v.id = vi.vehicle_id WHERE vi.id = ? AND v.dealer_id = ?').bind(c.req.param('id'), c.get('dealerId')).first();
}

// DELETE /api/images/:id
images.delete('/:id', async c => {
  const img = await ownedImage(c);
  if (!img) return c.json({ error: 'Image not found' }, 404);
  await Promise.all([c.env.BUCKET.delete(img.key), c.env.BUCKET.delete(img.thumb_key)]);
  await c.env.DB.prepare('DELETE FROM vehicle_images WHERE id = ?').bind(img.id).run();
  if (img.is_primary) {
    await c.env.DB.prepare('UPDATE vehicle_images SET is_primary = 1 WHERE id = (SELECT id FROM vehicle_images WHERE vehicle_id = ? ORDER BY sort_order, id LIMIT 1)').bind(img.vehicle_id).run();
  }
  return c.json({ success: true });
});

// PATCH /api/images/:id/primary
images.patch('/:id/primary', async c => {
  const img = await ownedImage(c);
  if (!img) return c.json({ error: 'Image not found' }, 404);
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE vehicle_images SET is_primary = 0 WHERE vehicle_id = ?').bind(img.vehicle_id),
    c.env.DB.prepare('UPDATE vehicle_images SET is_primary = 1 WHERE id = ?').bind(img.id)
  ]);
  return c.json({ success: true });
});

// PATCH /api/images/reorder { order: [{ id, sort_order }] }
images.patch('/reorder', async c => {
  const { order } = await c.req.json().catch(() => ({}));
  if (!Array.isArray(order) || !order.length) return c.json({ error: 'order must be a non-empty array' }, 400);
  const dealerId = c.get('dealerId');
  await c.env.DB.batch(order.map(o => c.env.DB.prepare(
    'UPDATE vehicle_images SET sort_order = ? WHERE id = ? AND vehicle_id IN (SELECT id FROM vehicles WHERE dealer_id = ?)'
  ).bind(Number(o.sort_order) || 0, Number(o.id), dealerId)));
  return c.json({ success: true });
});

// GET /api/files/<key> — stream an object from R2 (used locally and when no public bucket domain is set)
files.get('/*', async c => {
  const key = c.req.path.replace(/^\/api\/files\//, '');
  if (!key) return c.text('Not found', 404);
  const obj = await c.env.BUCKET.get(key);
  if (!obj) return c.text('Not found', 404);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  if (!headers.get('cache-control')) headers.set('cache-control', 'public, max-age=31536000, immutable');
  return new Response(obj.body, { headers });
});
