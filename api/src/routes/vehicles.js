// Admin vehicle routes (all require auth). Mounted at /api/vehicles.
import { Hono } from 'hono';
import { requireAuth } from '../lib/auth.js';
import { pickVehicleFields, shapeVehicle, shapeImage, VEHICLE_SELECT, getSettings, STATUSES } from '../lib/util.js';

const vehicles = new Hono();
vehicles.use('*', requireAuth());

// GET /api/vehicles?status=available  (archived excluded unless status=archived)
vehicles.get('/', async c => {
  const dealerId = c.get('dealerId');
  const status = c.req.query('status');
  const where = status ? 'AND v.status = ?' : "AND v.status != 'archived'";
  const stmt = c.env.DB.prepare(`SELECT ${VEHICLE_SELECT} FROM vehicles v WHERE v.dealer_id = ? ${where} ORDER BY v.created_at DESC, v.id DESC`);
  const { results } = await (status ? stmt.bind(dealerId, status) : stmt.bind(dealerId)).all();
  const settings = await getSettings(c.env, dealerId);
  return c.json(results.map(r => shapeVehicle(c.env, r, settings)));
});

// GET /api/vehicles/stats — dashboard counts
vehicles.get('/stats', async c => {
  const dealerId = c.get('dealerId');
  const [v, e, r] = await Promise.all([
    c.env.DB.prepare("SELECT status, COUNT(*) AS n FROM vehicles WHERE dealer_id = ? GROUP BY status").bind(dealerId).all(),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM enquiries WHERE dealer_id = ? AND status = 'unread'").bind(dealerId).first('n'),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM reviews WHERE dealer_id = ? AND status = 'pending'").bind(dealerId).first('n')
  ]);
  const by = Object.fromEntries(v.results.map(x => [x.status, x.n]));
  return c.json({ vehicles: { available: by.available || 0, paused: by.paused || 0, reserved: by.reserved || 0, sold: by.sold || 0, archived: by.archived || 0 }, unread_enquiries: e || 0, pending_reviews: r || 0 });
});

// GET /api/vehicles/:id
vehicles.get('/:id', async c => {
  const dealerId = c.get('dealerId');
  const row = await c.env.DB.prepare(`SELECT ${VEHICLE_SELECT} FROM vehicles v WHERE v.id = ? AND v.dealer_id = ?`).bind(c.req.param('id'), dealerId).first();
  if (!row) return c.json({ error: 'Not found' }, 404);
  const { results } = await c.env.DB.prepare('SELECT * FROM vehicle_images WHERE vehicle_id = ? ORDER BY sort_order, id').bind(row.id).all();
  const settings = await getSettings(c.env, dealerId);
  return c.json({ ...shapeVehicle(c.env, row, settings), images: results.map(i => shapeImage(c.env, i)) });
});

// POST /api/vehicles
vehicles.post('/', async c => {
  const dealerId = c.get('dealerId');
  const body = await c.req.json().catch(() => ({}));
  const f = pickVehicleFields(body, { forCreate: true });
  if (!f.reg) return c.json({ error: 'reg is required' }, 400);
  const keys = Object.keys(f);
  try {
    const row = await c.env.DB.prepare(`INSERT INTO vehicles (dealer_id, ${keys.join(', ')}) VALUES (?, ${keys.map(() => '?').join(', ')}) RETURNING *`)
      .bind(dealerId, ...keys.map(k => f[k])).first();
    return c.json(shapeVehicle(c.env, row), 201);
  } catch (err) {
    if (/UNIQUE/.test(err.message)) return c.json({ error: 'A vehicle with that reg already exists' }, 409);
    throw err;
  }
});

// PATCH /api/vehicles/:id
vehicles.patch('/:id', async c => {
  const dealerId = c.get('dealerId');
  const body = await c.req.json().catch(() => ({}));
  const f = pickVehicleFields(body);
  const keys = Object.keys(f);
  if (!keys.length) return c.json({ error: 'No valid fields provided' }, 400);
  try {
    const row = await c.env.DB.prepare(`UPDATE vehicles SET ${keys.map(k => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ? AND dealer_id = ? RETURNING *`)
      .bind(...keys.map(k => f[k]), c.req.param('id'), dealerId).first();
    if (!row) return c.json({ error: 'Not found' }, 404);
    return c.json(shapeVehicle(c.env, row));
  } catch (err) {
    if (/UNIQUE/.test(err.message)) return c.json({ error: 'A vehicle with that reg already exists' }, 409);
    throw err;
  }
});

// PATCH /api/vehicles/:id/status { status }
vehicles.patch('/:id/status', async c => {
  const { status } = await c.req.json().catch(() => ({}));
  if (!STATUSES.has(status)) return c.json({ error: 'Invalid status' }, 400);
  const row = await c.env.DB.prepare("UPDATE vehicles SET status = ?, updated_at = datetime('now') WHERE id = ? AND dealer_id = ? RETURNING *").bind(status, c.req.param('id'), c.get('dealerId')).first();
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json(shapeVehicle(c.env, row));
});

// DELETE /api/vehicles/:id — archive (soft delete). ?hard=1 removes the row and its images from R2.
vehicles.delete('/:id', async c => {
  const dealerId = c.get('dealerId'); const id = c.req.param('id');
  if (c.req.query('hard') === '1') {
    const { results } = await c.env.DB.prepare('SELECT key, thumb_key FROM vehicle_images WHERE vehicle_id = ?').bind(id).all();
    await Promise.all(results.flatMap(r => [c.env.BUCKET.delete(r.key), c.env.BUCKET.delete(r.thumb_key)]));
    await c.env.DB.prepare('DELETE FROM vehicle_images WHERE vehicle_id = ?').bind(id).run();
    const res = await c.env.DB.prepare('DELETE FROM vehicles WHERE id = ? AND dealer_id = ?').bind(id, dealerId).run();
    return c.json({ success: res.meta.changes > 0 });
  }
  const res = await c.env.DB.prepare("UPDATE vehicles SET status = 'archived', updated_at = datetime('now') WHERE id = ? AND dealer_id = ?").bind(id, dealerId).run();
  if (!res.meta.changes) return c.json({ error: 'Not found' }, 404);
  return c.json({ success: true });
});

export default vehicles;
