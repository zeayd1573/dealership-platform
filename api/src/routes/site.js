// Website content: public read, admin edit, image upload. Mounted at /api/site (admin) and used by /api/public/site.
import { Hono } from 'hono';
import { requireAuth } from '../lib/auth.js';
import { getSite, saveSite, SITE_KEYS, PRIVATE_SITE_KEYS } from '../lib/site.js';
import { getDefaultDealer } from '../lib/util.js';
import { resizeImage, sniffImage } from './images.js';
import { sendMail, enquiryEmail, recipients } from '../lib/mail.js';

export const publicSite = new Hono();
publicSite.get('/', async c => {
  const d = await getDefaultDealer(c.env);
  const s = await getSite(c.env, d.id);
  // Driven by one list so a new private setting cannot leak by being forgotten here.
  const pub = { ...s };
  for (const k of PRIVATE_SITE_KEYS) delete pub[k];
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
  if (file.size > 20 * 1024 * 1024) return c.json({ error: 'File too large (max 20MB)' }, 400);
  const dealerId = c.get('dealerId');
  const png = kind === 'watermark';
  // The watermark keeps its transparency so it is stored unresized, which means the
  // bytes must be checked here. A declared content type is attacker-controlled, and an
  // SVG stored and served from this origin would run script beside the admin panel.
  const raw = await file.arrayBuffer();
  const sniffed = sniffImage(raw);
  if (!sniffed) return c.json({ error: 'That file is not a JPEG, PNG, WebP or GIF image' }, 400);
  if (png && sniffed !== 'image/png') return c.json({ error: 'The watermark must be a PNG, so it can keep its transparency' }, 400);
  const key = `site/${dealerId}/${kind}-${crypto.randomUUID()}.${png ? 'png' : 'jpg'}`;
  const img = png ? { buffer: raw, type: sniffed } : await resizeImage(c.env, file, 1800, 82);
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

// POST /api/site/test-email { to? } — sends a sample enquiry to prove the setup works.
// Uses the saved recipient unless one is passed, so the dealer can test before going live.
site.post('/test-email', async c => {
  const dealerId = c.get('dealerId');
  const body = await c.req.json().catch(() => ({}));
  const s = await getSite(c.env, dealerId);
  const to = recipients(body.to || s.notify_to);
  if (!to.length) return c.json({ error: 'Add an email address to send notifications to first.' }, 400);
  if (!c.env.RESEND_API_KEY) return c.json({ error: 'Email is not configured on the server yet. Set the RESEND_API_KEY secret.' }, 400);

  const dealer = await c.env.DB.prepare('SELECT name, phone, address FROM dealers WHERE id = ?').bind(dealerId).first();
  const origin = new URL(c.req.url).origin;
  const { subject, html, text } = enquiryEmail({
    enquiry: { type: 'enquiry', name: 'Test Message', phone: '087 000 0000', email: '', message: 'This is a test from your website admin. If you can read this, enquiry notifications are working.' },
    extra: null, dealer, vehicle: null, adminUrl: `${origin}/admin/enquiries`
  });
  const res = await sendMail(c.env, { to, subject: `[Test] ${subject}`, html, text, from: s.notify_from || undefined });
  if (!res.ok) return c.json({ error: res.error }, 502);
  return c.json({ success: true, sent_to: to });
});

// --- Dealer record (name, phone, address, hours) --------------------------
// Mounted at /api/dealer. Admin only; the public read lives at /api/public/dealer.
export const dealer = new Hono();
dealer.use('*', requireAuth());

const DEALER_FIELDS = ['name', 'slug', 'phone', 'phone_href', 'whatsapp', 'email', 'address', 'maps_url', 'logo_key'];

dealer.get('/', async c => {
  const row = await c.env.DB.prepare('SELECT * FROM dealers WHERE id = ?').bind(c.get('dealerId')).first();
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json({ ...row, hours: JSON.parse(row.hours_json || '[]') });
});

// PATCH /api/dealer — any subset of the fields above, plus `hours` as [[label, value], ...]
dealer.patch('/', async c => {
  const body = await c.req.json().catch(() => ({}));
  const sets = [], binds = [];
  for (const k of DEALER_FIELDS) {
    if (!(k in body)) continue;
    const v = body[k] === '' ? null : body[k];
    if (k === 'slug' && v && !/^[a-z0-9-]{2,40}$/.test(v)) return c.json({ error: 'slug must be lowercase letters, numbers and dashes' }, 400);
    sets.push(`${k} = ?`); binds.push(v == null ? null : String(v));
  }
  if (Array.isArray(body.hours)) { sets.push('hours_json = ?'); binds.push(JSON.stringify(body.hours)); }
  if (!sets.length) return c.json({ error: 'No valid fields provided' }, 400);
  try {
    const row = await c.env.DB.prepare(`UPDATE dealers SET ${sets.join(', ')} WHERE id = ? RETURNING *`).bind(...binds, c.get('dealerId')).first();
    return c.json({ ...row, hours: JSON.parse(row.hours_json || '[]') });
  } catch (err) {
    if (/UNIQUE/.test(err.message)) return c.json({ error: 'Another dealer already uses that slug' }, 409);
    throw err;
  }
});
