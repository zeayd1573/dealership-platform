'use strict';
/* Xtream Codes player - vanilla JS, no build step. */

const $ = (s, r = document) => r.querySelector(s);
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null) el.append(k.nodeType ? k : document.createTextNode(k));
  return el;
}
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota / private mode */ } },
};
const px = (u) => '/proxy?url=' + encodeURIComponent(u);
const b64 = (s) => { try { return new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0))); } catch { return s || ''; } };

/* ---------------- state ---------------- */
const S = {
  profiles: store.get('profiles', []),
  profile: null, base: '', userInfo: null,
  tab: 'live', cat: 'all', query: '',
  data: {},            // kind -> {cats, items}
  favs: new Set(), prog: {},
  list: [],            // currently displayed items
  playing: null,       // {kind, item, ...}
};
const KINDS = {
  live:   { cats: 'get_live_categories',   items: 'get_live_streams', id: 'stream_id' },
  movies: { cats: 'get_vod_categories',    items: 'get_vod_streams',  id: 'stream_id' },
  series: { cats: 'get_series_categories', items: 'get_series',       id: 'series_id' },
};

/* ---------------- API ---------------- */
function normalizeHost(raw) {
  let v = raw.trim();
  if (!/^https?:\/\//i.test(v)) v = 'http://' + v;
  const u = new URL(v);
  const p = u.pathname.replace(/\/(player_api|get|panel_api|xmltv)\.php$/i, '').replace(/\/+$/, '');
  return u.origin + p;
}
async function api(action, params = {}, profile = S.profile, base = S.base) {
  const q = new URLSearchParams({ username: profile.username, password: profile.password });
  if (action) q.set('action', action);
  for (const [k, v] of Object.entries(params)) q.set(k, v);
  const r = await fetch(px(`${base}/player_api.php?${q}`));
  if (!r.ok) throw new Error(`Server answered ${r.status} ${(await r.text().catch(() => '')).slice(0, 120)}`);
  const text = await r.text();
  try { return JSON.parse(text); } catch { throw new Error('Server did not return valid data (check host/credentials).'); }
}
async function authenticate(profile) {
  const base = normalizeHost(profile.host);
  const info = await api('', {}, profile, base);
  if (!info?.user_info || Number(info.user_info.auth) !== 1) throw new Error('Login rejected: wrong username/password or account disabled.');
  return { base, info };
}
const streamUrl = {
  live: (id, ext) => `${S.base}/live/${enc(S.profile.username)}/${enc(S.profile.password)}/${id}.${ext}`,
  movie: (id, ext) => `${S.base}/movie/${enc(S.profile.username)}/${enc(S.profile.password)}/${id}.${ext}`,
  episode: (id, ext) => `${S.base}/series/${enc(S.profile.username)}/${enc(S.profile.password)}/${id}.${ext}`,
};
const enc = encodeURIComponent;

/* ---------------- profiles ---------------- */
function renderProfiles() {
  const list = $('#profile-list');
  list.replaceChildren();
  if (!S.profiles.length) list.append(h('p', { class: 'muted' }, 'No playlists yet.'));
  for (const p of S.profiles) {
    list.append(h('div', { class: 'profile', onclick: () => openProfile(p) },
      h('div', { class: 'meta' }, h('div', { class: 'name' }, p.name), h('div', { class: 'host' }, `${p.host} · ${p.username}`)),
      h('button', { class: 'btn', onclick: (e) => { e.stopPropagation(); editProfile(p); } }, 'Edit'),
      h('button', { class: 'btn', onclick: (e) => { e.stopPropagation(); if (confirm(`Delete "${p.name}"?`)) { S.profiles = S.profiles.filter((x) => x.id !== p.id); store.set('profiles', S.profiles); renderProfiles(); } } }, 'Delete')));
  }
}
let editing = null;
function editProfile(p) {
  editing = p || null;
  const f = $('#profile-form');
  f.reset();
  $('#dlg-title').textContent = p ? 'Edit playlist' : 'Add playlist';
  if (p) for (const k of ['name', 'host', 'username', 'password']) f.elements[k].value = p[k];
  $('#profile-error').classList.add('hidden');
  $('#dlg-profile').showModal();
}
$('#btn-add-profile').onclick = () => editProfile(null);
$('#btn-cancel-profile').onclick = () => $('#dlg-profile').close();
$('#profile-form').onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target, err = $('#profile-error'), btn = f.querySelector('.primary');
  const p = { id: editing?.id || String(Date.now()), name: f.elements.name.value.trim(), host: f.elements.host.value.trim(), username: f.elements.username.value.trim(), password: f.elements.password.value };
  btn.disabled = true; btn.textContent = 'Connecting…'; err.classList.add('hidden');
  try {
    await authenticate(p);
    S.profiles = editing ? S.profiles.map((x) => (x.id === p.id ? p : x)) : [...S.profiles, p];
    store.set('profiles', S.profiles);
    $('#dlg-profile').close();
    renderProfiles();
    openProfile(p);
  } catch (ex) {
    err.textContent = ex.message; err.classList.remove('hidden');
  } finally { btn.disabled = false; btn.textContent = 'Save & connect'; }
};

