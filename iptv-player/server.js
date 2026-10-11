#!/usr/bin/env node
// Zero-dependency server: serves the player UI and a small streaming proxy.
//
// Why a proxy? Browsers block cross-origin requests to most IPTV panels (no CORS
// headers) and refuse plain-http streams on https pages. The proxy fetches
// everything server-side, follows redirects, forwards Range requests (seeking)
// and rewrites HLS playlists so every segment also goes through it.
//
// Usage: node server.js            (http://127.0.0.1:8787)
//        PORT=3000 HOST=0.0.0.0 node server.js   (expose on your LAN - see README)

'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_DIR = path.join(__dirname, 'public');
// Many panels reject unknown clients; a VLC user-agent is the de-facto standard.
const UPSTREAM_UA = process.env.UPSTREAM_UA || 'VLC/3.0.20 LibVLC/3.0.20';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

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
  const target = reqUrl.searchParams.get('url');
  let targetUrl;
  try { targetUrl = new URL(target); } catch { res.writeHead(400); return res.end('Bad url'); }
  if (!/^https?:$/.test(targetUrl.protocol)) { res.writeHead(400); return res.end('Bad protocol'); }

  const headers = { 'User-Agent': UPSTREAM_UA, Accept: '*/*' };
  if (req.headers.range) headers.Range = req.headers.range;

  const ac = new AbortController();
  res.on('close', () => ac.abort());

  let up;
  try {
    up = await fetch(targetUrl, { headers, redirect: 'follow', signal: ac.signal });
  } catch (e) {
    if (ac.signal.aborted) return;
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    return res.end('Upstream error: ' + (e.cause?.code || e.message));
  }

  const ctype = up.headers.get('content-type') || '';
  const finalUrl = up.url || targetUrl.href;
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

function serveStatic(req, res, reqUrl) {
  let rel = decodeURIComponent(reqUrl.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url, 'http://localhost');
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
  server.listen(PORT, HOST, () => {
    console.log(`IPTV player running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    if (HOST !== '127.0.0.1' && HOST !== 'localhost') {
      console.log('WARNING: the proxy is reachable from your network. Only do this on a trusted LAN.');
    }
  });
}

module.exports = { server, rewritePlaylist };
