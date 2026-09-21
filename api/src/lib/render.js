// Server-side HTML for the public site, so crawlers and share previews get real content
// without running JavaScript. Markup mirrors site/js/site.js so the client can take over seamlessly.
import { escapeHtml as esc } from './site.js';

const ICON = {
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.4-.5c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.2-.3-.3-.6-.4zM12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2z"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.9 2z"/></svg>'
};

const eur = n => n == null || n === '' ? 'POA' : '€' + Number(n).toLocaleString('en-IE');
const km = n => n == null ? '—' : Number(n).toLocaleString('en-IE') + ' km';
const monthLabel = iso => { const m = /^(\d{4})-(\d{2})/.exec(iso || ''); return m ? `${m[2]}/${m[1]}` : ''; };
export const slugify = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const carName = v => [v.year, v.make, v.model].filter(Boolean).join(' ');
export const carPath = v => `/cars/${v.id}-${slugify(carName(v))}`;
const isSold = v => v.status === 'sold' || !!v.sold_overlay;

/** Card markup, same structure as carCard() in site/js/site.js. */
export function carCard(v) {
  const name = carName(v);
  const chips = [v.year, v.mileage ? km(v.mileage) : null, v.fuel_type, v.transmission].filter(Boolean);
  const badge = isSold(v) ? '<span class="badge sold">Sold</span>' : v.year >= 2024 ? '<span class="badge">Nearly new</span>' : v.mileage && v.mileage < 70000 ? '<span class="badge amber">Low mileage</span>' : '';
  const thumb = v.primary_thumb || v.primary_image;
  return `
    <article class="car-card" data-id="${v.id}">
      <div class="car-card-media">
        ${thumb ? `<img src="${esc(thumb)}" alt="${esc(name)}" loading="lazy" width="400" height="300">` : ''}
        ${badge}
        <span class="photo-count">${ICON.camera} ${v.photo_count ?? 0}</span>
        <button class="save-btn" type="button" aria-pressed="false" aria-label="Save ${esc(name)}" data-save="${v.id}">${ICON.heart}</button>
      </div>
      <div class="car-card-body">
        <h3 class="car-card-title"><a href="${carPath(v)}">${esc(name)}</a></h3>
        <div class="car-card-variant" title="${esc(v.variant || '')}">${esc(v.variant || '')}</div>
        <div class="spec-chips">${chips.map(s => `<span>${esc(s)}</span>`).join('')}</div>
        <div class="car-card-price">
          <div class="price">${eur(v.price)}</div>
          ${v.weekly ? `<div class="per-week">from <strong>€${v.weekly}</strong>/week</div>` : ''}
        </div>
      </div>
    </article>`;
}

export function carGrid(list) { return list.map(carCard).join(''); }

/** Fill the placeholders in vehicle.html for one car. */
export function vehiclePage(html, v, images, dealer, similar) {
  const name = carName(v);
  const photos = images.map(i => i.url);
  const rep = (from, to) => { if (!html.includes(from)) console.warn('vehiclePage: placeholder missing', from.slice(0, 40)); html = html.replace(from, to); };
  rep('<span id="crumb-name"></span>', `<span id="crumb-name">${esc(name)}</span>`);
  if (photos[0]) rep('<img id="main-img" src="" alt="" width="938" height="704">', `<img id="main-img" src="${esc(photos[0])}" alt="${esc(name)} photo 1" width="938" height="704">`);
  rep('<span class="gallery-counter" id="g-counter"></span>', `<span class="gallery-counter" id="g-counter">${photos.length ? `1 / ${photos.length}` : ''}</span>`);
  rep('<div class="thumbs" id="thumbs"></div>', `<div class="thumbs" id="thumbs">${images.map((im, k) => `<button type="button" aria-label="Photo ${k + 1}" ${k === 0 ? 'aria-current="true"' : ''}><img src="${esc(im.thumb_url || im.url)}" alt="" loading="lazy"></button>`).join('')}</div>`);
  const specs = [['Mileage', km(v.mileage)], ['Year', v.year], ['Fuel', v.fuel_type], ['Gearbox', v.transmission], ['Engine', [v.engine_size, v.max_power ? v.max_power + ' BHP' : null].filter(Boolean).join(' · ')], ['Body', v.body_style], ['Colour', v.colour], ['NCT', monthLabel(v.nct_expiry)]];
  rep('<div class="spec-grid" id="spec-grid"></div>', `<div class="spec-grid" id="spec-grid">${specs.map(([l, val]) => `<div class="spec"><div><span>${l}</span><strong>${esc(val || '—')}</strong></div></div>`).join('')}</div>`);
  const wa = `${dealer.whatsapp}?text=${encodeURIComponent(`Hi, I'm interested in the ${name} (${eur(v.price)}) on your website.`)}`;
  rep('<div class="vehicle-card" id="vehicle-card"></div>', `<div class="vehicle-card" id="vehicle-card">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
          <div><h1>${esc(name)}</h1><p class="variant">${esc(v.variant || '')}</p></div>
          <button class="save-btn" type="button" style="position:static;flex:none" aria-pressed="false" aria-label="Save this car" data-save="${v.id}">${ICON.heart}</button>
        </div>
        <div class="price-block">
          <span class="price">${eur(v.price)}</span>
          ${v.weekly ? `<span class="finance-note">or from <strong>€${v.weekly}</strong>/week · <strong>€${v.monthly}</strong>/month</span>` : ''}
        </div>
        <div class="cta-grid">
          <a class="btn btn-primary btn-block-2" href="#enquiry">Make an enquiry</a>
          <a class="btn btn-whatsapp" href="${esc(wa)}" target="_blank" rel="noopener">${ICON.whatsapp} WhatsApp</a>
          <a class="btn btn-outline" href="${esc(dealer.phone_href || '')}">${ICON.phone} Call</a>
          <a class="btn btn-outline" href="/finance">Apply for finance</a>
          <a class="btn btn-outline" href="/sell-your-car">Value my trade-in</a>
        </div>
        <div class="vehicle-meta">
          ${v.owners ? `<span>${v.owners} Owner${v.owners > 1 ? 's' : ''}</span>` : ''}
          ${v.road_tax ? `<span>Road tax €${Number(v.road_tax).toLocaleString('en-IE')}/yr</span>` : ''}
          <span>${esc((dealer.address || '').split(',').slice(1, 3).join(',').trim())}</span>
        </div></div>`);
  rep('<div class="description" id="description"></div>', `<div class="description" id="description">${esc(v.description || 'Contact us for more details on this car.')}</div>`);
  const feats = (v.features || '').split(',').map(s => s.trim()).filter(Boolean);
  rep('<ul class="feature-list" id="features"></ul>', `<ul class="feature-list" id="features">${feats.map(f => `<li>${ICON.check}${esc(f)}</li>`).join('')}</ul>`);
  const ov = [['Make', v.make], ['Model', v.model], ['Year', v.year], ['Body', v.body_style], ['Colour', v.colour], ['Doors', v.doors], ['Seats', v.seats], ['Engine', v.engine_size], ['Power', v.max_power ? v.max_power + ' BHP' : null], ['Fuel', v.fuel_type], ['Transmission', v.transmission], ['Mileage', v.mileage ? km(v.mileage) : null], ['Owners', v.owners], ['NCT', monthLabel(v.nct_expiry)], ['Annual road tax', v.road_tax ? '€' + Number(v.road_tax).toLocaleString('en-IE') : null], ['Tax due', monthLabel(v.tax_due)]].filter(r => r[1]);
  rep('<table class="overview-table" id="overview"></table>', `<table class="overview-table" id="overview">${ov.map(([k, val]) => `<tr><th>${k}</th><td>${esc(val)}</td></tr>`).join('')}</table>`);
  rep('<div class="car-grid" id="similar"></div>', `<div class="car-grid" id="similar">${carGrid(similar)}</div>`);
  return html;
}