async function openProfile(p) {
  $('#view-profiles').classList.add('hidden');
  $('#view-app').classList.remove('hidden');
  $('#content').replaceChildren(h('div', { class: 'empty' }, 'Connecting…'));
  $('#cats').replaceChildren();
  try {
    const { base, info } = await authenticate(p);
    S.profile = p; S.base = base; S.userInfo = info; S.data = {};
    S.favs = new Set(store.get('favs:' + p.id, []));
    S.prog = store.get('prog:' + p.id, {});
    store.set('lastProfile', p.id);
    renderAccount();
    setTab('live');
  } catch (ex) {
    $('#content').replaceChildren(h('div', { class: 'empty' }, ex.message, h('br'), h('br'), h('button', { class: 'btn', onclick: showProfiles }, 'Back')));
  }
}
function showProfiles() {
  closePlayer();
  $('#view-app').classList.add('hidden');
  $('#view-profiles').classList.remove('hidden');
  renderProfiles();
}
$('#btn-back').onclick = showProfiles;
function renderAccount() {
  const u = S.userInfo.user_info;
  const exp = u.exp_date && Number(u.exp_date) ? new Date(Number(u.exp_date) * 1000).toLocaleDateString() : 'unlimited';
  $('#account').replaceChildren(h('b', {}, S.profile.name), h('br'), `${u.status || 'Active'} · expires ${exp} · ${u.active_cons ?? '?'}/${u.max_connections ?? '?'} connections`);
}

/* ---------------- browsing ---------------- */
async function load(kind) {
  if (S.data[kind]) return S.data[kind];
  const k = KINDS[kind];
  const [cats, items] = await Promise.all([api(k.cats), api(k.items)]);
  const arr = (x) => (Array.isArray(x) ? x : []);
  return (S.data[kind] = { cats: arr(cats), items: arr(items).map((i) => ({ ...i, _id: String(i[k.id]), _name: String(i.name || ''), _l: String(i.name || '').toLowerCase() })) });
}
function setTab(tab) {
  S.tab = tab; S.cat = 'all';
  for (const b of $('#tabs').children) b.classList.toggle('active', b.dataset.tab === tab);
  render();
}
$('#tabs').onclick = (e) => { if (e.target.dataset.tab) setTab(e.target.dataset.tab); };
let searchT;
$('#search').oninput = (e) => { clearTimeout(searchT); searchT = setTimeout(() => { S.query = e.target.value.trim().toLowerCase(); renderList(); }, 200); };
$('#btn-refresh').onclick = () => { S.data = {}; render(); };

async function render() {
  const content = $('#content');
  content.replaceChildren(h('div', { class: 'empty' }, 'Loading…'));
  try {
    if (S.tab === 'favs') await Promise.all(Object.keys(KINDS).map(load));
    else await load(S.tab);
  } catch (ex) {
    content.replaceChildren(h('div', { class: 'empty' }, 'Could not load: ' + ex.message));
    return;
  }
  renderCats();
  renderList();
}
function tabItems() {
  if (S.tab === 'favs') {
    const out = [];
    for (const kind of Object.keys(KINDS)) for (const it of S.data[kind]?.items || []) if (S.favs.has(kind + ':' + it._id)) out.push({ ...it, _kind: kind });
    return out;
  }
  return S.data[S.tab].items.map((i) => (i._kind ? i : Object.assign(i, { _kind: S.tab })));
}
function renderCats() {
  const side = $('#cats');
  side.replaceChildren();
  if (S.tab === 'favs') return;
  const items = S.data[S.tab].items, counts = {};
  for (const i of items) counts[i.category_id] = (counts[i.category_id] || 0) + 1;
  const mk = (id, name, n) => h('button', { class: 'cat' + (S.cat === id ? ' active' : ''), onclick: () => { S.cat = id; renderCats(); renderList(); } }, h('span', {}, name), h('span', { class: 'muted' }, n));
  side.append(mk('all', 'All', items.length));
  for (const c of S.data[S.tab].cats) if (counts[c.category_id]) side.append(mk(String(c.category_id), c.category_name, counts[c.category_id]));
}

