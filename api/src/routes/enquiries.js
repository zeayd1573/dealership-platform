// Enquiries: public POST (any form on the site), admin list/read/delete. Mounted at /api/enquiries.
import { Hono } from 'hono';
import { requireAuth } from '../lib/auth.js';
import { getDefaultDealer, isEmail } from '../lib/util.js';
import { getSite } from '../lib/site.js';
import { clientIp } from '../lib/auth.js';
import { sendMail, enquiryEmail, recipients } from '../lib/mail.js';

const enquiries = new Hono();
const TYPES = new Set(['enquiry', 'finance', 'valuation', 'sourcing', 'contact', 'review']);

// POST /api/enquiries  — public. Accepts { type, vehicle_id, name, phone, email, message, ...anything }
enquiries.post('/', async c => {
  const body = await c.req.json().catch(() => ({}));

  // Open to the public by necessity, so cap the rate and the size. Without this the
  // form is a way to flood the inbox, and to mail-bomb the dealer once alerts are on.
  const ip = clientIp(c);
  await c.env.DB.prepare(`
    INSERT INTO enquiry_throttle (ip, n, window_start) VALUES (?, 1, datetime('now'))
    ON CONFLICT(ip) DO UPDATE SET
      n = CASE WHEN enquiry_throttle.window_start < datetime('now', '-10 minutes') THEN 1 ELSE enquiry_throttle.n + 1 END,
      window_start = CASE WHEN enquiry_throttle.window_start < datetime('now', '-10 minutes') THEN datetime('now') ELSE enquiry_throttle.window_start END
  `).bind(ip).run().catch(() => {});
  const n = await c.env.DB.prepare('SELECT n FROM enquiry_throttle WHERE ip = ?').bind(ip).first('n').catch(() => 0);
  if (n > 5) return c.json({ error: 'Thanks, we already have your message. Please ring us if it is urgent.' }, 429);

  const tooBig = JSON.stringify(body).length > 8000;
  if (tooBig) return c.json({ error: 'That message is too long' }, 413);

  const type = TYPES.has(body.type) ? body.type : 'enquiry';
  const name = [body.name, [body.first_name, body.last_name].filter(Boolean).join(' ')].find(s => s && String(s).trim()) || null;
  const { phone, email, message, vehicle_id } = body;
  if (!name || !(phone || email)) return c.json({ error: 'name and a phone number or email are required' }, 400);
  if (email && !isEmail(email)) return c.json({ error: 'email looks invalid' }, 400);

  const dealer = body.dealer ? await c.env.DB.prepare('SELECT id FROM dealers WHERE slug = ?').bind(body.dealer).first() : await getDefaultDealer(c.env);
  const { type: _t, name: _n, phone: _p, email: _e, message: _m, vehicle_id: _v, dealer: _d, first_name, last_name, consent, ...rest } = body;
  // Keep only a sane number of extra fields, each trimmed, plus the IP for throttling.
  const extra = Object.fromEntries(Object.entries(rest).slice(0, 30).map(([k, v]) => [String(k).slice(0, 40), String(v ?? '').slice(0, 500)]));
  const vid = vehicle_id ? Number(vehicle_id) || null : null;
  const row = await c.env.DB.prepare('INSERT INTO enquiries (dealer_id, vehicle_id, type, name, phone, email, message, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id, created_at')
    .bind(dealer.id, vid, type, String(name).trim().slice(0, 120), String(phone || '').slice(0, 40) || null, String(email || '').slice(0, 160) || null, String(message || '').slice(0, 4000) || null, Object.keys(extra).length ? JSON.stringify(extra) : null).first();

  // Notify after the enquiry is safely stored, and never let mail failure affect the response.
  c.executionCtx.waitUntil(notify(c, {
    enquiry: { id: row.id, type, name: String(name).trim(), phone: phone || null, email: email || null, message: message || null },
    extra, dealerId: dealer.id, vehicleId: vid
  }).catch(err => console.warn('enquiry notification failed:', err.message)));

  return c.json({ success: true, id: row.id }, 201);
});

enquiries.use('*', requireAuth());

// GET /api/enquiries?status=unread&type=finance
enquiries.get('/', async c => {
  const dealerId = c.get('dealerId');
  const conds = ['e.dealer_id = ?']; const binds = [dealerId];
  if (c.req.query('status')) { conds.push('e.status = ?'); binds.push(c.req.query('status')); }
  if (c.req.query('type')) { conds.push('e.type = ?'); binds.push(c.req.query('type')); }
  const { results } = await c.env.DB.prepare(`SELECT e.*, v.reg, v.make, v.model, v.year FROM enquiries e LEFT JOIN vehicles v ON v.id = e.vehicle_id WHERE ${conds.join(' AND ')} ORDER BY e.created_at DESC, e.id DESC`).bind(...binds).all();
  return c.json(results.map(r => ({ ...r, payload: r.payload ? JSON.parse(r.payload) : null })));
});

// PATCH /api/enquiries/:id { status: 'read' | 'unread' }
enquiries.patch('/:id', async c => {
  const { status } = await c.req.json().catch(() => ({}));
  if (!['read', 'unread'].includes(status)) return c.json({ error: 'status must be read or unread' }, 400);
  const res = await c.env.DB.prepare('UPDATE enquiries SET status = ? WHERE id = ? AND dealer_id = ?').bind(status, c.req.param('id'), c.get('dealerId')).run();
  if (!res.meta.changes) return c.json({ error: 'Not found' }, 404);
  return c.json({ success: true });
});

// DELETE /api/enquiries/:id
enquiries.delete('/:id', async c => {
  const res = await c.env.DB.prepare('DELETE FROM enquiries WHERE id = ? AND dealer_id = ?').bind(c.req.param('id'), c.get('dealerId')).run();
  if (!res.meta.changes) return c.json({ error: 'Not found' }, 404);
  return c.json({ success: true });
});

/** Email the dealer about a new enquiry, if they have switched notifications on. */
async function notify(c, { enquiry, extra, dealerId, vehicleId }) {
  const site = await getSite(c.env, dealerId);
  if (site.notify_on !== '1') return;
  const to = recipients(site.notify_to);
  if (!to.length) return;
  const only = String(site.notify_types || '').split(',').map(s => s.trim()).filter(Boolean);
  if (only.length && !only.includes(enquiry.type)) return;

  const dealer = await c.env.DB.prepare('SELECT name, phone, address FROM dealers WHERE id = ?').bind(dealerId).first();
  const vehicle = vehicleId
    ? await c.env.DB.prepare('SELECT year, make, model, reg FROM vehicles WHERE id = ?').bind(vehicleId).first()
    : null;
  const origin = new URL(c.req.url).origin;
  const { subject, html, text } = enquiryEmail({ enquiry, extra, dealer, vehicle, adminUrl: `${origin}/admin/enquiries` });

  const res = await sendMail(c.env, {
    to, subject, html, text,
    from: site.notify_from || undefined,
    replyTo: enquiry.email || undefined      // so the dealer can just hit reply
  });
  if (!res.ok) console.warn('enquiry notification not sent:', res.error);
}

export default enquiries;
