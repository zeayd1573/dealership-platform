// Per-dealer connections to an outside stock source, and the importer that reads them.
//
// Deliberately provider-agnostic. A provider is just an object with a fetchStock()
// that returns normalised vehicles. Adding DoneDeal later means writing one adapter,
// not touching anything in here.

const enc = new TextEncoder();
const dec = new TextDecoder();

/* ── Credentials ──────────────────────────────────────────────────────────
   Stored encrypted with AES-GCM under a key derived from the Worker's
   JWT_SECRET, so a copy of the database on its own is not enough to use them.
   Nothing here is ever returned by an API response.                        */

async function aesKey(env) {
  const secret = env.CRED_SECRET || env.JWT_SECRET;
  if (!secret) throw new Error('No CRED_SECRET or JWT_SECRET set; cannot store credentials');
  const raw = await crypto.subtle.digest('SHA-256', enc.encode('dealer-integrations:' + secret));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptCredential(env, plain) {
  if (!plain) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(env), enc.encode(plain));
  const out = new Uint8Array(iv.length + buf.byteLength);
  out.set(iv, 0); out.set(new Uint8Array(buf), iv.length);
  return btoa(String.fromCharCode(...out));
}

export async function decryptCredential(env, stored) {
  if (!stored) return null;
  try {
    const bytes = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
    const iv = bytes.slice(0, 12);
    const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await aesKey(env), bytes.slice(12));
    return dec.decode(buf);
  } catch {
    return null;   // wrong key, or the secret was rotated
  }
}

/** The row, with the credential replaced by a boolean. Safe to return to the admin. */
export function shapeIntegration(row) {
  if (!row) return null;
  const { credential, ...rest } = row;
  return {
    ...rest,
    has_credential: !!credential,
    auto_sync: !!row.auto_sync,
    last_result: row.last_result ? JSON.parse(row.last_result) : null
  };
}

export async function getIntegration(env, dealerId, provider) {
  return env.DB.prepare('SELECT * FROM dealer_integrations WHERE dealer_id = ? AND provider = ?')
    .bind(dealerId, provider).first();
}

/* ── Providers ────────────────────────────────────────────────────────────
   Each returns { vehicles: [...] } already normalised to our field names.
   `fixture` reads a JSON URL and exists so the whole pipeline can be tested
   without waiting on anybody's API access.                                 */

/**
 * A dealer types the feed URL, so the Worker must not be turned into a proxy for
 * internal addresses, nor send the stored credential to a host of their choosing.
 * In development http on localhost is allowed so the fixture can be tested.
 */
export function assertSafeFeedUrl(env, raw) {
  let u;
  try { u = new URL(raw); } catch { throw new Error('That is not a valid URL'); }
  const dev = (env.ENVIRONMENT || '') === 'development' || env.ALLOW_LOCAL_FEEDS === '1';
  if (u.protocol !== 'https:' && !(dev && u.protocol === 'http:')) throw new Error('The feed URL must start with https://');
  const h = u.hostname.toLowerCase();
  const privateHost =
    h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    h === '::1' || h === '[::1]' || h.startsWith('[fd') || h.startsWith('[fe80');
  if (privateHost && !dev) throw new Error('The feed URL must be a public address');
  return u.toString();
}

export const PROVIDERS = {
  fixture: {
    label: 'Test feed',
    // A plain JSON array of vehicles at a URL. Used to prove the importer works.
    async fetchStock(env, integ, credential) {
      if (!integ.account_ref) throw new Error('Set the feed URL in the account reference field');
      const url = assertSafeFeedUrl(env, integ.account_ref);
      const res = await fetch(url, { redirect: 'error', headers: credential ? { authorization: `Bearer ${credential}` } : {} });
      if (!res.ok) throw new Error(`Feed returned ${res.status}`);
      const body = await res.json();
      const list = Array.isArray(body) ? body : (body.vehicles || []);
      return { vehicles: list.map(normalise) };
    }
  }
  // donedeal: written once they send the specification. See docs/donedeal-integration-plan.md
};

