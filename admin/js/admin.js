/* =====================================================
   DEALER ADMIN — shared: API, auth, layout, helpers
   ===================================================== */
const API_BASE = window.API_BASE ?? (location.port === '8787' || !/^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? '' : 'http://localhost:8787');
const API = API_BASE + '/api';
const TOKEN_KEY = 'dealer_admin_token';
window.API = API; window.API_BASE = API_BASE;

const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
const setToken = t => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {} };
const onLogin = /\/login(\.html)?\/?$/.test(location.pathname);
if (!onLogin && !getToken()) location.replace('login.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search));

/** fetch wrapper: JSON in/out, token attached, 401 -> login, errors thrown with server message. */
async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  const t = getToken(); if (t) headers.Authorization = 'Bearer ' + t;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(API + path, { method, headers, body: form ? form : body !== undefined ? JSON.stringify(body) : undefined });
  if (res.status === 401 && !onLogin) { setToken(null); location.replace('login.html?expired=1'); throw new Error('Session expired'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/* ── Icons ─────────────────────────────────────────── */
const I = {
  car: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17h-2v-5l2-5h14l2 5v5h-2"/><path d="M5 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0M15 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0"/><path d="M3 12h18"/></svg>',
  inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22"><path d="m6 9 6 6 6-6"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.9 2z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 7L2 7"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.4-.5c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.2-.3-.3-.6-.4zM12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>'
};
window.I = I;

/* ── Helpers ───────────────────────────────────────── */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = n => n == null || n === '' ? '—' : '€' + Number(n).toLocaleString('en-IE');
const km = n => n == null ? '—' : Number(n).toLocaleString('en-IE') + ' km';
const STATUS_LABEL = { available: 'Live', paused: 'Paused', reserved: 'Reserved', sold: 'Sold', archived: 'Archived' };
const timeAgo = iso => {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T') + (iso.endsWith('Z') ? '' : 'Z')); const s = (Date.now() - d) / 1000;
  if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)} min ago`; if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  const days = Math.floor(s / 86400); return days === 1 ? 'yesterday' : days < 30 ? `${days} days ago` : d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' });
};
const monthLabel = iso => { const m = /^(\d{4})-(\d{2})/.exec(iso || ''); return m ? `${m[2]}/${m[1]}` : ''; };
Object.assign(window, { esc, eur, km, timeAgo, monthLabel, STATUS_LABEL, api, getToken, setToken });

let toastTimer;
function toast(msg, isErr) {
  let el = document.querySelector('.toast'); if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg; el.classList.toggle('err', !!isErr); el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}
window.toast = toast;

function confirmBox(msg) { return Promise.resolve(window.confirm(msg)); }
window.confirmBox = confirmBox;

/* ── Layout: sidebar nav + counts ──────────────────── */
async function renderShell(active) {
  const side = document.querySelector('.side'); if (!side) return;
  const dealer = await fetch(API + '/public/dealer').then(r => r.ok ? r.json() : null).catch(() => null);
  const items = [['index.html', 'Stock', I.car, ''], ['enquiries.html', 'Enquiries', I.inbox, 'n-enq'], ['reviews.html', 'Reviews', I.star, 'n-rev'], ['website.html', 'Website', I.globe, ''], ['settings.html', 'Settings', I.gear, '']];
  side.innerHTML = `
    <div class="brand"><strong>${esc(dealer?.name || 'Dealer')}</strong><span>Control panel</span></div>
    <a class="btn btn-primary add-btn" href="car.html">${I.plus} Add a car</a>
    ${items.map(([h, t, ic, id]) => `<a class="nav-item" href="${h}" ${active === h ? 'aria-current="page"' : ''}>${ic}<span>${t}</span>${id ? `<span class="pill" id="${id}" data-n="0"></span>` : ''}</a>`).join('')}
    <div class="grow"></div>
    <button class="nav-item logout" type="button" id="logout">${I.logout}<span>Log out</span></button>`;
  document.getElementById('logout')?.addEventListener('click', () => { setToken(null); location.href = 'login.html'; });
  window.dealer = dealer;
  refreshCounts();
}
async function refreshCounts() {
  try {
    const s = await api('/vehicles/stats');
    const set = (id, n) => { const el = document.getElementById(id); if (el) { el.textContent = n; el.dataset.n = n; } };
    set('n-enq', s.unread_enquiries); set('n-rev', s.pending_reviews);
    window.stats = s; document.dispatchEvent(new CustomEvent('stats', { detail: s }));
  } catch {}
}
window.renderShell = renderShell; window.refreshCounts = refreshCounts;
