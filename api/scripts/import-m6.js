// Imports M6 Motors: dealer record, website content, 10 cars and their photos.
// Usage: node scripts/import-m6.js [http://localhost:8787]
//
// Stock data comes from tools/m6-stock/stock.json (scraped from m6motors.ie).
// Photos come from tools/m6-stock/photos/<REG>/*.jpg (Zeyad's own shoot, pre-resized).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.argv[2] || 'http://localhost:8787';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const STOCK = path.join(root, 'tools', 'm6-stock');
const cars = JSON.parse(fs.readFileSync(path.join(STOCK, 'stock.json'), 'utf8'));

// --- the dealer ------------------------------------------------------------
const DEALER = {
  slug: 'm6motors',
  name: 'M6 Motors',
  phone: '090 964 5801',
  phone_href: '+353909645801',
  whatsapp: '353858622534',
  email: 'sales@m6motors.ie',
  address: "Dolan's Service Station, Athlone Road, Ballinasloe, Co. Galway, H53 K8W2",
  maps_url: 'https://maps.google.com/?q=M6+Motors+Athlone+Road+Ballinasloe+Co+Galway+H53+K8W2',
  hours: [
    ['Monday – Friday', '8.30am – 6.00pm'],
    ['Saturday', '8.30am – 4.00pm'],
    ['Sunday', 'Closed'],
    ['Evenings & Sunday', 'Viewings by appointment']
  ]
};

// --- website copy ----------------------------------------------------------
const SITE = {
  site_title: 'M6 Motors | Used Cars, Ballinasloe, Co. Galway',
  site_description: 'M6 Motors stocks quality used cars, SUVs and commercials on the Athlone Road in Ballinasloe, Co. Galway. Every car photographed in detail, finance arranged, trade-ins welcome.',
  hero_kicker: 'Used cars · Ballinasloe, Co. Galway',
  hero_title: 'Unbeatable quality, prices and service',
  hero_lede: 'A name you can trust.',
  hero_tag_label: 'On the forecourt',
  hero_tag_value: '2019 BMW X5 M Sport',
  hero_image_key: '',
  trust: JSON.stringify([
    ['Seen before you travel', 'Twenty-plus photographs of every car, taken here, not stock images.'],
    ['Finance arranged', 'First Citizen, Bluestone and Alphera. Quick decisions, competitive rates.'],
    ['Trade-ins welcome', 'Bring the old car and we will price it honestly against the new one.'],
    ['Off the M6', 'Five minutes from the motorway at Ballinasloe. Easy run from Galway or Athlone.']
  ]),
  about_kicker: 'About M6 Motors',
  about_title: 'A Galway garage that shows you the whole car.',
  about_text: 'M6 Motors sells quality used cars from Dolan’s Service Station on the Athlone Road in Ballinasloe. We keep a mixed range, mostly German and premium, and we photograph every one of them in detail before it goes up. If a car has a mark on it, you will see it here rather than find it on the forecourt.',
  about_points: 'Premium and family stock, from hatchbacks to seven-seat SUVs\nFinance arranged through First Citizen, Bluestone and Alphera\nFair trade-in prices against anything on the forecourt\nSales, service and aftersales all on the one site',
  about_image_key: '',
  footer_blurb: 'Quality used cars on the Athlone Road in Ballinasloe, Co. Galway. Every car photographed in detail, finance arranged and trade-ins welcome.',
  watermark_on: '1',
  watermark_position: 'br',
  watermark_scope: 'main',
  watermark_opacity: '0.85',
  sold_stamp_on: '1'
};

// Their old site's short ids, so /vehicle?id=<id> can 301 to the new car page.
const SITE_IDS = {
  '191C8009': 'BPvnq', '211G4196': 'P3ner', 'KW75WVJ': 'w89rz', 'OV22DUJ': 'Kdwy1', 'SXZ6714': 'LPabj',
  '241D41233': 'NYr4k', '232T409': 'GreZj', '241T1904': 'oj4lr', 'PN22NVR': 'lpE2d', 'EK25LHC': 'P39DN'
};

// --- helpers ---------------------------------------------------------------
const dmyToIso = s => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s || '')); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
const litres = v => v == null ? null : (Number(v) >= 100 ? (Number(v) / 1000).toFixed(1) : Number(v).toFixed(1));
// The site publishes fuel as "Hybrid Petrol Plug-in"; read that the way a buyer would.
const fuel = s => ({ 'Hybrid Petrol Plug-in': 'Petrol Plug-in Hybrid', 'Hybrid Diesel Plug-in': 'Diesel Plug-in Hybrid', 'Hybrid Petrol': 'Petrol Hybrid', 'Hybrid Diesel': 'Diesel Hybrid' })[s] || s;