let renderToken = 0, io;
function renderList() {
  const content = $('#content');
  const token = ++renderToken;
  let items = tabItems();
  if (S.tab !== 'favs' && S.cat !== 'all') items = items.filter((i) => String(i.category_id) === S.cat);
  if (S.query) items = items.filter((i) => i._l.includes(S.query));
  S.list = items;
  if (!items.length) { content.replaceChildren(h('div', { class: 'empty' }, S.tab === 'favs' ? 'No favorites yet. Tap the ☆ on anything.' : 'Nothing found.')); return; }
  const grid = h('div', { class: 'grid' + (S.tab === 'live' ? ' live' : '') });
  content.replaceChildren(grid);
  content.scrollTop = 0;
  io?.disconnect();
  let shown = 0;
  const CHUNK = 90;
  const sentinel = h('div', { class: 'sentinel' });
  const more = () => {
    if (token !== renderToken) return;
    const frag = document.createDocumentFragment();
    for (const it of items.slice(shown, shown + CHUNK)) frag.append(card(it));
    shown += CHUNK;
    grid.append(frag);
    if (shown < items.length) { grid.after(sentinel); } else sentinel.remove();
  };
  io = new IntersectionObserver((en) => { if (en[0].isIntersecting) more(); }, { root: content, rootMargin: '600px' });
  io.observe(sentinel);
  more();
}

const imgSrc = (u) => (u ? (location.protocol === 'https:' ? px(u) : u) : '');
function favButton(it) {
  const key = it._kind + ':' + it._id;
  const b = h('button', { class: 'star' + (S.favs.has(key) ? ' on' : ''), title: 'Favorite', onclick: (e) => { e.stopPropagation(); toggleFav(it); b.classList.toggle('on', S.favs.has(key)); b.textContent = S.favs.has(key) ? '★' : '☆'; if (S.tab === 'favs') renderList(); } }, S.favs.has(key) ? '★' : '☆');
  return b;
}
function toggleFav(it) {
  const key = it._kind + ':' + it._id;
  S.favs.has(key) ? S.favs.delete(key) : S.favs.add(key);
  store.set('favs:' + S.profile.id, [...S.favs]);
}
function img(url, cls, alt) {
  const i = h('img', { class: cls, loading: 'lazy', referrerpolicy: 'no-referrer', alt: '', src: imgSrc(url) });
  i.onerror = () => { i.style.visibility = 'hidden'; };
  return url ? i : h('div', { class: cls });
}
function card(it) {
  if (it._kind === 'live') {
    return h('div', { class: 'card row', onclick: () => playLive(it) }, img(it.stream_icon, 'logo'), h('div', { class: 'title' }, it._name), favButton(it));
  }
  const poster = it._kind === 'series' ? it.cover : it.stream_icon;
  const p = S.prog[(it._kind === 'movies' ? 'movie:' : 'x:') + it._id];
  const rating = Number(it.rating);
  return h('div', { class: 'card', onclick: () => (it._kind === 'series' ? openSeries(it) : openMovie(it)) },
    h('div', { class: 'poster' }, poster ? img(poster, '') : '🎬'),
    rating > 0 ? h('div', { class: 'badge' }, '★ ' + rating.toFixed(1)) : null,
    favButton(it),
    h('div', { class: 'title' }, it._name),
    p && p.d ? h('div', { class: 'progress', style: `width:${Math.min(100, (p.t / p.d) * 100)}%` }) : null);
}

