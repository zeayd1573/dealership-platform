/* =====================================================
   M6 MOTORS — SHARED SITE LOGIC
   Data source is data/stock.json for now; swap `loadStock`
   to the platform API when the backend is wired up.
   ===================================================== */

// API base: same origin when served by the Worker (port 8787 / production), otherwise the local dev API.
const API_BASE = window.API_BASE ?? (location.port === '8787' || !/^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? '' : 'http://localhost:8787');
const API = API_BASE + '/api';
window.API = API;
const SAVED_KEY = 'm6_saved_cars';
let DEFAULT_APR = 6.9;

/* ── Icons (inline SVG, 24x24 viewBox) ───────────── */
const ICONS = {
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.9 2z"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.4-.5c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.2-.3-.3-.6-.4zM12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2z"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  chevL: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
  chevR: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 7L2 7"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>',
  euro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h12M4 14h9"/><path d="M19 6a7.5 7.5 0 0 0-11 0 7.9 7.9 0 0 0 0 12 7.5 7.5 0 0 0 11 0"/></svg>',
  swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
  gauge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 14l4-6"/><path d="M3.5 17a9 9 0 1 1 17 0"/></svg>',
  fuel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 22V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/><path d="M3 22h12M6 10h6"/><path d="M15 9h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0v-7l-3-3"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  car: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17h-2v-5l2-5h14l2 5v5h-2"/><path d="M5 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0M15 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0"/><path d="M3 12h18"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  palette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12a4 4 0 0 1 8 0"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="9" r="1"/></svg>',
  door: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14"/><path d="M2 20h20"/><path d="M14 12v.01"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></svg>',
  cert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.5 13 17 22l-5-3-5 3 1.5-9"/></svg>',
  engine: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10h2v6H3zM19 10h2v6h-2z"/><rect x="5" y="8" width="14" height="10" rx="2"/><path d="M9 8V5h6v3M12 13v.01"/></svg>',
  tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><path d="M7 7h.01"/></svg>'
};
window.ICONS = ICONS;

/* ── Helpers ──────────────────────────────────────── */
const fmt = {
  eur: n => n == null || n === '' ? 'POA' : '€' + Number(n).toLocaleString('en-IE'),
  km: n => Number(n).toLocaleString('en-IE') + ' km',
  esc: s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
};
window.fmt = fmt;

/* ── API → template shape ─────────────────────────── */
const monthLabel = iso => { const m = /^(\d{4})-(\d{2})/.exec(iso || ''); return m ? `${m[2]}/${m[1]}` : (iso || ''); };
function normalizeVehicle(v) {
  const images = v.images || [];
  return {
    id: v.id, name: [v.year, v.make, v.model].filter(Boolean).join(' '), make: v.make, model: v.model, year: v.year,
    price: v.price, weekly: v.weekly, monthly: v.monthly, variant: v.variant || '',
    body: v.body_style, colour: v.colour, doors: v.doors, engine: v.engine_size, fuel: v.fuel_type,
    km: v.mileage, nct: monthLabel(v.nct_expiry), owners: v.owners ? `${v.owners} Owner${v.owners > 1 ? 's' : ''}` : '',
    trans: v.transmission, seats: v.seats, tax: v.road_tax ? '€' + Number(v.road_tax).toLocaleString('en-IE') : '',
    bhp: v.max_power ? `${v.max_power} BHP` : '', taxDue: monthLabel(v.tax_due),
    thumb: v.primary_thumb, photos: images.length ? images.map(i => i.url) : (v.primary_image ? [v.primary_image] : []),
    photoCount: v.photo_count ?? images.length, blurb: v.description || '',
    featureList: v.features ? v.features.split(',').map(s => s.trim()).filter(Boolean) : [],
    status: v.status, highlighted: v.is_highlighted, youtube: v.youtube_link, sold: v.status === 'sold' || !!v.sold_overlay
  };
}

let _stock = null;
async function loadStock() {
  if (_stock) return _stock;
  const [d, v, st] = await Promise.all([fetch(`${API}/public/dealer`), fetch(`${API}/public/vehicles`), fetch(`${API}/public/site`).catch(() => null)]);
  if (!d.ok || !v.ok) throw new Error('Could not load stock');
  const dealer = await d.json();
  window.site = st && st.ok ? await st.json() : {};
  if (dealer.finance?.apr) DEFAULT_APR = dealer.finance.apr;
  _stock = { dealer, cars: (await v.json()).map(normalizeVehicle), site: window.site };
  return _stock;
}
async function loadVehicle(id) {
  const r = await fetch(`${API}/public/vehicles/${id}`);
  return r.ok ? normalizeVehicle(await r.json()) : null;
}
window.loadStock = loadStock; window.loadVehicle = loadVehicle;

/* ── Saved cars (localStorage) ────────────────────── */
function getSaved() { try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); } catch { return []; } }
function setSaved(ids) { try { localStorage.setItem(SAVED_KEY, JSON.stringify(ids)); } catch {} updateSavedCount(); }
function toggleSaved(id) {
  const ids = getSaved(); const i = ids.indexOf(id);
  if (i === -1) ids.push(id); else ids.splice(i, 1);
  setSaved(ids); return i === -1;
}
function updateSavedCount() {
  document.querySelectorAll('.saved-count').forEach(el => { const n = getSaved().length; el.textContent = n; el.dataset.n = n; });
}
window.getSaved = getSaved; window.toggleSaved = toggleSaved;

/* Finance: standard amortised repayment. */
function monthlyPayment(price, depositPct, months, apr = DEFAULT_APR) {
  const loan = price * (1 - depositPct / 100);
  const r = apr / 1200;
  if (!r) return loan / months;
  return loan * r / (1 - Math.pow(1 + r, -months));
}
window.monthlyPayment = monthlyPayment;

