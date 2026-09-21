// Screenshot site pages with real device emulation. Usage: node tools/shoot.js [outDir]
const puppeteer = require('puppeteer-core');
const path = require('path');
const OUT = process.argv[2] || '/tmp/mhl-shots';
const BASE = process.env.BASE || 'http://localhost:8787/';
const PAGES = ['index.html', 'stock.html', 'vehicle.html?id=5', 'finance.html', 'sell-your-car.html', 'car-sourcing.html', 'contact.html'];
const VIEWS = { desktop: { width: 1400, height: 900 }, mobile: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } };
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('requestfailed', r => errors.push('failed: ' + r.url()));
  for (const [vname, vp] of Object.entries(VIEWS)) {
    await page.setViewport(vp);
    for (const p of PAGES) {
      const name = p.replace(/[^a-z0-9]+/gi, '_').replace(/_html/, '');
      await page.goto(BASE + p, { waitUntil: 'networkidle0', timeout: 30000 });
      await new Promise(r => setTimeout(r, 400));
      const w = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
      if (w.doc > w.win) errors.push(`overflow on ${p} @${vname}: scrollWidth ${w.doc} > ${w.win}`);
      await page.screenshot({ path: path.join(OUT, `${vname}-${name}.png`), fullPage: true });
    }
  }
  await browser.close();
  console.log(errors.length ? errors.join('\n') : 'no page errors, no horizontal overflow');
})();
