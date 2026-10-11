# Xtream Player

A self-hosted web player for Xtream Codes IPTV playlists (the kind Smart IPTV / IPTV Smarters / TiviMate use).
Enter your playlist name, server host, username and password - that's it. It ships **no content**; it only plays what your own subscription provides.

## Run
```
cd iptv-player
node server.js        # needs Node 18+, no npm install required
```
Open http://127.0.0.1:8787, click **Add playlist**.

## Features
- Multiple saved playlists (stored in your browser's localStorage only)
- Live TV with categories, search, channel up/down (arrow keys), program guide (EPG), HLS with raw-TS fallback
- Movies and Series (seasons/episodes, auto-play next episode), resume where you left off
- Favorites, account info (expiry, connections)

## How it works
`server.js` serves the UI plus `/proxy?url=...`, which fetches panel data and streams server-side. This avoids browser CORS /
mixed-content blocks, follows redirects, supports seeking (Range) and rewrites HLS playlists. `hls.js` and `mpegts.js` are vendored in `public/vendor`.

## Notes
- The proxy is bound to 127.0.0.1 by default. If you set `HOST=0.0.0.0` to watch from a phone/TV on your LAN, it becomes an open
  proxy for that network - only do this on a trusted network.
- Browsers can't decode every codec: MKV/HEVC/AC3 titles may not play. Prefer MP4/H.264 sources or a browser with HEVC support.
- Some panels limit simultaneous connections; closing the player frees the slot.
- Try without a subscription: `node test/mock-xtream.js <dir-with-sample.mp4-and-hls/index.m3u8>` then add host `127.0.0.1:9090`, user/pass `demo`.