const slugify = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const carUrl = c => `/cars/${c.id}-${slugify(c.name)}`;
window.carUrl = carUrl;

/* ── Car card ─────────────────────────────────────── */
function carCard(c) {
  const saved = getSaved().includes(c.id);
  const chips = [c.year, c.km ? fmt.km(c.km) : null, c.fuel, c.trans].filter(Boolean);
  const badge = c.sold ? '<span class="badge sold">Sold</span>'
    : c.year >= 2024 ? '<span class="badge">Nearly new</span>'
    : c.km && c.km < 70000 ? '<span class="badge amber">Low mileage</span>' : '';
  return `
    <article class="car-card" data-id="${c.id}">
      <div class="car-card-media">
        <img src="${c.thumb || c.photos[0]}" alt="${fmt.esc(c.name)}" loading="lazy" width="400" height="300">
        ${badge}
        <span class="photo-count">${ICONS.camera} ${c.photoCount ?? c.photos.length}</span>
        <button class="save-btn" type="button" aria-pressed="${saved}" aria-label="Save ${fmt.esc(c.name)}" data-save="${c.id}">${ICONS.heart}</button>
      </div>
      <div class="car-card-body">
        <h3 class="car-card-title"><a href="${carUrl(c)}">${fmt.esc(c.name)}</a></h3>
        <div class="car-card-variant" title="${fmt.esc(c.variant)}">${fmt.esc(c.variant)}</div>
        <div class="spec-chips">${chips.map(s => `<span>${fmt.esc(s)}</span>`).join('')}</div>
        <div class="car-card-price">
          <div class="price">${fmt.eur(c.price)}</div>
          ${c.monthly ? `<div class="per-week"><span>Monthly</span><strong>€${c.monthly}</strong></div>` : ''}
        </div>
      </div>
    </article>`;
}
window.carCard = carCard;

/* ── Header & footer (rendered once, shared) ─────── */
function renderChrome(dealer, active) {
  const links = [['/', 'Home'], ['/stock', 'Used Cars'], ['/finance', 'Finance'], ['/sell-your-car', 'Sell Your Car'], ['/about', 'About'], ['/contact', 'Contact']];
  const here = location.pathname.replace(/\.html$/, '').replace(/\/index$/, '/') || '/';
  const nav = links.map(([h, t]) => `<a href="${h}" ${(active ? active === h : here === h) ? 'aria-current="page"' : ''}>${t}</a>`).join('');
  const header = document.querySelector('.site-header');
  const town = (dealer.address || '').split(',').slice(1, 2).join('').trim() || 'Co. Galway';
  if (header) header.innerHTML = `
    <div class="wrap">
      <a class="brand" href="/" aria-label="${fmt.esc(dealer.name)} home"><img src="/img/m6-logo.png" alt="${fmt.esc(dealer.name)}" width="605" height="445"></a>
      <nav class="nav" aria-label="Main">${nav}</nav>
      <div class="header-actions">
        <a class="header-phone" href="${dealer.phoneHref}">${ICONS.phone}<span>${dealer.phone}</span></a>
        <a class="saved-link" href="/stock?saved=1" aria-label="Saved cars">${ICONS.heart}<span class="saved-count" data-n="0"></span></a>
        <button class="menu-btn" type="button" aria-label="Open menu" aria-expanded="false">${ICONS.menu}</button>
      </div>
    </div>
    <nav class="mobile-nav" aria-label="Mobile">${nav}<a href="${dealer.whatsapp}" target="_blank" rel="noopener">WhatsApp us</a></nav>`;
  const btn = header?.querySelector('.menu-btn'); const mnav = header?.querySelector('.mobile-nav');
  btn?.addEventListener('click', () => { const open = mnav.classList.toggle('open'); btn.setAttribute('aria-expanded', open); btn.innerHTML = open ? ICONS.close : ICONS.menu; });

  const footer = document.querySelector('.site-footer');
  if (footer) footer.innerHTML = `
    <div class="wrap">
      <div>
        <div class="brand"><img src="/img/m6-logo.png" alt="${fmt.esc(dealer.name)}" width="605" height="445"></div>
        <p>${fmt.esc(window.site?.footer_blurb || '')}</p>
      </div>
      <div><h4>Explore</h4><ul>${links.map(([h, t]) => `<li><a href="${h}">${t}</a></li>`).join('')}<li><a href="/car-sourcing">Car Sourcing</a></li><li><a href="/about">About Us</a></li><li><a href="/reviews">Reviews</a></li></ul></div>
      <div><h4>Opening hours</h4><ul>${dealer.hours.map(([d, h]) => `<li>${d}: ${h}</li>`).join('')}</ul></div>
      <div><h4>Contact</h4><ul>
        <li><a href="${dealer.phoneHref}">${dealer.phone}</a></li>
        <li><a href="mailto:${dealer.email}">${dealer.email}</a></li>
        <li><a href="${dealer.maps}" target="_blank" rel="noopener">${dealer.address}</a></li>
      </ul></div>
    </div>
    <div class="footer-bottom"><div class="wrap"><span>&copy; ${new Date().getFullYear()} ${fmt.esc(dealer.name)} Ltd. All rights reserved.</span><span><a href="/privacy">Privacy &amp; cookies</a> &middot; <a href="#" data-cookie-settings>Cookie settings</a></span></div></div>`;
  updateSavedCount();
}
window.renderChrome = renderChrome;

/* Save-button delegation (works for any card on any page) */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-save]');
  if (!b) return;
  e.preventDefault();
  const on = toggleSaved(Number(b.dataset.save));
  b.setAttribute('aria-pressed', on);
});