/** Map whatever a provider gives us onto our own column names. */
function normalise(v) {
  const num = x => { const n = parseFloat(String(x ?? '').replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? n : null; };
  return {
    external_ref: String(v.external_ref ?? v.id ?? v.ref ?? '').trim() || null,
    reg: String(v.reg ?? v.registration ?? '').toUpperCase().replace(/\s+/g, '') || null,
    make: v.make ?? null, model: v.model ?? null, variant: v.variant ?? v.trim ?? null,
    year: v.year ? parseInt(v.year, 10) : null,
    mileage: v.mileage != null ? Math.round(num(v.mileage)) : null,
    price: v.price != null ? num(v.price) : null,
    colour: v.colour ?? v.color ?? null,
    fuel_type: v.fuel_type ?? v.fuel ?? null,
    transmission: v.transmission ?? v.gearbox ?? null,
    body_style: v.body_style ?? v.body ?? null,
    engine_size: v.engine_size ?? null,
    doors: v.doors ?? null, seats: v.seats ?? null, owners: v.owners ?? null, co2: v.co2 ?? null,
    description: v.description ?? null,
    features: Array.isArray(v.features) ? v.features.join(', ') : (v.features ?? null),
    images: Array.isArray(v.images) ? v.images.filter(Boolean) : []
  };
}

/* ── The importer ─────────────────────────────────────────────────────────
   Matches on external_ref, which is what the provider calls the car. Cars the
   feed no longer lists are paused rather than deleted, because a feed hiccup
   must never wipe a dealer's stock.                                         */

const SYNCED = ['reg', 'make', 'model', 'variant', 'year', 'mileage', 'price', 'colour',
  'fuel_type', 'transmission', 'body_style', 'engine_size', 'doors', 'seats', 'owners',
  'co2', 'description', 'features'];

export async function runSync(env, dealerId, provider, { dryRun = false } = {}) {
  const started = new Date().toISOString();
  const integ = await getIntegration(env, dealerId, provider);
  if (!integ) throw new Error('That provider is not connected');
  if (integ.status === 'revoked') throw new Error('Access to this provider has been revoked');

  const impl = PROVIDERS[provider];
  if (!impl) throw new Error(`No adapter for ${provider} yet`);

  const credential = await decryptCredential(env, integ.credential);
  const { vehicles } = await impl.fetchStock(env, integ, credential);

  const { results: existing } = await env.DB.prepare(
    'SELECT id, external_ref, status, paused_by_sync FROM vehicles WHERE dealer_id = ? AND source = ?'
  ).bind(dealerId, provider).all();
  const byRef = new Map(existing.filter(r => r.external_ref).map(r => [r.external_ref, r]));

  let added = 0, updated = 0, removed = 0;
  const seen = new Set();

  for (const v of vehicles) {
    if (!v.external_ref || !v.reg) continue;
    seen.add(v.external_ref);
    const cols = SYNCED.filter(k => v[k] !== null && v[k] !== undefined);
    const found = byRef.get(v.external_ref);

    if (dryRun) { found ? updated++ : added++; continue; }

    if (found) {
      await env.DB.prepare(
        `UPDATE vehicles SET ${cols.map(k => `${k} = ?`).join(', ')}, source_synced_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
      ).bind(...cols.map(k => v[k]), found.id).run();
      // Republish only a car that THIS sync paused because it left the feed, and only
      // once it has photos. A new car paused for having none must stay paused.
      if (found.status === 'paused' && found.paused_by_sync) {
        const pics = await env.DB.prepare('SELECT COUNT(*) AS n FROM vehicle_images WHERE vehicle_id = ?').bind(found.id).first('n');
        if (pics > 0) {
          await env.DB.prepare("UPDATE vehicles SET status = 'available', paused_by_sync = 0 WHERE id = ?").bind(found.id).run();
        }
      }
      updated++;
    } else {
      // New cars arrive paused. They have no photos yet, same rule as the admin.
      const keys = [...cols, 'external_ref', 'source', 'status'];
      const vals = [...cols.map(k => v[k]), v.external_ref, provider, 'paused'];
      try {
        await env.DB.prepare(
          `INSERT INTO vehicles (dealer_id, ${keys.join(', ')}, source_synced_at) VALUES (?, ${keys.map(() => '?').join(', ')}, datetime('now'))`
        ).bind(dealerId, ...vals).run();
        added++;
      } catch (err) {
        if (!/UNIQUE/.test(err.message)) throw err;
        // The dealer already had this reg by hand; adopt it rather than duplicating.
        await env.DB.prepare(
          "UPDATE vehicles SET external_ref = ?, source = ?, source_synced_at = datetime('now') WHERE dealer_id = ? AND reg = ?"
        ).bind(v.external_ref, provider, dealerId, v.reg).run();
        updated++;
      }
    }
  }

  // Gone from the feed: pause, never delete.
  for (const [ref, row] of byRef) {
    if (seen.has(ref) || row.status === 'sold') continue;
    if (!dryRun) await env.DB.prepare("UPDATE vehicles SET status = 'paused', paused_by_sync = 1, updated_at = datetime('now') WHERE id = ?").bind(row.id).run();
    removed++;
  }

  const result = { added, updated, removed, total: vehicles.length, dryRun };
  if (!dryRun) {
    await env.DB.batch([
      env.DB.prepare("UPDATE dealer_integrations SET last_sync_at = datetime('now'), last_result = ?, last_error = NULL, status = CASE WHEN status = 'pending' THEN 'active' ELSE status END, updated_at = datetime('now') WHERE dealer_id = ? AND provider = ?")
        .bind(JSON.stringify(result), dealerId, provider),
      env.DB.prepare('INSERT INTO sync_runs (dealer_id, provider, started_at, finished_at, ok, added, updated, removed) VALUES (?, ?, ?, datetime(\'now\'), 1, ?, ?, ?)')
        .bind(dealerId, provider, started, added, updated, removed)
    ]);
  }
  return result;
}

/**
 * Remove everything that came from a provider. The DoneDeal policy requires prompt
 * removal when consent is withdrawn, so this has to be one action, not a chore.
 */
export async function purgeProvider(env, dealerId, provider) {
  const { results } = await env.DB.prepare('SELECT id FROM vehicles WHERE dealer_id = ? AND source = ?')
    .bind(dealerId, provider).all();
  const ids = results.map(r => r.id);
  for (const id of ids) {
    const { results: imgs } = await env.DB.prepare('SELECT key, thumb_key FROM vehicle_images WHERE vehicle_id = ?').bind(id).all();
    await Promise.all(imgs.flatMap(i => [env.BUCKET.delete(i.key), env.BUCKET.delete(i.thumb_key)].filter(Boolean)));
    await env.DB.prepare('DELETE FROM vehicle_images WHERE vehicle_id = ?').bind(id).run();
  }
  if (ids.length) await env.DB.prepare(`DELETE FROM vehicles WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).run();
  await env.DB.prepare("UPDATE dealer_integrations SET status = 'revoked', credential = NULL, last_error = NULL, updated_at = datetime('now') WHERE dealer_id = ? AND provider = ?")
    .bind(dealerId, provider).run();
  return { deleted: ids.length };
}
