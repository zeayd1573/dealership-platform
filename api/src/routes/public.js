// Public, unauthenticated read endpoints for the dealer website. Mounted at /api/public.
import { Hono } from 'hono';
import { shapeVehicle, shapeImage, VEHICLE_SELECT, getSettings, getDefaultDealer } from '../lib/util.js';

const pub = new Hono();

async function dealerFor(c) {
  const slug = c.req.query('dealer');
  return slug ? c.env.DB.prepare('SELECT * FROM dealers WHERE slug = ?').bind(slug).first() : getDefaultDealer(c.env);
}

function shapeDealer(d) {
  if (!d) return null;
  return { id: d.id, name: d.name, slug: d.slug, phone: d.phone, phoneHref: d.phone_href, whatsapp: d.whatsapp, email: d.email, address: d.address, maps: d.maps_url, hours: JSON.parse(d.hours_json || '[]') };
}

// GET /api/public/dealer
pub.get('/dealer', async c => {
  const d = await dealerFor(c);
  if (!d) return c.json({ error: 'Dealer not found' }, 404);
  const settings = await getSettings(c.env, d.id);
  return c.json({ ...shapeDealer(d), finance: { apr: settings.apr, term_months: settings.term_months, deposit_pct: settings.deposit_pct } });
});

// GET /api/public/vehicles — available only, sensitive fields removed
pub.get('/vehicles', async c => {
  const d = await dealerFor(c);
  if (!d) return c.json({ error: 'Dealer not found' }, 404);
  const { results } = await c.env.DB.prepare(`SELECT ${VEHICLE_SELECT} FROM vehicles v WHERE v.dealer_id = ? AND v.status = 'available' ORDER BY v.created_at DESC, v.id DESC`).bind(d.id).all();
  const settings = await getSettings(c.env, d.id);
  return c.json(results.map(r => scrub(shapeVehicle(c.env, r, settings))));
});

// GET /api/public/vehicles/highlighted
pub.get('/vehicles/highlighted', async c => {
  const d = await dealerFor(c);
  const { results } = await c.env.DB.prepare(`SELECT ${VEHICLE_SELECT} FROM vehicles v WHERE v.dealer_id = ? AND v.status = 'available' AND v.is_highlighted = 1 ORDER BY v.created_at DESC`).bind(d.id).all();
  const settings = await getSettings(c.env, d.id);
  return c.json(results.map(r => scrub(shapeVehicle(c.env, r, settings))));
});

// GET /api/public/vehicles/:id — available or reserved/sold (so old links still resolve), never archived/paused
pub.get('/vehicles/:id', async c => {
  const row = await c.env.DB.prepare(`SELECT ${VEHICLE_SELECT} FROM vehicles v WHERE v.id = ? AND v.status IN ('available','reserved','sold')`).bind(c.req.param('id')).first();
  if (!row) return c.json({ error: 'Vehicle not found' }, 404);
  const { results } = await c.env.DB.prepare('SELECT * FROM vehicle_images WHERE vehicle_id = ? ORDER BY is_primary DESC, sort_order, id').bind(row.id).all();
  const settings = await getSettings(c.env, row.dealer_id);
  return c.json({ ...scrub(shapeVehicle(c.env, row, settings)), images: results.map(i => shapeImage(c.env, i, !!(row.sold_overlay || row.status === 'sold'))) });
});

// GET /api/public/reviews — approved only
pub.get('/reviews', async c => {
  const d = await dealerFor(c);
  const { results } = await c.env.DB.prepare("SELECT id, customer_name, rating, review_text, created_at FROM reviews WHERE dealer_id = ? AND status = 'approved' ORDER BY created_at DESC").bind(d.id).all();
  return c.json(results);
});

function scrub(v) {
  const { vin, prev_price, external_ref, dealer_id, ...rest } = v;
  return rest;
}

export default pub;
