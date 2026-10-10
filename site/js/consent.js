/* =====================================================
   COOKIE CONSENT
   Nothing that tracks runs until the visitor says yes.

   Rules this follows, which are the ones that actually get enforced in Ireland:
     - no non-essential cookies or tags before consent
     - Reject is exactly as easy and as prominent as Accept
     - nothing is pre-ticked
     - consent can be withdrawn later, from a link in the footer
     - scrolling or closing the banner is NOT consent

   Google Consent Mode v2 is set to denied before any tag loads, so even when
   Analytics is switched on it collects nothing until it is granted.
   ===================================================== */
(function () {
  const KEY = 'm6_consent';
  const VERSION = 1;          // bump to re-ask everybody after a policy change

  // Tell Google to assume "no" before anything loads.
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;
  gtag('consent', 'default', {
    ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
    analytics_storage: 'denied', functionality_storage: 'granted', security_storage: 'granted'
  });

  const cfg = window.__consent || {};          // { ga: 'G-XXXX', pixel: '...' }

  function read() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || 'null');
      return v && v.v === VERSION ? v : null;
    } catch { return null; }
  }
  function write(analytics, marketing) {
    const v = { v: VERSION, analytics: !!analytics, marketing: !!marketing, ts: new Date().toISOString() };
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {}
    apply(v);
    document.dispatchEvent(new CustomEvent('consentchange', { detail: v }));
    return v;
  }

  let loaded = { ga: false, pixel: false };

  function apply(v) {
    gtag('consent', 'update', {
      analytics_storage: v.analytics ? 'granted' : 'denied',
      ad_storage: v.marketing ? 'granted' : 'denied',
      ad_user_data: v.marketing ? 'granted' : 'denied',
      ad_personalization: v.marketing ? 'granted' : 'denied'
    });
    if (v.analytics && cfg.ga && !loaded.ga) {
      loaded.ga = true;
      const s = document.createElement('script');
      s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(cfg.ga);
      document.head.appendChild(s);
      gtag('js', new Date());
      gtag('config', cfg.ga, { anonymize_ip: true });
    }
    if (v.marketing && cfg.pixel && !loaded.pixel) {
      loaded.pixel = true;
      // Meta pixel goes here once there is one. Kept behind consent by design.
    }
  }

  // --- UI ------------------------------------------------------------------
  function el(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; }

  function banner() {
    const node = el(`
      <div class="cc" role="dialog" aria-modal="false" aria-labelledby="cc-t" aria-describedby="cc-d">
        <div class="cc-inner">
          <div class="cc-copy">
            <strong id="cc-t">Cookies on this site</strong>
            <p id="cc-d">We use cookies that are needed to make the site work. With your permission we would also
              like to use analytics to see which cars people look at, and advertising cookies to show our stock on
              other sites. You can change your mind at any time.
              <a href="/privacy">Read our privacy and cookie notice</a>.</p>
          </div>
          <div class="cc-actions">
            <button type="button" class="btn btn-dark" data-cc="accept">Accept all</button>
            <button type="button" class="btn btn-dark" data-cc="reject">Reject all</button>
            <button type="button" class="btn btn-outline" data-cc="manage">Choose</button>
          </div>
        </div>
      </div>`);
    node.addEventListener('click', e => {
      const a = e.target.closest('[data-cc]'); if (!a) return;
      if (a.dataset.cc === 'accept') { write(true, true); close(); }
      if (a.dataset.cc === 'reject') { write(false, false); close(); }
      if (a.dataset.cc === 'manage') { close(); panel(); }
    });
    return node;
  }

  function panel() {
    const cur = read() || { analytics: false, marketing: false };
    const node = el(`
      <div class="cc cc-panel" role="dialog" aria-modal="true" aria-labelledby="ccp-t">
        <div class="cc-inner">
          <strong id="ccp-t">Choose your cookies</strong>
          <label class="cc-row">
            <input type="checkbox" checked disabled>
            <span><strong>Strictly necessary</strong><em>Needed for the site to work, such as remembering your saved cars. Always on.</em></span>
          </label>
          <label class="cc-row">
            <input type="checkbox" data-k="analytics" ${cur.analytics ? 'checked' : ''}>
            <span><strong>Analytics</strong><em>Tells us which cars and pages people look at, so we know what to stock.</em></span>
          </label>
          <label class="cc-row">
            <input type="checkbox" data-k="marketing" ${cur.marketing ? 'checked' : ''}>
            <span><strong>Advertising</strong><em>Lets us show our cars to you on other sites. Switching this off does not mean fewer ads, just less relevant ones.</em></span>
          </label>
          <div class="cc-actions">
            <button type="button" class="btn btn-dark" data-cc="save">Save my choice</button>
            <button type="button" class="btn btn-outline" data-cc="reject">Reject all</button>
          </div>
        </div>
      </div>`);
    node.addEventListener('click', e => {
      const a = e.target.closest('[data-cc]'); if (!a) return;
      if (a.dataset.cc === 'save') {
        write(node.querySelector('[data-k=analytics]').checked, node.querySelector('[data-k=marketing]').checked);
      } else { write(false, false); }
      close();
    });
    document.body.appendChild(node);
    node.querySelector('input:not([disabled])')?.focus();
    return node;
  }

  function close() { document.querySelectorAll('.cc').forEach(n => n.remove()); }

  // --- Boot ----------------------------------------------------------------
  const saved = read();
  if (saved) apply(saved);

  function start() {
    if (!read()) document.body.appendChild(banner());
    // Footer link, added by renderChrome, reopens the choices.
    document.addEventListener('click', e => {
      if (e.target.closest('[data-cookie-settings]')) { e.preventDefault(); close(); panel(); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  window.consent = { get: read, open: () => { close(); panel(); }, set: write };
})();
