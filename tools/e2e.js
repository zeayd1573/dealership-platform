// End-to-end browser check: public site via the Worker, admin login + pages via the API.
const puppeteer = require('puppeteer-core');
const OUT = '/tmp/mhl-shots';
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
  const page = await browser.newPage(); await page.setViewport({ width: 1400, height: 900 });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|maps\/embed/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400 && !/favicon|maps/.test(r.url())) errors.push(`HTTP ${r.status()} ${r.url()}`); });
  const go = async (url, wait) => { await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 }); if (wait) await page.waitForSelector(wait, { timeout: 10000 }); };
  const out = {};

  // Public site through the Worker (assets + API on one origin)
  await go('http://localhost:8787/', '.car-card'); out.home_cards = (await page.$$('.car-card')).length;
  out.home_hero_count = await page.$eval('#hero-count', e => e.textContent);
  await page.screenshot({ path: `${OUT}/e2e-home.png` });
  await go('http://localhost:8787/stock.html', '.car-card'); out.stock_cards = (await page.$$('.car-card')).length;
  out.stock_first_img = await page.$eval('.car-card img', i => i.currentSrc || i.src);
  out.stock_img_ok = await page.$eval('.car-card img', i => i.complete && i.naturalWidth > 0);
  await go('http://localhost:8787/cars/5', '#thumbs button'); out.car_url = page.url(); out.car_title = await page.title(); out.vehicle_title = await page.$eval('.vehicle-card h1', e => e.textContent);
  out.vehicle_photos = (await page.$$('#thumbs button')).length; out.vehicle_price = await page.$eval('.price-block .price', e => e.textContent);
  out.vehicle_finance = await page.$eval('#calc-monthly', e => e.textContent);
  await page.screenshot({ path: `${OUT}/e2e-vehicle.png` });
  // submit an enquiry from the vehicle page
  await page.type('#e-name', 'E2E Tester'); await page.type('#e-phone', '0871112222'); await page.type('#e-email', 'e2e@example.com'); await page.type('#e-msg', 'Is this still available?');
  await page.click('#enquiry-form button[type=submit]'); await page.waitForFunction(() => document.querySelector('#e-status').textContent.length > 0, { timeout: 10000 });
  out.enquiry_status = await page.$eval('#e-status', e => e.className + ' | ' + e.textContent);

  // Admin (new design): login, stock cards, status change, enquiries inbox, edit page, settings, guard
  await go('http://localhost:3100/login.html', '#login-form');
  await page.type('#username', 'admin'); await page.type('#password', 'mhl-admin-2026');
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('#login-form button')]);
  out.admin_url = page.url();
  await page.waitForSelector('.cards .card', { timeout: 10000 });
  out.admin_cards = (await page.$$('.cards .card')).length;
  out.admin_brand = await page.$eval('.side .brand strong', e => e.textContent);
  out.admin_stats = await page.$$eval('.stat', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
  await page.screenshot({ path: `${OUT}/e2e-admin.png` });
  // change a status via the card dropdown and check the Paused tab
  await page.select('.card[data-id="21"] select[data-status]', 'paused'); await new Promise(r => setTimeout(r, 800));
  await page.click('#tabs button[data-f="paused"]'); await new Promise(r => setTimeout(r, 300));
  out.paused_cards = (await page.$$('.cards .card')).length;
  await page.select('.card[data-id="21"] select[data-status]', 'available'); await new Promise(r => setTimeout(r, 800));
  await page.type('#q', 'sq7'); await page.click('#tabs button[data-f=""]'); await new Promise(r => setTimeout(r, 300));
  out.search_cards = (await page.$$('.cards .card')).length;
  await go('http://localhost:3100/enquiries.html', '.inbox-item'); out.admin_enquiries = (await page.$$('.inbox-item')).length;
  await page.click('.inbox-item'); await page.waitForSelector('#toggle-read', { timeout: 5000 }); out.enquiry_detail = await page.$eval('.inbox-detail h2', e => e.textContent);
  await page.screenshot({ path: `${OUT}/e2e-admin-enquiries.png` });
  await go('http://localhost:3100/car.html?id=5', '.photo'); out.edit_make = await page.$eval('#make', e => e.value); out.edit_photos = (await page.$$('.photo')).length;
  out.edit_chips_on = (await page.$$('.chip[aria-pressed="true"]')).length;
  await page.screenshot({ path: `${OUT}/e2e-admin-edit.png`, fullPage: true });
  await go('http://localhost:3100/car.html', '#lookup-form'); await page.type('#lookup-reg', '181WH1021'); await page.click('#lookup-form button'); await page.waitForFunction(() => document.querySelector('#make').value.length > 0, { timeout: 10000 }); out.lookup_make = await page.$eval('#make', e => e.value);
  await page.screenshot({ path: `${OUT}/e2e-admin-add.png` });
  await go('http://localhost:3100/website.html', '#hero_title'); out.website_hero = await page.$eval('#hero_title', e => e.value); out.website_preview_ok = await page.$eval('#hero_preview', i => i.complete && i.naturalWidth > 0);
  await page.screenshot({ path: `${OUT}/e2e-admin-website.png`, fullPage: true });
  await go('http://localhost:3100/settings.html', '#apr'); out.settings_apr = await page.$eval('#apr', e => e.value);
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await go('http://localhost:3100/index.html', '.cards .card'); await page.screenshot({ path: `${OUT}/e2e-admin-mobile.png`, fullPage: false });
  out.mobile_overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  await page.setViewport({ width: 1400, height: 900 });
  await page.evaluate(() => localStorage.removeItem('dealer_admin_token'));
  await page.goto('http://localhost:3100/index.html', { waitUntil: 'networkidle0' }); out.guard_redirect = page.url();

  await browser.close();
  console.log(JSON.stringify(out, null, 2)); console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no browser errors');
})().catch(e => { console.error('E2E FAILED:', e.message); process.exit(1); });
