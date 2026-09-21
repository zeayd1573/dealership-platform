// Bundles the public site and the admin panel into api/dist for the Worker's static assets.
// Public site at /, admin at /admin/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dist = path.join(root, 'api', 'dist');
fs.rmSync(dist, { recursive: true, force: true });
const copy = (from, to, skip = () => false) => {
  for (const ent of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, ent.name), d = path.join(to, ent.name);
    if (skip(path.relative(root, s))) continue;
    if (ent.isDirectory()) { fs.mkdirSync(d, { recursive: true }); copy(s, d, skip); }
    else { fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(s, d); }
  }
};
copy(path.join(root, 'site'), dist, rel => /serve\.json$/.test(rel));
copy(path.join(root, 'admin'), path.join(dist, 'admin'), rel => /serve\.json$/.test(rel));
const count = dir => fs.readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? count(path.join(dir, e.name)) : 1), 0);
console.log(`built ${dist}: ${count(dist)} files`);
