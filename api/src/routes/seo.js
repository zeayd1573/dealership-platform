// SEO: clean car URLs with server-injected meta, home meta, sitemap, robots, redirects from the old site.
import { getDefaultDealer, getSettings, shapeVehicle, shapeImage, VEHICLE_SELECT, repayment } from '../lib/util.js';
import { getSite, escapeHtml as esc } from '../lib/site.js';
import { vehiclePage, stockPage, homePage, chrome, carPath as renderCarPath } from '../lib/render.js';

const STATIC_PAGES = ['/', '/stock', '/finance', '/sell-your-car', '/car-sourcing', '/about', '/reviews', '/contact', '/privacy'];

// Pages served straight from the assets folder. They still need a canonical, the
// server-rendered header and footer, and a breadcrumb, which is what this list drives.
const PLAIN_PAGES = [
  ['/finance',       'finance.html',       'Car Finance'],
  ['/sell-your-car', 'sell-your-car.html', 'Sell or Trade In'],
  ['/car-sourcing',  'car-sourcing.html',  'Car Sourcing'],
  ['/about',         'about.html',         'About Us'],
  ['/reviews',       'reviews.html',       'Reviews'],
  ['/contact',       'contact.html',       'Contact'],
  ['/privacy',       'privacy.html',       'Privacy & Cookies']
];

export const slugify = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const carPath = v => `/cars/${v.id}-${slugify([v.year, v.make, v.model].filter(Boolean).join(' '))}`;

async function asset(c, path) {
  const res = await c.env.ASSETS.fetch(new Request(new URL(path, c.req.url), { method: 'GET' }));
  return res.text();
}

/** Replace <title>/description and add canonical, Open Graph and JSON-LD before </head>. */
/**
 * Serialise for embedding in a <script> block. JSON.stringify leaves "<" alone, so a
 * value containing "</script>" would close the tag and everything after it becomes
 * live markup. Car make/model/colour reach here, and a stock feed can set those.
 */
function jsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

/** Trim to a length search results will actually show, without cutting mid-word. */
const clamp = (t, n) => { t = String(t || '').trim(); if (t.length <= n) return t; const cut = t.slice(0, n - 1); return cut.slice(0, cut.lastIndexOf(' ')).replace(/[.,;–-]$/, '') + '…'; };

const titleOf = h => (h.match(/<title>([\s\S]*?)<\/title>/) || [])[1]?.trim() || '';
const descOf = h => (h.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';

function injectHead(html, m) {
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(clamp(m.title, 62))}</title>`);
  if (/<meta name="description"/.test(html)) html = html.replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(clamp(m.description, 158))}">`);
  else html = html.replace('</head>', `<meta name="description" content="${esc(m.description)}">\n</head>`);
  const tags = [
    `<link rel="canonical" href="${esc(m.canonical)}">`,
    `<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">`,
    `<meta property="og:site_name" content="${esc(m.siteName || '')}">`,
    `<meta property="og:locale" content="en_IE">`,
    `<meta property="og:type" content="${m.type || 'website'}">`,
    `<meta property="og:title" content="${esc(m.title)}">`,
    `<meta property="og:description" content="${esc(m.description)}">`,
    `<meta property="og:url" content="${esc(m.canonical)}">`,
    m.image ? `<meta property="og:image" content="${esc(m.image)}">` : '',
    `<meta name="twitter:card" content="${m.image ? 'summary_large_image' : 'summary'}">`,
    m.jsonld ? `<script type="application/ld+json">${jsonLd(m.jsonld)}</script>` : '',
    // The tag id is handed to consent.js, which only loads Google once the visitor agrees.
    m.analytics ? `<script>window.__consent={ga:'${esc(m.analytics)}'}</script>` : ''
  ].filter(Boolean).join('\n');
  return html.replace('</head>', tags + '\n</head>');
}

function dealerJsonLd(d, origin) {
  return { '@context': 'https://schema.org', '@graph': [
    { '@type': 'AutoDealer', '@id': origin + '/#dealer', name: d.name, url: origin, telephone: d.phone, email: d.email, address: d.address, logo: origin + '/img/m6-logo.png', image: origin + '/img/hero-x5.jpg', openingHours: (JSON.parse(d.hours_json || '[]')).map(([day, h]) => `${day} ${h}`) },
    { '@type': 'WebSite', '@id': origin + '/#website', url: origin, name: d.name, publisher: { '@id': origin + '/#dealer' }, inLanguage: 'en-IE' }
  ] };
}
const crumbs = (origin, items) => ({ '@type': 'BreadcrumbList', itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: origin + path })) });

/**
 * Count a page view without delaying the response, and without counting our own
 * crawlers, screenshot runs or the obvious bots.
 */
