// Upload a folder of photos to a vehicle through the API, optionally replacing what's there.
// Usage: node tools/upload-photos.mjs <base-url> <vehicle-id> <folder> [--replace]
//   e.g. node tools/upload-photos.mjs http://localhost:8787 4 /tmp/mhl-shoot/sq7 --replace
import fs from 'node:fs';
import path from 'node:path';

const [BASE, VID, DIR] = process.argv.slice(2);
const REPLACE = process.argv.includes('--replace');
if (!BASE || !VID || !DIR) { console.error('usage: node tools/upload-photos.mjs <base-url> <vehicle-id> <folder> [--replace]'); process.exit(1); }
const user = process.env.ADMIN_USER || 'admin', pass = process.env.ADMIN_PASS || 'mhl-admin-2026';

const login = await (await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) })).json();
if (!login.token) { console.error('login failed', login); process.exit(1); }
const H = { Authorization: `Bearer ${login.token}` };

const v = await (await fetch(`${BASE}/api/vehicles/${VID}`, { headers: H })).json();
if (!v.id) { console.error('vehicle not found', v); process.exit(1); }
console.log(`${v.year} ${v.make} ${v.model} (#${v.id}, ${v.reg}) — currently ${v.images.length} photos`);

if (REPLACE && v.images.length) {
  for (const im of v.images) await fetch(`${BASE}/api/images/${im.id}`, { method: 'DELETE', headers: H });
  console.log(`  removed ${v.images.length} old photos`);
}

const files = fs.readdirSync(DIR).filter(f => /\.(jpe?g|png|webp)$/i.test(f)).sort().map(f => path.join(DIR, f));
let done = 0;
for (let i = 0; i < files.length; i += 2) {
  const batch = files.slice(i, i + 2);
  let ok = false;
  for (let attempt = 1; attempt <= 4 && !ok; attempt++) {
    const fd = new FormData();
    for (const f of batch) fd.append('images', new File([fs.readFileSync(f)], path.basename(f), { type: 'image/jpeg' }));
    const res = await fetch(`${BASE}/api/vehicles/${VID}/images`, { method: 'POST', headers: H, body: fd }).catch(e => ({ ok: false, status: 0, text: async () => e.message }));
    if (res.ok) { ok = true; done += batch.length; }
    else { console.error(`  attempt ${attempt} failed (${res.status}): ${(await res.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)}`); await new Promise(r => setTimeout(r, 1500 * attempt)); }
  }
  if (!ok) { console.error('  giving up on', batch.map(f => path.basename(f)).join(', ')); }
}
console.log(`  uploaded ${done}/${files.length} new photos`);
