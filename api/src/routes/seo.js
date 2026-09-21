// SEO: clean car URLs with server-injected meta, home meta, sitemap, robots, redirects from the old site.
import { getDefaultDealer, getSettings, shapeVehicle, shapeImage, VEHICLE_SELECT, repayment } from '../lib/util.js';
import { getSite, escapeHtml as esc } from '../lib/site.js';

const STATIC_PAGES = ['/', '/stock', '/finance', '/sell-your-car', '/car-sourcing', '/contact'];

export const slugify = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const carPath = v => `/cars/${v.id}-${slugify([v.year, v.make, v.model].filter(Boolean).join(' '))}`;

async function asset(c, path) {
  const res = await c.env.ASSETS.fetch(new Request(new URL(path, c.req.url), { method: 'GET' }));
  return res.text();
}

/** Replace <title>/description and add canonical, Open Graph and JSON-LD before </head>. */
function injectHead(html, m) {
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(m.title)}</title>`);
  if (/<meta name="description"/.test(html)) html = html.replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(m.description)}">`);
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
    m.jsonld ? `<script type="application/ld+json">${JSON.stringify(m.jsonld)}</script>` : '',
    m.analytics ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(m.analytics)}"></script>\n<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${esc(m.analytics)}');</script>` : ''
  ].filter(Boolean).join('\n');
  return html.replace('</head>', tags + '\n</head>');
}

function dealerJsonLd(d, origin) {
  return { '@context': 'https://schema.org', '@graph': [
    { '@type': 'AutoDealer', '@id': origin + '/#dealer', name: d.name, url: origin, telephone: d.phone, email: d.email, address: d.address, image: origin + '/img/hero-forecourt.jpg', openingHours: (JSON.parse(d.hours_json || '[]')).map(([day, h]) => `${day} ${h}`) },
    { '@type': 'WebSite', '@id': origin + '/#website', url: origin, name: d.name, publisher: { '@id': origin + '/#dealer' }, inLanguage: 'en-IE' }
  ] };
}
const crumbs = (origin, items) => ({ '@type': 'BreadcrumbList', itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: origin + path })) });

export function registerSeo(app) {
  // Home: inject title/description from site settings
  app.get('/', async c => {
    const origin = new URL(c.req.url).origin;
    const d = await getDefaultDealer(c.env);
    const s = await getSite(c.env, d.id);
    const html = await asset(c, '/index.html');
    return c.html(injectHead(html, { title: s.site_title, description: s.site_description, canonical: origin + '/', siteName: d.name, analytics: s.analytics_id, image: s.hero_image.startsWith('http') ? s.hero_image : origin + s.hero_image, jsonld: dealerJsonLd(d, origin) }));
  });

  // Car page: /cars/<id>-<slug>
  app.get('/cars/:slug', async c => {
    const origin = new URL(c.req.url).origin;
    const id = parseInt(c.req.param('slug'), 10);
    const row = id ? await c.env.DB.prepare(`SELECT ${VEHICLE_SELECT} FROM vehicles v WHERE v.id = ? AND v.status IN ('available','reserved','sold')`).bind(id).first() : null;
    if (!row) return notFound(c);
    const canonicalPath = carPath(row);
    if (c.req.path !== canonicalPath) return c.redirect(canonicalPath, 301);
    const d = await getDefaultDealer(c.env);
    const settings = await getSettings(c.env, row.dealer_id);
    const v = shapeVehicle(c.env, row, settings);
    const name = [v.year, v.make, v.model].filter(Boolean).join(' ');
    const price = v.price ? '€' + Number(v.price).toLocaleString('en-IE') : 'POA';
    const bits = [v.variant, v.mileage ? Number(v.mileage).toLocaleString('en-IE') + ' km' : null, v.fuel_type, v.transmission].filter(Boolean).join(', ');
    const sold = v.status === 'sold' ? ' (Sold)' : v.status === 'reserved' ? ' (Reserved)' : '';
    const html = await asset(c, '/vehicle.html');
    const s = await getSite(c.env, d.id);
    const jsonld = { '@context': 'https://schema.org', '@graph': [crumbs(origin, [['Home', '/'], ['Used cars', '/stock'], [name, canonicalPath]]), { '@type': 'Car', name, brand: v.make, model: v.model, vehicleModelDate: v.year, mileageFromOdometer: v.mileage ? { '@type': 'QuantitativeValue', value: v.mileage, unitCode: 'KMT' } : undefined, fuelType: v.fuel_type, vehicleTransmission: v.transmission, color: v.colour, bodyType: v.body_style, image: v.primary_image, url: origin + canonicalPath,
      offers: { '@type': 'Offer', price: v.price, priceCurrency: 'EUR', availability: v.status === 'available' ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut', seller: { '@type': 'AutoDealer', name: d.name, telephone: d.phone } } }] };
    return c.html(injectHead(html, { type: 'product', siteName: d.name, analytics: s.analytics_id, title: `${name} for sale, ${price}${sold} | ${d.name}`, description: `${name}${bits ? ' – ' + bits : ''}. ${price}${v.weekly ? `, from €${v.weekly}/week` : ''}. For sale at ${d.name}, ${d.address}.`, canonical: origin + canonicalPath, image: v.primary_image, jsonld }));
  });

  app.get('/robots.txt', c => c.text(`User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\nSitemap: ${new URL(c.req.url).origin}/sitemap.xml\n`));

  app.get('/sitemap.xml', async c => {
    const origin = new URL(c.req.url).origin;
    const d = await getDefaultDealer(c.env);
    const { results } = await c.env.DB.prepare("SELECT id, year, make, model, updated_at FROM vehicles WHERE dealer_id = ? AND status = 'available' ORDER BY updated_at DESC").bind(d.id).all();
    const url = (loc, lastmod, priority) => `  <url><loc>${esc(loc)}</loc>${lastmod ? `<lastmod>${lastmod.slice(0, 10)}</lastmod>` : ''}<priority>${priority}</priority></url>`;
    const body = [...STATIC_PAGES.map(p => url(origin + p, null, p === '/' ? '1.0' : '0.6')), ...results.map(v => url(origin + carPath(v), v.updated_at, '0.8'))].join('\n');
    return c.body(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`, 200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
  });

  // Old mhlmotors.ie URLs (CarsIreland WordPress) -> new pages
  const OLD = { '/used-cars': '/stock', '/apply-for-finance': '/finance', '/sell-your-car': '/sell-your-car', '/car-sourcing': '/car-sourcing', '/contact': '/contact', '/finance': '/finance' };
  for (const [from, to] of Object.entries(OLD)) app.get(`${from}/`, c => c.redirect(to, 301));
  app.get('/car-details', oldCarRedirect); app.get('/car-details/', oldCarRedirect);
  async function oldCarRedirect(c) {
    // e.g. /car-details/?4553716=2017-audi-sq-7 — the query key is the old advert id
    const ref = [...new URL(c.req.url).searchParams.keys()].find(k => /^\d+$/.test(k));
    const row = ref ? await c.env.DB.prepare("SELECT id, year, make, model FROM vehicles WHERE external_ref = ? AND status != 'archived'").bind(ref).first() : null;
    return c.redirect(row ? carPath(row) : '/stock', 301);
  }
}

export async function notFound(c) {
  const html = await asset(c, '/404.html').catch(() => '<h1>Not found</h1>');
  return c.html(html, 404);
}
