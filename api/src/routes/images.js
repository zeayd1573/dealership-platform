// Image upload/management (auth) and public file serving from R2.
import { Hono } from 'hono';
import { requireAuth } from '../lib/auth.js';
import { shapeImage } from '../lib/util.js';
import { getSite } from '../lib/site.js';

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

// GET /api/files/<key> — stream an object from R2. Vehicle photos get the dealer's branding
// watermark and/or a SOLD ribbon baked in when enabled; results are cached in R2 under derived/<sig>/.
files.get('/*', async c => {
  const key = c.req.path.replace(/^\/api\/files\//, '');
  if (!key) return c.text('Not found', 404);
  const obj = await c.env.BUCKET.get(key);
  if (!obj) return c.text('Not found', 404);
  const isPhoto = key.startsWith('vehicles/');
  const cache = isPhoto ? 'public, max-age=86400' : 'public, max-age=31536000, immutable';

  if (isPhoto && c.env.IMAGES) {
    const row = await c.env.DB.prepare('SELECT vi.is_primary, vi.key, vi.thumb_key, v.sold_overlay, v.status, v.dealer_id FROM vehicle_images vi JOIN vehicles v ON v.id = vi.vehicle_id WHERE vi.key = ? OR vi.thumb_key = ?').bind(key, key).first();
    if (row) {
      const site = await getSite(c.env, row.dealer_id);
      const wm = site.watermark_on === '1' && (site.watermark_scope === 'all' || !!row.is_primary);
      const sold = site.sold_stamp_on === '1' && (!!row.sold_overlay || row.status === 'sold');
      if (wm || sold) {
        const sig = await shortHash(`v4|${wm ? `w:${site.watermark_position}:${site.watermark_opacity}:${site.watermark_key || 'default'}` : ''}|${sold ? 'sold' : ''}`);
        const dkey = `derived/${sig}/${key}`;
        const cached = await c.env.BUCKET.get(dkey);
        if (cached) return send(cached, cache);
        try {
          const out = await compose(c, await obj.arrayBuffer(), site, wm, sold);
          c.executionCtx.waitUntil(c.env.BUCKET.put(dkey, out, { httpMetadata: { contentType: 'image/jpeg', cacheControl: cache } }));
          return new Response(out, { headers: { 'content-type': 'image/jpeg', 'cache-control': cache, 'x-derived': sig } });
        } catch (err) {
          console.warn('overlay failed, serving original:', err.message);
          return send(await c.env.BUCKET.get(key), cache);
        }
      }
    }
  }
  return send(obj, cache);
});

function send(obj, cache) {
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('cache-control', cache);
  return new Response(obj.body, { headers });
}

async function shortHash(s) {
  const b = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].slice(0, 6).map(x => x.toString(16).padStart(2, '0')).join('');
}

/** Bytes of an overlay image: a custom R2 key, or a built-in asset served by the Worker. */
async function overlayBytes(c, key, assetPath) {
  if (key) { const o = await c.env.BUCKET.get(key); if (o) return o.arrayBuffer(); }
  const res = await c.env.ASSETS.fetch(new Request(new URL(assetPath, c.req.url)));
  if (!res.ok) throw new Error('overlay asset missing: ' + assetPath);
  return res.arrayBuffer();
}

const STAMP_W = 1400, STAMP_H = 1000; // sold-stamp.png canvas

async function compose(c, bytes, site, wm, sold) {
  const IM = c.env.IMAGES;
  const info = await IM.info(new Blob([bytes]).stream());
  const W = info.width, H = info.height;
  let t = IM.input(new Blob([bytes]).stream());
  if (wm) {
    const logo = await overlayBytes(c, site.watermark_key, '/img/watermark.png');
    const w = Math.max(80, Math.round(W * 0.22)); const m = Math.round(W * 0.025);
    const lw = w, lh = Math.round(w * 500 / 779); // watermark.png aspect; used to centre it
    const pos = { tl: { top: m, left: m }, tr: { top: m, right: m }, bl: { bottom: m, left: m }, br: { bottom: m, right: m },
      tc: { top: m, left: Math.round((W - lw) / 2) }, bc: { bottom: m, left: Math.round((W - lw) / 2) },
      c: { top: Math.round((H - lh) / 2), left: Math.round((W - lw) / 2) } }[site.watermark_position] || { top: m, left: m };
    t = t.draw(IM.input(new Blob([logo]).stream()).transform({ width: w }), { opacity: Math.min(1, Math.max(.1, parseFloat(site.watermark_opacity) || .9)), ...pos });
  }
  if (sold) {
    const stamp = await overlayBytes(c, '', '/img/sold-stamp.png');
    const scale = Math.min(W / STAMP_W, H / STAMP_H);
    const ow = Math.round(STAMP_W * scale), oh = Math.round(STAMP_H * scale);
    t = t.draw(IM.input(new Blob([stamp]).stream()).transform({ width: ow }), { top: Math.max(0, Math.round((H - oh) / 2)), left: Math.max(0, Math.round((W - ow) / 2)) });
  }
  const out = await t.output({ format: 'image/jpeg', quality: 85 });
  return out.response().arrayBuffer();
}