/* ---------------- details ---------------- */
const dlg = $('#dlg-detail');
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
function detailHead(poster, title, meta, plot) {
  return h('div', { class: 'detail-head' }, poster ? img(poster, '') : null,
    h('div', { class: 'info' }, h('h2', {}, title), h('div', { class: 'muted' }, meta.filter(Boolean).join(' · ')), h('p', { class: 'plot' }, plot || '')));
}
async function openMovie(it) {
  const body = $('#detail');
  body.replaceChildren(h('p', { class: 'muted' }, 'Loading…'));
  dlg.showModal();
  let info = {};
  try { info = (await api('get_vod_info', { vod_id: it._id })).info || {}; } catch { /* fall back to list data */ }
  const ext = it.container_extension || 'mp4';
  const key = 'movie:' + it._id, saved = S.prog[key];
  body.replaceChildren(
    detailHead(info.movie_image || it.stream_icon, it._name, [info.releasedate || info.releaseDate, info.genre, info.duration, info.rating && '★ ' + info.rating], info.plot || info.description),
    h('div', { class: 'dlg-actions' },
      h('button', { class: 'btn', onclick: () => dlg.close() }, 'Close'),
      saved && saved.t > 30 ? h('button', { class: 'btn', onclick: () => { dlg.close(); playVod(it, key, streamUrl.movie(it._id, ext), it._name, 0); } }, 'Start over') : null,
      h('button', { class: 'btn primary', onclick: () => { dlg.close(); playVod(it, key, streamUrl.movie(it._id, ext), it._name); } }, saved && saved.t > 30 ? `Resume ${fmt(saved.t)}` : '▶ Play')));
}
async function openSeries(it) {
  const body = $('#detail');
  body.replaceChildren(h('p', { class: 'muted' }, 'Loading…'));
  dlg.showModal();
  let data;
  try { data = await api('get_series_info', { series_id: it._id }); } catch (ex) { body.replaceChildren(h('p', { class: 'error' }, ex.message)); return; }
  const info = data.info || {};
  const eps = data.episodes || {};
  const seasons = Object.keys(eps).sort((a, b) => a - b);
  const epList = h('div', { class: 'episodes' });
  const seasonBar = h('div', { class: 'seasons' });
  const show = (s) => {
    for (const b of seasonBar.children) b.classList.toggle('active', b.dataset.s === s);
    const list = eps[s];
    epList.replaceChildren(...list.map((e, idx) => {
      const key = 'ep:' + e.id, p = S.prog[key];
      return h('button', { class: 'ep', onclick: () => { dlg.close(); playEpisode(it, list, idx); } },
        h('span', { class: 'n' }, e.episode_num), h('span', { class: 't' }, e.title || `Episode ${e.episode_num}`),
        h('span', { class: 'muted' }, p && p.d ? (p.t / p.d > 0.95 ? '✓' : Math.round((p.t / p.d) * 100) + '%') : (e.info?.duration || '')));
    }));
  };
  for (const s of seasons) seasonBar.append(h('button', { 'data-s': s, onclick: () => show(s) }, 'Season ' + s));
  body.replaceChildren(
    detailHead(info.cover || it.cover, it._name, [info.releaseDate || info.releasedate, info.genre, info.rating && '★ ' + info.rating], info.plot),
    ...(seasons.length ? [seasonBar, epList] : [h('p', { class: 'muted' }, 'No episodes available.')]),
    h('div', { class: 'dlg-actions' }, h('button', { class: 'btn', onclick: () => dlg.close() }, 'Close')));
  if (seasons.length) show(seasons[0]);
}
const fmt = (s) => { s = Math.floor(s); const m = Math.floor(s / 60), h2 = Math.floor(m / 60); return (h2 ? h2 + ':' : '') + String(m % 60).padStart(h2 ? 2 : 1, '0') + ':' + String(s % 60).padStart(2, '0'); };

/* ---------------- player ---------------- */
const video = $('#video'), pEl = $('#player'), pMsg = $('#p-msg');
let hls = null, mpegts = null, saveT = 0;
const P = { live: false, key: null, onEnded: null };