const user = process.env.ADMIN_USER || 'admin';
const pass = process.env.ADMIN_PASS;
if (!pass) { console.error('Set ADMIN_PASS in the environment, e.g.  ADMIN_PASS=... node ' + process.argv[1].split('/').pop()); process.exit(1); }
const login = await (await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) })).json();
if (!login.token) { console.error('Login failed:', login); process.exit(1); }
const H = { Authorization: `Bearer ${login.token}` };
const J = { ...H, 'Content-Type': 'application/json' };

// --- 1. dealer -------------------------------------------------------------
const dres = await fetch(`${BASE}/api/dealer`, { method: 'PATCH', headers: J, body: JSON.stringify(DEALER) });
console.log(dres.ok ? `dealer  → ${DEALER.name}` : `dealer  ! ${dres.status} ${await dres.text()}`);

// --- 2. website content ----------------------------------------------------
const sres = await fetch(`${BASE}/api/site`, { method: 'PATCH', headers: J, body: JSON.stringify(SITE) });
console.log(sres.ok ? 'content → saved' : `content ! ${sres.status} ${await sres.text()}`);

// --- 3. cars ---------------------------------------------------------------
const existing = await (await fetch(`${BASE}/api/vehicles`, { headers: H })).json();
const byReg = new Map((Array.isArray(existing) ? existing : []).map(v => [v.reg, v]));

const BATCH = 2;   // the free plan's CPU cap means photos go up two at a time
async function uploadPhotos(vid, dir) {
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /\.jpe?g$/i.test(f)).sort() : [];
  let done = 0;
  for (let i = 0; i < files.length; i += BATCH) {
    const slice = files.slice(i, i + BATCH);
    const fd = new FormData();
    for (const f of slice) fd.append('images', new Blob([fs.readFileSync(path.join(dir, f))], { type: 'image/jpeg' }), f);
    let ok = false;
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      const r = await fetch(`${BASE}/api/vehicles/${vid}/images`, { method: 'POST', headers: H, body: fd }).catch(e => ({ ok: false, text: async () => e.message }));
      if (r.ok) { ok = true; done += slice.length; }
      else { await new Promise(s => setTimeout(s, 900 * (attempt + 1))); }
    }
    if (!ok) console.log(`    ! photo batch failed (${slice.join(', ')})`);
  }
  return done;
}

let added = 0, photos = 0;
for (const c of cars) {
  const body = {
    reg: c.reg, make: c.make, model: c.model, variant: c.variant,
    year: c.year, mileage: c.mileage, price: c.price,
    colour: c.colour, fuel_type: fuel(c.fuel_type), transmission: c.transmission,
    body_style: c.body_style, engine_size: litres(c.engine_size),
    doors: c.doors, seats: c.seats, owners: c.owners, co2: c.co2,
    nct_expiry: dmyToIso(c.nct_expiry),
    tax_due: dmyToIso(c.road_tax),        // the site publishes a tax expiry date, not an amount
    description: c.description,
    features: c.features,
    status: 'available',
    external_ref: SITE_IDS[c.reg] || null
  };
  let v = byReg.get(c.reg);
  if (v) {
    await fetch(`${BASE}/api/vehicles/${v.id}`, { method: 'PATCH', headers: J, body: JSON.stringify(body) });
    console.log(`  = ${c.reg.padEnd(10)} ${c.year} ${c.make} ${c.model}`);
  } else {
    const r = await fetch(`${BASE}/api/vehicles`, { method: 'POST', headers: J, body: JSON.stringify(body) });
    if (!r.ok) { console.log(`  ! ${c.reg}: ${r.status} ${await r.text()}`); continue; }
    v = await r.json(); added++;
    console.log(`  + ${c.reg.padEnd(10)} ${c.year} ${c.make} ${c.model}  €${c.price.toLocaleString('en-IE')}`);
  }
  if (!v.photo_count) photos += await uploadPhotos(v.id, path.join(STOCK, 'photos', c.reg));
}

// Make the two best-looking cars the homepage features.
for (const reg of ['191C8009', 'KW75WVJ']) {
  const all = await (await fetch(`${BASE}/api/vehicles`, { headers: H })).json();
  const v = all.find(x => x.reg === reg);
  if (v) await fetch(`${BASE}/api/vehicles/${v.id}`, { method: 'PATCH', headers: J, body: JSON.stringify({ is_highlighted: true }) });
}

console.log(`\ndone: ${cars.length} cars (${added} new), ${photos} photos uploaded`);
