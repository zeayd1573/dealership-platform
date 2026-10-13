#!/usr/bin/env node
// Fake Xtream Codes panel for trying the player without a real subscription.
//   node test/mock-xtream.js <mediaDir> [port]
// <mediaDir> must contain sample.mp4 and hls/index.m3u8 (+ segments); see test/README in the main README.
// Then add playlist: host http://127.0.0.1:9090  user: demo  pass: demo
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const dir = process.argv[2];
const port = Number(process.argv[3]) || 9090;
const b64 = (s) => Buffer.from(s).toString('base64');
const now = Math.floor(Date.now() / 1000);

const live = Array.from({ length: 250 }, (_, i) => ({ num: i + 1, name: `Channel ${i + 1}`, stream_id: 1000 + i, stream_icon: '', category_id: String(1 + (i % 3)) }));
const movies = Array.from({ length: 40 }, (_, i) => ({ name: `Movie ${i + 1}`, stream_id: 2000 + i, stream_icon: '', rating: String((i % 10) + 0.5), category_id: String(10 + (i % 2)), container_extension: 'mp4' }));
const series = [{ name: 'Demo Series', series_id: 3000, cover: '', category_id: '20', plot: 'A demo show.' }];

const routes = {
  '': () => ({ user_info: { auth: 1, status: 'Active', exp_date: String(now + 86400 * 90), max_connections: '1', active_cons: '0', allowed_output_formats: ['m3u8', 'ts'] }, server_info: {} }),
  get_live_categories: () => [1, 2, 3].map((i) => ({ category_id: String(i), category_name: `Live Group ${i}` })),
  get_live_streams: () => live,
  get_vod_categories: () => [{ category_id: '10', category_name: 'Action' }, { category_id: '11', category_name: 'Drama' }],
  // Like some real panels: the unfiltered list is capped (set MOCK_CAP), per-category requests return everything.
  get_vod_streams: (q) => (q.get('category_id') ? movies.filter((m) => m.category_id === q.get('category_id')) : movies.slice(0, Number(process.env.MOCK_CAP) || movies.length)),
  get_vod_info: () => ({ info: { plot: 'A mock movie for testing.', genre: 'Test', duration: '00:00:05', releasedate: '2024-01-01' } }),
  get_series_categories: () => [{ category_id: '20', category_name: 'Shows' }],
  get_series: () => series,
  get_series_info: () => ({ info: { plot: 'A demo show.', genre: 'Test' }, episodes: { 1: [1, 2, 3].map((n) => ({ id: String(4000 + n), episode_num: n, title: `Pilot ${n}`, container_extension: 'mp4', season: 1, info: { duration: '00:00:05' } })), 2: [{ id: '4010', episode_num: 1, title: 'Return', container_extension: 'mp4', season: 2, info: {} }] } }),
  get_short_epg: () => ({ epg_listings: [0, 1, 2].map((i) => ({ title: b64('Show ' + i), description: b64('Description ' + i), start_timestamp: String(now - 1800 + i * 3600), stop_timestamp: String(now + 1800 + i * 3600) })) }),
};

function sendFile(req, res, file, type) {
  const st = fs.statSync(file);
  const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
  if (m) {
    const s = Number(m[1]), e = m[2] ? Number(m[2]) : st.size - 1;
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${s}-${e}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': e - s + 1 });
    return fs.createReadStream(file, { start: s, end: e }).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes' });
  fs.createReadStream(file).pipe(res);
}

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  console.log(req.method, req.url.slice(0, 100));
  if (u.pathname === '/player_api.php') {
    if (u.searchParams.get('username') !== 'demo' || u.searchParams.get('password') !== 'demo') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ user_info: { auth: 0 } }));
    }
    const fn = routes[u.searchParams.get('action') || ''];
    res.writeHead(fn ? 200 : 404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(fn ? fn(u.searchParams) : {}));
  }
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts[0] === 'live' && parts[3]?.endsWith('.m3u8')) {
    // Real panels often redirect to a load-balancer path; emulate it.
    res.writeHead(302, { Location: '/hls/index.m3u8' }); return res.end();
  }
  if (parts[0] === 'hls') {
    const f = path.join(dir, 'hls', path.basename(u.pathname));
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    return sendFile(req, res, f, f.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t');
  }
  if (parts[0] === 'movie' || parts[0] === 'series') return sendFile(req, res, path.join(dir, 'sample.mp4'), 'video/mp4');
  res.writeHead(404); res.end();
}).listen(port, '127.0.0.1', () => console.log('Mock Xtream panel on http://127.0.0.1:' + port + '  (demo/demo)'));
