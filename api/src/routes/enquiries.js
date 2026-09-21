// Enquiries: public POST (any form on the site), admin list/read/delete. Mounted at /api/enquiries.
import { Hono } from 'hono';
import { requireAuth } from '../lib/auth.js';
import { getDefaultDealer, isEmail } from '../lib/util.js';

const enquiries = new Hono();
const TYPES = new Set(['enquiry', 'finance', 'valuation', 'sourcing', 'contact', 'review']);

// POST /api/enquiries  — public. Accepts { type, vehicle_id, name, phone, email, message, ...anything }
enquiries.post('/', async c => {
  const body = await c.req.json().catch(() => ({}));
  const type = TYPES.has(body.type) ? body.type : 'enquiry';
  const name = [body.name, [body.first_name, body.last_name].filter(Boolean).join(' ')].find(s => s && String(s).trim()) || null;
  const { phone, email, message, vehicle_id } = body;
  if (!name || !(phone || email)) return c.json({ error: 'name and a phone number or email are required' }, 400);
  if (email && !isEmail(email)) return c.json({ error: 'email looks invalid' }, 400);

  const dealer = body.dealer ? await c.env.DB.prepare('SELECT id FROM dealers WHERE slug = ?').bind(body.dealer).first() : await getDefaultDealer(c.env);
  const { type: _t, name: _n, phone: _p, email: _e, message: _m, vehicle_id: _v, dealer: _d, first_name, last_name, consent, ...extra } = body;
  const vid = vehicle_id ? Number(vehicle_id) || null : null;
  const row = await c.env.DB.prepare('INSERT INTO enquiries (dealer_id, vehicle_id, type, name, phone, email, message, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id, created_at')
    .bind(dealer.id, vid, type, String(name).trim(), phone || null, email || null, message || null, Object.keys(extra).length ? JSON.stringify(extra) : null).first();
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

export default enquiries;