function destroyEngines() {
  hls?.destroy(); hls = null;
  if (mpegts) { try { mpegts.destroy(); } catch { /* ignore */ } mpegts = null; }
  video.removeAttribute('src'); video.load();
}
function message(text) { pMsg.textContent = text || ''; pMsg.classList.toggle('hidden', !text); }
function openPlayer(title) {
  pEl.classList.remove('hidden');
  $('#p-title').textContent = title;
  message('');
}
function closePlayer() {
  saveProgress(true);
  destroyEngines();
  pEl.classList.add('hidden');
  P.key = null; P.onEnded = null; S.playing = null;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  if (S.tab && !$('#view-app').classList.contains('hidden') && S.tab !== 'live') refreshProgressBars();
}
$('#p-close').onclick = closePlayer;
$('#p-fs').onclick = toggleFs;
function toggleFs() { document.fullscreenElement ? document.exitFullscreen() : pEl.requestFullscreen?.().catch(() => {}); }

function startHls(url, onFail) {
  if (!window.Hls || !Hls.isSupported()) {
    if (video.canPlayType('application/vnd.apple.mpegurl')) { video.src = px(url); return; }
    return onFail('HLS is not supported in this browser.');
  }
  hls = new Hls({ lowLatencyMode: false, maxBufferLength: 30 });
  hls.on(Hls.Events.ERROR, (_, d) => {
    if (!d.fatal) return;
    if (d.type === Hls.ErrorTypes.NETWORK_ERROR && d.details !== 'manifestLoadError') { hls.startLoad(); return; }
    onFail(`Stream error (${d.details}).`);
  });
  hls.loadSource(px(url));
  hls.attachMedia(video);
}
function startTs(url, onFail) {
  if (!window.mpegts || !mpegts_supported()) return onFail('Raw .ts streams are not supported in this browser.');
  mpegts = window.mpegts.createPlayer({ type: 'mpegts', isLive: true, url: px(url) }, { enableWorker: true, liveBufferLatencyChasing: true });
  mpegts.on(window.mpegts.Events.ERROR, () => onFail('Stream error. The channel may be offline.'));
  mpegts.attachMediaElement(video);
  mpegts.load();
}
const mpegts_supported = () => window.mpegts?.getFeatureList?.().mseLivePlayback;

function playLive(it) {
  destroyEngines();
  S.playing = { kind: 'live', item: it };
  Object.assign(P, { live: true, key: null, onEnded: null });
  openPlayer(it._name);
  const fav = $('#p-fav'); fav.textContent = S.favs.has('live:' + it._id) ? '★' : '☆'; fav.classList.toggle('on', S.favs.has('live:' + it._id));
  fav.onclick = () => { toggleFav({ ...it, _kind: 'live' }); const on = S.favs.has('live:' + it._id); fav.textContent = on ? '★' : '☆'; fav.classList.toggle('on', on); };
  for (const id of ['p-prev', 'p-next']) $('#' + id).classList.remove('hidden');
  message('Loading…');
  video.onplaying = () => message('');
  const formats = (S.userInfo.user_info.allowed_output_formats || ['m3u8', 'ts']).map((f) => f.toLowerCase());
  const hlsOk = formats.includes('m3u8'), tsOk = formats.includes('ts');
  const fail = (m) => message(m + ' Try another channel.');
  const tryTs = (why) => (tsOk ? (destroyEngines(), startTs(streamUrl.live(it._id, 'ts'), fail)) : fail(why));
  if (hlsOk) startHls(streamUrl.live(it._id, 'm3u8'), (why) => tryTs(why));
  else tryTs('Server allows no playable format.');
  video.play().catch(() => {});
  loadEpg(it);
}
function zap(dir) {
  const cur = S.playing;
  if (!cur || cur.kind !== 'live') return;
  const i = S.list.findIndex((x) => x._id === cur.item._id && x._kind === 'live');
  const next = S.list[i + dir];
  if (next && next._kind === 'live') playLive(next);
}
$('#p-prev').onclick = () => zap(-1);
$('#p-next').onclick = () => zap(1);