/** Fill the stock grid and count in stock.html. */
export function stockPage(html, list) {
  return html
    .replace('<h2 id="results-count">Loading…</h2>', `<h2 id="results-count">${list.length} ${list.length === 1 ? 'car' : 'cars'}</h2>`)
    .replace('<div class="car-grid" id="grid"></div>', `<div class="car-grid" id="grid">${carGrid(list)}</div>`);
}

/** Fill the featured grid and the "N cars" count in index.html. */
export function homePage(html, list, total) {
  return html
    .replace('<span id="hero-count">cars</span>', `<span id="hero-count">${total} cars</span>`)
    .replace('<div class="car-grid" id="featured"></div>', `<div class="car-grid" id="featured">${carGrid(list)}</div>`);
}

/** Header + footer markup, mirroring renderChrome() in site/js/site.js, so nav links exist without JS. */
export function chrome(html, dealer, site, activePath) {
  const links = [['/', 'Home'], ['/stock', 'Used Cars'], ['/finance', 'Finance'], ['/sell-your-car', 'Sell Your Car'], ['/contact', 'Contact']];
  const nav = links.map(([h, t]) => `<a href="${h}" ${activePath === h ? 'aria-current="page"' : ''}>${t}</a>`).join('');
  const hours = JSON.parse(dealer.hours_json || '[]');
  const header = `<header class="site-header">
    <div class="wrap">
      <a class="brand" href="/" aria-label="${esc(dealer.name)} home"><img src="/img/mhl-logo.png" alt="${esc(dealer.name)}" width="550" height="99"></a>
      <nav class="nav" aria-label="Main">${nav}</nav>
      <div class="header-actions">
        <a class="header-phone" href="${esc(dealer.phone_href || '')}">${ICON.phone}<span>${esc(dealer.phone || '')}</span></a>
        <a class="saved-link" href="/stock?saved=1" aria-label="Saved cars">${ICON.heart}<span class="saved-count" data-n="0"></span></a>
        <button class="menu-btn" type="button" aria-label="Open menu" aria-expanded="false"></button>
      </div>
    </div>
    <nav class="mobile-nav" aria-label="Mobile">${nav}</nav></header>`;
  const footer = `<footer class="site-footer">
    <div class="wrap">
      <div><div class="brand"><img src="/img/mhl-logo.png" alt="${esc(dealer.name)}" width="550" height="99"></div><p>${esc(site.footer_blurb || '')}</p></div>
      <div><h4>Explore</h4><ul>${links.map(([h, t]) => `<li><a href="${h}">${t}</a></li>`).join('')}<li><a href="/car-sourcing">Car Sourcing</a></li></ul></div>
      <div><h4>Opening hours</h4><ul>${hours.map(([d, h]) => `<li>${esc(d)}: ${esc(h)}</li>`).join('')}</ul></div>
      <div><h4>Contact</h4><ul><li><a href="${esc(dealer.phone_href || '')}">${esc(dealer.phone || '')}</a></li><li><a href="mailto:${esc(dealer.email || '')}">${esc(dealer.email || '')}</a></li><li><a href="${esc(dealer.maps_url || '')}" target="_blank" rel="noopener">${esc(dealer.address || '')}</a></li></ul></div>
    </div>
    <div class="footer-bottom"><div class="wrap"><span>&copy; ${new Date().getFullYear()} ${esc(dealer.name)} Ltd. All rights reserved.</span><span>Privacy &middot; Terms</span></div></div></footer>`;
  return html.replace('<header class="site-header"></header>', header).replace('<footer class="site-footer"></footer>', footer);
}
