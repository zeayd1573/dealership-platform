// Reviews, finance settings, highlighted toggle, reg lookup.
import { Hono } from 'hono';
import { requireAuth } from '../lib/auth.js';
import { getDefaultDealer, getSettings, repayment, shapeVehicle, VEHICLE_SELECT } from '../lib/util.js';

/* ── Reviews (mounted at /api/reviews) ─────────────── */
export const reviews = new Hono();

// POST /api/reviews — public
reviews.post('/', async c => {
  const { customer_name, rating, review_text } = await c.req.json().catch(() => ({}));
  const r = parseInt(rating, 10);
  if (!customer_name || !(r >= 1 && r <= 5)) return c.json({ error: 'customer_name and a rating from 1 to 5 are required' }, 400);
  const dealer = await getDefaultDealer(c.env);
  const row = await c.env.DB.prepare("INSERT INTO reviews (dealer_id, customer_name, rating, review_text, status) VALUES (?, ?, ?, ?, 'pending') RETURNING *").bind(dealer.id, String(customer_name).trim(), r, review_text || null).first();
  return c.json(row, 201);
});
reviews.use('*', requireAuth());
reviews.get('/', async c => {
  const { results } = await c.env.DB.prepare('SELECT * FROM reviews WHERE dealer_id = ? ORDER BY created_at DESC').bind(c.get('dealerId')).all();
  return c.json(results);
});
reviews.patch('/:id', async c => {
  const { status } = await c.req.json().catch(() => ({}));
  if (!['approved', 'rejected', 'pending'].includes(status)) return c.json({ error: 'status must be approved, rejected, or pending' }, 400);
  const row = await c.env.DB.prepare('UPDATE reviews SET status = ? WHERE id = ? AND dealer_id = ? RETURNING *').bind(status, c.req.param('id'), c.get('dealerId')).first();
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json(row);
});
reviews.delete('/:id', async c => {
  const res = await c.env.DB.prepare('DELETE FROM reviews WHERE id = ? AND dealer_id = ?').bind(c.req.param('id'), c.get('dealerId')).run();
  if (!res.meta.changes) return c.json({ error: 'Not found' }, 404);
  return c.json({ success: true });
});

/* ── Finance settings (mounted at /api/finance) ────── */
export const finance = new Hono();

// GET /api/finance/calculate?price=X — public
finance.get('/calculate', async c => {
  const price = parseFloat(c.req.query('price'));
  if (!(price > 0)) return c.json({ error: 'price must be a positive number' }, 400);
  const dealer = await getDefaultDealer(c.env);
  const s = await getSettings(c.env, dealer.id);
  const { monthly, weekly } = repayment(price, s);
  const deposit = Math.round(price * s.deposit_pct) / 100;
  return c.json({ price, apr: s.apr, term_months: s.term_months, deposit_pct: s.deposit_pct, deposit_amount: deposit, loan_amount: Math.round((price - deposit) * 100) / 100, monthly_payment: monthly, weekly_payment: weekly, total_repayable: monthly * s.term_months + deposit });
});
finance.use('*', requireAuth());
finance.get('/', async c => c.json(await getSettings(c.env, c.get('dealerId'))));
finance.patch('/', async c => {
  const b = await c.req.json().catch(() => ({}));
  const apr = b.apr != null ? parseFloat(b.apr) : null, term = b.term_months != null ? parseInt(b.term_months, 10) : null, dep = b.deposit_pct != null ? parseFloat(b.deposit_pct) : null;
  if ((apr != null && !(apr >= 0 && apr < 100)) || (term != null && !(term >= 6 && term <= 120)) || (dep != null && !(dep >= 0 && dep < 100))) return c.json({ error: 'Invalid finance settings' }, 400);
  const row = await c.env.DB.prepare(`INSERT INTO finance_settings (dealer_id, apr, term_months, deposit_pct, updated_at) VALUES (?, COALESCE(?, 6.9), COALESCE(?, 60), COALESCE(?, 10), datetime('now'))
    ON CONFLICT(dealer_id) DO UPDATE SET apr = COALESCE(excluded.apr, apr), term_months = COALESCE(excluded.term_months, term_months), deposit_pct = COALESCE(excluded.deposit_pct, deposit_pct), updated_at = datetime('now') RETURNING *`)
    .bind(c.get('dealerId'), apr, term, dep).first();
  return c.json(row);
});

/* ── Highlighted (mounted at /api/highlighted) ─────── */
export const highlighted = new Hono();
highlighted.use('*', requireAuth());
highlighted.get('/', async c => {
  const dealerId = c.get('dealerId');
  const { results } = await c.env.DB.prepare(`SELECT ${VEHICLE_SELECT} FROM vehicles v WHERE v.dealer_id = ? AND v.is_highlighted = 1 AND v.status != 'archived' ORDER BY v.created_at DESC`).bind(dealerId).all();
  const s = await getSettings(c.env, dealerId);
  return c.json(results.map(r => shapeVehicle(c.env, r, s)));
});
highlighted.patch('/:id', async c => {
  const { highlighted: on } = await c.req.json().catch(() => ({}));
  if (typeof on !== 'boolean') return c.json({ error: 'highlighted must be a boolean' }, 400);
  const row = await c.env.DB.prepare("UPDATE vehicles SET is_highlighted = ?, updated_at = datetime('now') WHERE id = ? AND dealer_id = ? RETURNING *").bind(on ? 1 : 0, c.req.param('id'), c.get('dealerId')).first();
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json(shapeVehicle(c.env, row));
});

/* ── Reg lookup (mounted at /api/reg) ──────────────── */
export const reg = new Hono();
reg.use('*', requireAuth());

