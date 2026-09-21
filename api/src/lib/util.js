// Shared helpers: vehicle shaping, image URLs, finance maths, validation.

export const VEHICLE_FIELDS = [
  'reg', 'make', 'model', 'variant', 'year', 'colour', 'colour_description', 'fuel_type', 'engine_size',
  'body_style', 'transmission', 'mileage', 'price', 'prev_price', 'description', 'features', 'status',
  'nct_expiry', 'tax_due', 'vin', 'youtube_link', 'is_highlighted', 'is_commercial', 'doors', 'seats',
  'owners', 'co2', 'max_power', 'fuel_economy', 'seat_belts', 'road_tax', 'warranty_type',
  'warranty_duration', 'external_ref', 'sold_overlay'
];
const INT_FIELDS = new Set(['year', 'mileage', 'doors', 'seats', 'owners', 'co2', 'max_power', 'seat_belts', 'is_highlighted', 'is_commercial', 'sold_overlay']);
const NUM_FIELDS = new Set(['price', 'prev_price', 'road_tax']);
export const STATUSES = new Set(['available', 'paused', 'reserved', 'sold', 'archived']);

/** Pick and coerce allowed vehicle fields from a request body. */
export function pickVehicleFields(body, { forCreate = false } = {}) {
  const out = {};
  for (const k of VEHICLE_FIELDS) {
    if (!(k in body)) continue;
    let v = body[k];
    if (v === '' || v === undefined) v = null;
    if (v !== null) {
      if (INT_FIELDS.has(k)) v = typeof v === 'boolean' ? (v ? 1 : 0) : parseInt(v, 10);
      else if (NUM_FIELDS.has(k)) v = parseFloat(v);
      else if (k === 'reg') v = String(v).toUpperCase().replace(/\s+/g, '');
      else if (k === 'features' && Array.isArray(v)) v = v.join(', ');
      else v = String(v);
      if ((INT_FIELDS.has(k) || NUM_FIELDS.has(k)) && Number.isNaN(v)) v = null;
    }
    out[k] = v;
  }
  if (out.status && !STATUSES.has(out.status)) delete out.status;
  if (forCreate && !out.status) out.status = 'available';
  return out;
}

export function imageUrl(env, key, { sold = false } = {}) {
  if (!key) return null;
  const base = (env.PUBLIC_IMAGE_BASE || '/api/files').replace(/\/$/, '');
  // Vehicle photos carry a version so browsers refetch when branding or the SOLD stamp changes.
  const q = key.startsWith('vehicles/') ? `?v=${env.IMG_VER || 1}${sold ? '&s=1' : ''}` : '';
  return `${base}/${key}${q}`;
}

/** Add url/thumb_url to image rows. */
export function shapeImage(env, row, sold = false) {
  return { id: row.id, vehicle_id: row.vehicle_id, url: imageUrl(env, row.key, { sold }), thumb_url: imageUrl(env, row.thumb_key, { sold }), is_primary: !!row.is_primary, sort_order: row.sort_order, created_at: row.created_at };
}

/** Standard amortised repayment. Returns { monthly, weekly } rounded to whole euro, or nulls. */
export function repayment(price, settings) {
  if (!price || price <= 0 || !settings) return { monthly: null, weekly: null };
  const loan = price * (1 - (settings.deposit_pct || 0) / 100);
  const r = (settings.apr || 0) / 1200; const n = settings.term_months || 60;
  const monthly = r ? loan * r / (1 - Math.pow(1 + r, -n)) : loan / n;
  return { monthly: Math.round(monthly), weekly: Math.round(monthly * 12 / 52) };
}

/** Vehicle row -> API object (booleans, image urls, finance). */
export function shapeVehicle(env, row, settings) {
  if (!row) return null;
  const v = { ...row };
  v.is_highlighted = !!v.is_highlighted; v.is_commercial = !!v.is_commercial; v.sold_overlay = !!v.sold_overlay;
  const sold = v.sold_overlay || v.status === 'sold';
  if ('primary_key' in v) { v.primary_image = imageUrl(env, v.primary_key, { sold }); v.primary_thumb = imageUrl(env, v.primary_thumb_key, { sold }); delete v.primary_key; delete v.primary_thumb_key; }
  if (settings) Object.assign(v, repayment(v.price, settings));
  return v;
}

/** SELECT fragment that adds primary image keys + photo count to a vehicles query aliased as v. */
export const VEHICLE_SELECT = `
  v.*,
  (SELECT key FROM vehicle_images WHERE vehicle_id = v.id ORDER BY is_primary DESC, sort_order, id LIMIT 1) AS primary_key,
  (SELECT thumb_key FROM vehicle_images WHERE vehicle_id = v.id ORDER BY is_primary DESC, sort_order, id LIMIT 1) AS primary_thumb_key,
  (SELECT COUNT(*) FROM vehicle_images WHERE vehicle_id = v.id) AS photo_count`;

export async function getSettings(env, dealerId) {
  return (await env.DB.prepare('SELECT * FROM finance_settings WHERE dealer_id = ?').bind(dealerId).first()) || { apr: 6.9, term_months: 60, deposit_pct: 10 };
}

export async function getDefaultDealer(env) {
  return env.DB.prepare('SELECT * FROM dealers WHERE slug = ?').bind(env.DEFAULT_DEALER_SLUG || 'mhlmotors').first();
}

export const isSold = v => !!(v && (v.sold_overlay || v.status === 'sold'));
export const isEmail = s => /^\S+@\S+\.\S+$/.test(String(s || ''));
