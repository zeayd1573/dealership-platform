#!/usr/bin/env node
// Zero-dependency server: serves the player UI and a small streaming proxy.
//
// Why a proxy? Browsers block cross-origin requests to most IPTV panels (no CORS
// headers) and refuse plain-http streams on https pages. The proxy fetches
// everything server-side, follows redirects, forwards Range requests (seeking)
// and rewrites HLS playlists so every segment also goes through it.
//
// Local use:   node server.js                       -> http://127.0.0.1:8787
// Hosted use:  ACCESS_PASSWORD=... node server.js   -> listens on 0.0.0.0:$PORT
//   With ACCESS_PASSWORD set the whole site (UI + proxy) sits behind a login, and the
//   proxy refuses to fetch private/internal addresses (SSRF protection).

'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');
const dns = require('dns').promises;
const crypto = require('crypto');
const { Readable } = require('stream');

const PASSWORD = process.env.ACCESS_PASSWORD || '';
const PUBLIC_MODE = Boolean(PASSWORD);
const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || (PUBLIC_MODE ? '0.0.0.0' : '127.0.0.1');
const ALLOW_PRIVATE = process.env.ALLOW_PRIVATE === '1' || !PUBLIC_MODE;
const PUBLIC_DIR = path.join(__dirname, 'public');
// Many panels reject unknown clients; a VLC user-agent is the de-facto standard.
const UPSTREAM_UA = process.env.UPSTREAM_UA || 'VLC/3.0.20 LibVLC/3.0.20';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};
// Reachable without logging in: the login page's own assets and PWA install files (nothing sensitive).
const PUBLIC_FILES = new Set(['/manifest.webmanifest', '/sw.js', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png']);

/* ---------------- auth ---------------- */
const SESSION_TOKEN = PASSWORD ? crypto.createHmac('sha256', PASSWORD).update('xtream-player-session-v1').digest('hex') : '';
const safeEqual = (a, b) => {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};
function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
const isAuthed = (req) => !PUBLIC_MODE || (parseCookies(req).xp_auth && safeEqual(parseCookies(req).xp_auth, SESSION_TOKEN));

const failures = new Map(); // ip -> {n, until}
function clientIp(req) { return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?'; }

function loginPage(msg = '') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#0b0d12"><link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<title>Xtream Player – Sign in</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0d12;color:#e8ebf3;font:15px system-ui,-apple-system,sans-serif}
form{width:min(340px,90vw);background:#131722;border:1px solid #232a3b;border-radius:14px;padding:24px}
h1{margin:0 0 14px;font-size:20px}input,button{width:100%;box-sizing:border-box;font:inherit;padding:12px;border-radius:8px;border:1px solid #232a3b;margin-top:10px}
input{background:#0b0d12;color:inherit}button{background:#4f8cff;border-color:#4f8cff;color:#fff;cursor:pointer}.e{color:#ff5d6c;margin:10px 0 0}
</style></head><body><form method="post" action="/login"><h1>Xtream Player</h1>
<input type="password" name="password" placeholder="Access password" autofocus autocomplete="current-password" required>
<button type="submit">Sign in</button>${msg ? `<p class="e">${msg}</p>` : ''}</form></body></html>`;
}

function handleLogin(req, res) {
  const ip = clientIp(req);
  const f = failures.get(ip);
  if (f && f.n >= 5 && Date.now() < f.until) {
    res.writeHead(429, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(loginPage('Too many attempts. Try again in a few minutes.'));
  }
  let body = '';
  req.on('data', (c) => { body += c; if (body.length > 2048) req.destroy(); });
  req.on('end', () => {
    const pw = new URLSearchParams(body).get('password') || '';
    if (safeEqual(pw, PASSWORD)) {
      failures.delete(ip);
      const secure = (req.headers['x-forwarded-proto'] || '').split(',')[0] === 'https' ? '; Secure' : '';
      res.writeHead(303, { Location: '/', 'Set-Cookie': `xp_auth=${SESSION_TOKEN}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${60 * 60 * 24 * 90}${secure}` });
      return res.end();
    }
    const n = (f?.n || 0) + 1;
    failures.set(ip, { n, until: Date.now() + 15 * 60 * 1000 });
    res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(loginPage('Wrong password.'));
  });
}

/* ---------------- SSRF guard ---------------- */
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v = ip.toLowerCase();
  if (v === '::1' || v === '::') return true;
  if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
  return /^f[cd]/.test(v) || /^fe[89ab]/.test(v);
}
async function assertPublicHost(hostname) {
  if (ALLOW_PRIVATE) return;
  const h = hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(h) ? [{ address: h }] : await dns.lookup(h, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error('Blocked: private or internal address');
}

// Manual redirect loop so every hop is checked by the SSRF guard.
async function upstreamFetch(url, headers, signal) {
  let cur = url;
  for (let hop = 0; hop < 6; hop++) {
    await assertPublicHost(cur.hostname);
    const r = await fetch(cur, { headers, redirect: 'manual', signal });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
      cur = new URL(r.headers.get('location'), cur);
      if (!/^https?:$/.test(cur.protocol)) throw new Error('Blocked redirect protocol');
      r.body?.cancel?.().catch(() => {});
      continue;
    }
    return { res: r, url: cur.href };
  }
  throw new Error('Too many redirects');
}

/* ---------------- proxy ---------------- */
function proxyUrl(abs) { return '/proxy?url=' + encodeURIComponent(abs); }

function rewritePlaylist(text, baseUrl) {
  const resolve = (u) => { try { return proxyUrl(new URL(u, baseUrl).href); } catch { return u; } };
  return text.split(/\r?\n/).map((line) => {
    if (!line.trim()) return line;
    if (line.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_, u) => `URI="${resolve(u)}"`);
    return resolve(line.trim());
  }).join('\n');
}

async function handleProxy(req, res, reqUrl) {
  let targetUrl;
  try { targetUrl = new URL(reqUrl.searchParams.get('url')); } catch { res.writeHead(400); return res.end('Bad url'); }
  if (!/^https?:$/.test(targetUrl.protocol)) { res.writeHead(400); return res.end('Bad protocol'); }

  const headers = { 'User-Agent': UPSTREAM_UA, Accept: '*/*' };
  if (req.headers.range) headers.Range = req.headers.range;

  const ac = new AbortController();
  res.on('close', () => ac.abort());

  let up, finalUrl;
  try {
    ({ res: up, url: finalUrl } = await upstreamFetch(targetUrl, headers, ac.signal));
  } catch (e) {
    if (ac.signal.aborted) return;
    res.writeHead(/^Blocked/.test(e.message) ? 403 : 502, { 'Content-Type': 'text/plain' });
    return res.end(/^Blocked/.test(e.message) ? e.message : 'Upstream error: ' + (e.cause?.code || e.message));
  }

  const ctype = up.headers.get('content-type') || '';
  const looksHls = /mpegurl/i.test(ctype) || /\.m3u8?(\?|$)/i.test(finalUrl);

  if (looksHls && up.ok) {
    const body = await up.text();
    if (body.trimStart().startsWith('#EXTM3U')) {
      res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store' });
      return res.end(rewritePlaylist(body, finalUrl));
    }
    res.writeHead(up.status, { 'Content-Type': ctype || 'text/plain' });
    return res.end(body);
  }

  const out = { 'Cache-Control': 'no-store' };
  for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
    const v = up.headers.get(h);
    if (v) out[h] = v;
  }
  res.writeHead(up.status, out);
  if (!up.body) return res.end();
  const stream = Readable.fromWeb(up.body);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

/* ---------------- static + routing ---------------- */
function serveStatic(req, res, reqUrl) {
  let rel;
  try { rel = decodeURIComponent(reqUrl.pathname); } catch { res.writeHead(400); return res.end(); }
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url, 'http://localhost');
  if (reqUrl.pathname === '/healthz') { res.writeHead(200); return res.end('ok'); }

  if (PUBLIC_MODE && reqUrl.pathname === '/login') {
    if (req.method === 'POST') return handleLogin(req, res);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(loginPage());
  }
  if (!isAuthed(req) && !PUBLIC_FILES.has(reqUrl.pathname)) {
    if (reqUrl.pathname === '/proxy') { res.writeHead(401); return res.end('Sign in required'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(loginPage());
  }

  if (reqUrl.pathname === '/proxy' && (req.method === 'GET' || req.method === 'HEAD')) {
    return handleProxy(req, res, reqUrl).catch((e) => {
      if (!res.headersSent) res.writeHead(500);
      res.end('Proxy failure: ' + e.message);
    });
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  serveStatic(req, res, reqUrl);
});

if (require.main === module) {
  const loopback = HOST === '127.0.0.1' || HOST === 'localhost' || HOST === '::1';
  if (!loopback && !PUBLIC_MODE && process.env.ALLOW_OPEN_PROXY !== '1') {
    console.error('Refusing to listen on a public interface without ACCESS_PASSWORD (it would be an open proxy).\n' +
      'Set ACCESS_PASSWORD=<something long>, or ALLOW_OPEN_PROXY=1 if you really are on a trusted private network.');
    process.exit(1);
  }
  server.listen(PORT, HOST, () => {
    console.log(`IPTV player running on ${HOST}:${PORT}` + (PUBLIC_MODE ? ' (password protected, private addresses blocked)' : ''));
  });
}

module.exports = { server, rewritePlaylist, isPrivateIp };
