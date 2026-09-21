// Imports the scraped MHL stock (tools/mhl-stock) through the real API.
// Usage: node scripts/import-mhl.js [http://localhost:8787]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.argv[2] || 'http://localhost:8787';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const STOCK = path.join(root, 'tools', 'mhl-stock');
const { cars } = JSON.parse(fs.readFileSync(path.join(STOCK, 'stock.json'), 'utf8'));

// Regs taken from MHL's finance page vehicle picker (year - model - make - price - reg)
const REGS = { 4478958: '151DL4069', 4542648: '151DL6094', 4327467: '171MN1685', 4353180: '171SO84', 4542687: '171D63350', 4478920: '171D7293', 4553716: '171D56428', 4502293: '171DL938', 4542836: '171WW1554', 4537473: '181DL3887', 4486277: '182G2746', 4470992: '181WH1347', 4537469: '181WH1021', 4545529: '191D21545', 4470330: '191G201', 4542637: '191MH2348', 4542833: '221D21713', 4553797: '231D23860', 4526046: '231L2509', 4473482: '251OY943' };

const num = s => { const n = parseFloat(String(s ?? '').replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? n : null; };
const monthToIso = s => { const m = /^(\d{2})\/(\d{4})$/.exec(String(s || '')); return m ? `${m[2]}-${m[1]}-01` : null; };

const user = process.env.ADMIN_USER || 'admin', pass = process.env.ADMIN_PASS || 'mhl-admin-2026';
const login = await (await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) })).json();
if (!login.token) { console.error('login failed', login); process.exit(1); }
const H = { Authorization: `Bearer ${login.token}` };

const existing = await (await fetch(`${BASE}/api/vehicles`, { headers: H })).json();
const byRef = new Map(existing.map(v => [v.external_ref, v]));

let created = 0, skipped = 0, photos = 0, failed = 0;
const BATCH = 2;
async function uploadBatch(vid, files) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const fd = new FormData();
    for (const f of files) fd.append('images', new File([fs.readFileSync(f)], path.basename(f), { type: 'image/jpeg' }));
    const up = await fetch(`${BASE}/api/vehicles/${vid}/images`, { method: 'POST', headers: H, body: fd }).catch(e => ({ ok: false, status: 0, text: async () => e.message }));
    if (up.ok) return (await up.json()).length;
    const msg = (await up.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
    console.error(`  upload attempt ${attempt} failed (${up.status}): ${msg}`);
    await new Promise(r => setTimeout(r, 1500 * attempt));
  }
  return -1;
}
for (const c of cars) {
  let v = byRef.get(String(c.id));
  if (!v) {
    const body = {
      reg: REGS[c.id] || `${String(c.year).slice(2)}TBC${String(c.id).slice(-4)}`,
      make: c.make, model: c.model, variant: c.variant, year: c.year, colour: c.colour,
      fuel_type: c.fuel, engine_size: c.engine, body_style: c.body, transmission: c.trans,
      mileage: c.km, price: c.price, description: c.blurb, features: c.featureList,
      nct_expiry: monthToIso(c.nct), tax_due: monthToIso(c.taxDue),
      doors: c.doors, seats: num(c.seats), owners: num(c.owners), max_power: num(c.bhp), road_tax: num(c.tax),
      is_commercial: /van|pickup/i.test(c.body) ? 1 : 0, status: 'available', external_ref: String(c.id)
    };
    const res = await fetch(`${BASE}/api/vehicles`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    v = await res.json();
    if (!res.ok) { console.error('create failed', c.name, v); failed++; continue; }
    created++;
  } else skipped++;
  const files = c.photos.map(p => path.join(STOCK, p.replace(/^img\/cars\//, 'photos/'))).filter(f => fs.existsSync(f));
  const have = v.photo_count || 0;
  const todo = files.slice(have);
  if (!todo.length) { process.stdout.write(`${c.name} -> #${v.id} (complete, ${have} photos)\n`); continue; }
  let done = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const n = await uploadBatch(v.id, todo.slice(i, i + BATCH));
    if (n < 0) { failed++; break; }
    done += n;
  }
  photos += done;
  process.stdout.write(`${c.name} -> #${v.id} (${have} had, ${done}/${todo.length} added)\n`);
}
console.log(`done: ${created} created, ${skipped} existing, ${photos} photos uploaded, ${failed} failures`);