const xmlVal = (xml, tag) => { const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i')); return m ? m[1].trim() : ''; };
const xmlTextVal = (xml, tag) => { const b = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i')); if (!b) return ''; const t = b[1].match(/<CurrentTextValue[^>]*>([^<]*)<\/CurrentTextValue>/i); return t ? t[1].trim() : ''; };
const tv = f => !f ? '' : typeof f === 'string' ? f : typeof f === 'object' ? (f.CurrentTextValue || f.CurrentValue || '') : String(f);

// Irish plates: 2–3 digit year, 1–2 letter county, 1–6 digit sequence (e.g. 181WH1021, 231D23860).
const isIrishPlate = p => /^\d{2,3}[A-Z]{1,2}\d{1,6}$/.test(p);

// GET /api/reg/:plate?country=ie|uk   (country is inferred from the plate format when omitted)
reg.get('/:plate', async c => {
  const plate = c.req.param('plate').toUpperCase().replace(/[\s-]/g, '');
  const country = (c.req.query('country') || (isIrishPlate(plate) ? 'ie' : 'uk')).toLowerCase();
  const op = country === 'ie' ? 'CheckIreland' : 'Check';
  const username = c.env.REG_USERNAME;
  if (!username) {
    return c.json({ mock: true, country, make: 'BMW', model: '3 Series', year: '2021', colour: 'Black', fuel_type: 'Diesel', engine_size: '2.0', body_style: 'Saloon', transmission: 'Automatic', variant: '320d M Sport', doors: '4', seats: '5', vin: '' });
  }
  const url = `https://www.regcheck.org.uk/api/reg.asmx/${op}?RegistrationNumber=${encodeURIComponent(plate)}&username=${encodeURIComponent(username)}`;
  const res = await fetch(url, { headers: { Accept: 'text/xml' } });
  const xml = await res.text();
  if (!res.ok) {
    const msg = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return c.json({ error: /out of credit/i.test(msg) ? 'The reg lookup account is out of credit. Top it up at regcheck.org.uk and try again.' : `Reg lookup failed: ${msg.slice(0, 160) || res.status}` }, 502);
  }
  // RegCheck returns plain text (e.g. "Your username is incorrect") or a SOAP fault on failure.
  if (!/<vehicleData/i.test(xml)) {
    const msg = (xml.match(/<faultstring>([\s\S]*?)<\/faultstring>/i) || [])[1] || xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || 'lookup service returned an error';
    return c.json({ error: msg.slice(0, 200) }, 502);
  }
  let vehicle = {};
  const jm = xml.match(/<vehicleJson[^>]*>([\s\S]*?)<\/vehicleJson>/i);
  if (jm && jm[1].trim()) { try { vehicle = JSON.parse(jm[1].trim().replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')); } catch {} }
  // Tidy the service's ALL-CAPS values: "HYUNDAI" -> "Hyundai", keep acronyms like BMW, MPV, SUV.
  const KEEP = new Set(['BMW', 'MG', 'DS', 'KIA', 'SUV', 'MPV', 'VW', 'CLA', 'CLS', 'GLA', 'GLC', 'SQ7', 'RS', 'GTI', 'TDI', 'TSI', 'HDI', 'AMG', 'ID3', 'ID4', 'ID5', 'CRV', 'HRV', 'XC40', 'XC60', 'XC90']);
  const nice = s => String(s || '').trim().split(/\s+/).map(w => KEEP.has(w.toUpperCase()) ? w.toUpperCase() : /^[A-Z0-9-]+$/.test(w) && w.length > 1 ? w[0] + w.slice(1).toLowerCase() : w).join(' ');
  const litres = s => { const n = parseInt(String(s || '').replace(/[^0-9]/g, ''), 10); return n >= 500 ? (n / 1000).toFixed(1) + 'L' : String(s || '').trim(); }; // "1685" / "1968cc" -> "1.7L" / "2.0L"
  const num = s => { const n = parseInt(s, 10); return n > 0 ? String(n) : ''; };
  const out = {
    mock: false, country, plate,
    make: nice(tv(vehicle.CarMake) || xmlTextVal(xml, 'CarMake') || xmlVal(xml, 'MakeDescription')),
    model: nice(tv(vehicle.CarModel) || xmlVal(xml, 'CarModel') || xmlVal(xml, 'ModelDescription')),
    year: tv(vehicle.RegistrationYear) || xmlVal(xml, 'RegistrationYear'),
    colour: nice(tv(vehicle.Colour) || tv(vehicle.Color)),
    fuel_type: nice(tv(vehicle.FuelType) || xmlTextVal(xml, 'FuelType')),
    engine_size: litres(tv(vehicle.EngineSize) || xmlTextVal(xml, 'EngineSize')),
    body_style: nice(tv(vehicle.BodyStyle) || xmlTextVal(xml, 'BodyStyle')),
    transmission: nice(tv(vehicle.Transmission) || xmlTextVal(xml, 'Transmission')),
    doors: num(tv(vehicle.NumberOfDoors) || xmlTextVal(xml, 'NumberOfDoors')),
    seats: num(tv(vehicle.NumberOfSeats) || xmlTextVal(xml, 'NumberOfSeats')),
    variant: (tv(vehicle.Description) || xmlVal(xml, 'Description')).trim(),
    vin: tv(vehicle.VIN) || tv(vehicle.Vin) || tv(vehicle.VinNumber) || vehicle.vin || '',
    indicative_value: tv(vehicle.IndicativeValue) || xmlVal(xml, 'IndicativeValue') || ''
  };
  if (!out.make && !out.model && !out.year) return c.json({ error: 'Registration not found' }, 404);
  return c.json(out);
});