function countView(c, vehicleId) {
  const ua = (c.req.header('user-agent') || '').toLowerCase();
  if (!ua || /bot|crawler|spider|slurp|headless|preview|lighthouse|puppeteer|curl|wget/.test(ua)) return;
  c.executionCtx.waitUntil(
    c.env.DB.prepare('UPDATE vehicles SET view_count = COALESCE(view_count, 0) + 1 WHERE id = ?').bind(vehicleId).run().catch(() => {})
  );
}

export function registerSeo(app) {
  // Home: inject title/description from site settings
  app.get('/', async c => {
    const origin = new URL(c.req.url).origin;
    const d = await getDefaultDealer(c.env);
    const s = await getSite(c.env, d.id);
    const settings = await getSettings(c.env, d.id);
    const { results } = await c.env.DB.prepare(`SELECT ${VEHICLE_SELECT} FROM vehicles v WHERE v.dealer_id = ? AND v.status = 'available' ORDER BY v.year DESC, v.mileage ASC`).bind(d.id).all();
    const cars = results.map(r => shapeVehicle(c.env, r, settings));
    const html = chrome(homePage(await asset(c, '/index.html'), cars.slice(0, 6), cars.length), d, s, '/');
    return c.html(injectHead(html, { title: s.site_title, description: s.site_description, canonical: origin + '/', siteName: d.name, analytics: s.analytics_id, image: s.hero_image.startsWith('http') ? s.hero_image : origin + s.hero_image, jsonld: dealerJsonLd(d, origin) }));
  });

  // Stock page: grid rendered server-side (the page's JS re-renders it for filtering)
  app.get('/stock', async c => {
    const origin = new URL(c.req.url).origin;
    const d = await getDefaultDealer(c.env);
    const settings = await getSettings(c.env, d.id);
    const { results } = await c.env.DB.prepare(`SELECT ${VEHICLE_SELECT} FROM vehicles v WHERE v.dealer_id = ? AND v.status = 'available' ORDER BY v.id DESC`).bind(d.id).all();
    const cars = results.map(r => shapeVehicle(c.env, r, settings));
    const html = chrome(stockPage(await asset(c, '/stock.html'), cars), d, await getSite(c.env, d.id), '/stock');
    return c.html(injectHead(html, { title: `Used cars for sale in Ballinasloe, Co. Galway | ${d.name}`, description: `${cars.length} quality used cars, SUVs and vans in stock at ${d.name}, ${d.address}. Finance arranged, trade-ins welcome.`, canonical: origin + '/stock', siteName: d.name, image: cars[0]?.primary_image, jsonld: { '@context': 'https://schema.org', '@graph': [crumbs(origin, [['Home', '/'], ['Used cars', '/stock']]), { '@type': 'ItemList', itemListElement: cars.slice(0, 50).map((v, i) => ({ '@type': 'ListItem', position: i + 1, url: origin + renderCarPath(v), name: [v.year, v.make, v.model].join(' ') })) }] } }));
  });

  // Car page: /cars/<id>-<slug>
  app.get('/cars/:slug', async c => {
    const origin = new URL(c.req.url).origin;
    const id = parseInt(c.req.param('slug'), 10);
    const d0 = await getDefaultDealer(c.env);
    const row = id ? await c.env.DB.prepare(`SELECT ${VEHICLE_SELECT} FROM vehicles v WHERE v.id = ? AND v.dealer_id = ? AND v.status IN ('available','reserved','sold')`).bind(id, d0.id).first() : null;
    if (!row) return notFound(c);
    const canonicalPath = carPath(row);
    if (c.req.path !== canonicalPath) return c.redirect(canonicalPath, 301);
    countView(c, row.id);
    const d = d0;
    const settings = await getSettings(c.env, row.dealer_id);
    const v = shapeVehicle(c.env, row, settings);
    const name = [v.year, v.make, v.model].filter(Boolean).join(' ');
    const price = v.price ? '€' + Number(v.price).toLocaleString('en-IE') : 'POA';
    const bits = [v.variant, v.mileage ? Number(v.mileage).toLocaleString('en-IE') + ' km' : null, v.fuel_type, v.transmission].filter(Boolean).join(', ');
    const sold = v.status === 'sold' ? ' (Sold)' : v.status === 'reserved' ? ' (Reserved)' : '';
    const { results: imgs } = await c.env.DB.prepare('SELECT * FROM vehicle_images WHERE vehicle_id = ? ORDER BY is_primary DESC, sort_order, id').bind(row.id).all();
    const images = imgs.map(i => shapeImage(c.env, i, v.status === 'sold' || !!v.sold_overlay));
    const { results: others } = await c.env.DB.prepare(`SELECT ${VEHICLE_SELECT} FROM vehicles v WHERE v.dealer_id = ? AND v.status = 'available' AND v.id != ? ORDER BY (v.body_style = ?) DESC, ABS(COALESCE(v.price, 0) - ?) ASC LIMIT 3`).bind(row.dealer_id, row.id, v.body_style || '', v.price || 0).all();
    const similar = others.map(r => shapeVehicle(c.env, r, settings));
    const s = await getSite(c.env, d.id);
    const html = chrome(vehiclePage(await asset(c, '/vehicle.html'), v, images, d, similar), d, s, '/stock');
    const jsonld = { '@context': 'https://schema.org', '@graph': [crumbs(origin, [['Home', '/'], ['Used cars', '/stock'], [name, canonicalPath]]), { '@type': 'Car', name, brand: v.make, model: v.model, vehicleModelDate: v.year, mileageFromOdometer: v.mileage ? { '@type': 'QuantitativeValue', value: v.mileage, unitCode: 'KMT' } : undefined, fuelType: v.fuel_type, vehicleTransmission: v.transmission, color: v.colour, bodyType: v.body_style, image: v.primary_image, url: origin + canonicalPath,
      offers: { '@type': 'Offer', price: v.price, priceCurrency: 'EUR', availability: v.status === 'available' ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut', seller: { '@type': 'AutoDealer', name: d.name, telephone: d.phone } } }] };
    return c.html(injectHead(html, { type: 'product', siteName: d.name, analytics: s.analytics_id, title: `${name} for sale, ${price}${sold} | ${d.name}`, description: clamp(`${name}${bits ? ' – ' + bits : ''}. ${price}${v.weekly ? `, from €${v.weekly}/week` : ''}. For sale at ${d.name}, Ballinasloe.`, 155), canonical: origin + canonicalPath, image: v.primary_image, jsonld }));
  });

  for (const [path, file, label] of PLAIN_PAGES) {
    app.get(path, async c => {
      const origin = new URL(c.req.url).origin;
      const d = await getDefaultDealer(c.env);
      const s = await getSite(c.env, d.id);
      const html = chrome(await asset(c, '/' + file), d, s, path);
      const head = { siteName: d.name, analytics: s.analytics_id, canonical: origin + path,
        title: titleOf(html) || `${label} | ${d.name}`, description: descOf(html) || s.site_description,
        jsonld: crumbs(origin, [['Home', '/'], [label, path]]) };
      return c.html(injectHead(html, head));
    });
  }

  app.get('/robots.txt', c => c.text(`User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\nSitemap: ${new URL(c.req.url).origin}/sitemap.xml\n`));

  app.get('/sitemap.xml', async c => {
    const origin = new URL(c.req.url).origin;
    const d = await getDefaultDealer(c.env);
    const { results } = await c.env.DB.prepare("SELECT id, year, make, model, updated_at FROM vehicles WHERE dealer_id = ? AND status = 'available' ORDER BY updated_at DESC").bind(d.id).all();
    const url = (loc, lastmod, priority) => `  <url><loc>${esc(loc)}</loc>${lastmod ? `<lastmod>${lastmod.slice(0, 10)}</lastmod>` : ''}<priority>${priority}</priority></url>`;
    const body = [...STATIC_PAGES.map(p => url(origin + p, null, p === '/' ? '1.0' : '0.6')), ...results.map(v => url(origin + carPath(v), v.updated_at, '0.8'))].join('\n');
    return c.body(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`, 200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
  });

  // Old m6motors.ie URLs (Happy Dealer / StockManager) -> new pages
  const OLD = {
    '/used-cars': '/stock', '/search': '/stock', '/cars': '/stock',
    '/cashforcars': '/sell-your-car', '/sell-your-car': '/sell-your-car',
    '/finance': '/finance', '/contact': '/contact', '/car-sourcing': '/car-sourcing'
  };
  for (const [from, to] of Object.entries(OLD)) {
    if (from !== to) app.get(from, c => c.redirect(to, 301));
    app.get(`${from}/`, c => c.redirect(to, 301));
  }
  // Their car pages were /vehicle?id=<short id>, kept in vehicles.external_ref by the importer.
  app.get('/vehicle', oldCarRedirect); app.get('/vehicle/', oldCarRedirect);
  async function oldCarRedirect(c) {
    const ref = new URL(c.req.url).searchParams.get('id');
    const row = ref ? await c.env.DB.prepare("SELECT id, year, make, model FROM vehicles WHERE external_ref = ? AND status != 'archived'").bind(ref).first() : null;
    return c.redirect(row ? carPath(row) : '/stock', 301);
  }
}

export async function notFound(c) {
  const html = await asset(c, '/404.html').catch(() => '<h1>Not found</h1>');
  return c.html(html, 404);
}