async function loadEpg(it) {
  const side = $('#p-side');
  side.classList.remove('hidden');
  side.replaceChildren(h('h3', {}, 'Program guide'), h('p', { class: 'muted' }, 'Loading…'));
  try {
    const r = await api('get_short_epg', { stream_id: it._id, limit: 8 });
    if (S.playing?.item !== it) return;
    const list = r.epg_listings || [];
    const now = Date.now() / 1000;
    side.replaceChildren(h('h3', {}, 'Program guide'),
      ...(list.length ? list.map((e) => {
        const s = Number(e.start_timestamp), t = Number(e.stop_timestamp);
        const time = (x) => new Date(x * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return h('div', { class: 'epg-item' + (s <= now && now < t ? ' now' : '') }, h('div', { class: 'time' }, `${time(s)} – ${time(t)}`), h('div', {}, b64(e.title)), h('div', { class: 'desc' }, b64(e.description).slice(0, 220)));
      }) : [h('p', { class: 'muted' }, 'No guide data for this channel.')]));
  } catch { side.replaceChildren(h('h3', {}, 'Program guide'), h('p', { class: 'muted' }, 'Guide unavailable.')); }
}

function playVod(it, key, url, title, startAt, extra = {}) {
  destroyEngines();
  S.playing = { kind: 'vod', item: it };
  Object.assign(P, { live: false, key, onEnded: extra.onEnded || null });
  openPlayer(title);
  $('#p-side').classList.add('hidden');
  for (const id of ['p-prev', 'p-next']) $('#' + id).classList.add('hidden');
  const fav = $('#p-fav');
  const favKey = it._kind + ':' + it._id;
  fav.classList.toggle('hidden', !it._kind);
  fav.textContent = S.favs.has(favKey) ? '★' : '☆'; fav.classList.toggle('on', S.favs.has(favKey));
  fav.onclick = () => { toggleFav(it); const on = S.favs.has(favKey); fav.textContent = on ? '★' : '☆'; fav.classList.toggle('on', on); };
  message('Loading…');
  video.onplaying = () => message('');
  const resume = startAt ?? S.prog[key]?.t ?? 0;
  video.onloadedmetadata = () => { if (resume > 10 && (!video.duration || resume < video.duration - 20)) video.currentTime = resume; };
  if (/\.m3u8(\?|$)/.test(url)) startHls(url, message);
  else video.src = px(url);
  video.play().catch(() => {});
}
function playEpisode(series, list, idx) {
  const e = list[idx];
  const ext = e.container_extension || 'mp4';
  playVod({ ...series, _kind: series._kind || 'series' }, 'ep:' + e.id, streamUrl.episode(e.id, ext), `${series._name} – S${e.season || ''}E${e.episode_num} ${e.title || ''}`.trim(), undefined,
    { onEnded: () => { if (list[idx + 1]) playEpisode(series, list, idx + 1); } });
}

video.addEventListener('error', () => {
  if (hls || mpegts) return; // engines report their own errors
  const c = video.error;
  message(c?.code === 4 ? 'This format cannot be played in the browser (try another title, or MP4/HLS sources).' : 'Playback error: ' + (c?.message || 'unknown'));
});
video.addEventListener('timeupdate', () => { if (P.key && Date.now() - saveT > 5000) saveProgress(); });
video.addEventListener('ended', () => { if (P.key) { saveProgress(true); } P.onEnded?.(); });
function saveProgress(force) {
  if (!P.key || !video.duration || !isFinite(video.duration) || (!force && !video.currentTime)) return;
  saveT = Date.now();
  S.prog[P.key] = { t: video.currentTime, d: video.duration };
  store.set('prog:' + S.profile.id, S.prog);
}
function refreshProgressBars() { if (!$('#view-app').classList.contains('hidden')) renderList(); }

document.addEventListener('keydown', (e) => {
  if (pEl.classList.contains('hidden') || /input|textarea/i.test(e.target.tagName)) return;
  if (e.key === 'Escape' && !document.fullscreenElement) closePlayer();
  else if (e.key === 'f' || e.key === 'F') toggleFs();
  else if (e.key === 'ArrowUp' && P.live) { e.preventDefault(); zap(-1); }
  else if (e.key === 'ArrowDown' && P.live) { e.preventDefault(); zap(1); }
  else if (e.key === ' ') { e.preventDefault(); video.paused ? video.play() : video.pause(); }
  else if (e.key === 'ArrowLeft' && !P.live) video.currentTime -= 10;
  else if (e.key === 'ArrowRight' && !P.live) video.currentTime += 10;
});

/* ---------------- boot ---------------- */
renderProfiles();
const last = S.profiles.find((p) => p.id === store.get('lastProfile'));
if (last && location.hash !== '#profiles') openProfile(last);
