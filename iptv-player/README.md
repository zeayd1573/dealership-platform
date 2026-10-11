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
- Netflix-style Home: Continue Watching (movies + series, resumes mid-episode, or jumps to the next episode when you finished one) and My List shelves; ☆ anything to add it
- Series pages have a "Continue S1 E3" / "Next" button; autoplay crosses seasons
- Account info (expiry, connections)

## How it works
`server.js` serves the UI plus `/proxy?url=...`, which fetches panel data and streams server-side. This avoids browser CORS /
mixed-content blocks, follows redirects, supports seeking (Range) and rewrites HLS playlists. `hls.js` and `mpegts.js` are vendored in `public/vendor`.

## Host it so you can use it on your phone
The player needs its small server running somewhere your phone can reach. Hosted mode adds a login page and blocks the proxy
from touching private/internal addresses, so strangers can't use it.

**Easiest: Render (free tier)**
1. Merge this branch (or point Render at it), then on https://render.com choose **New -> Blueprint** and select this repo.
   It reads `iptv-player/render.yaml` and builds the `Dockerfile`.
2. In the Render dashboard open the service -> **Environment** and copy the generated `ACCESS_PASSWORD` (or set your own long one).
3. Open `https://<your-service>.onrender.com` on your iPhone, sign in, add your playlist.
4. Safari **Share -> Add to Home Screen** - it then launches full-screen like an app.

**Any other host / your own machine:** `docker build -t xtream-player . && docker run -p 8787:8787 -e ACCESS_PASSWORD='long-secret' xtream-player`
(or `ACCESS_PASSWORD='long-secret' node server.js`). Put it behind HTTPS (Render, Fly, Cloudflare Tunnel, Caddy...).

Things to know
- All video flows **through the host**, so it uses the host's bandwidth. Free tiers sleep when idle (first load is slow) and may cap
  bandwidth. Some hosts also forbid proxying streaming content - check your host's terms.
- Your playlists/favorites/history live in the browser on each device; they are not synced between phone and laptop.
- Without `ACCESS_PASSWORD` the server refuses to listen on a public interface (override only on a trusted LAN with `ALLOW_OPEN_PROXY=1`).
- `ALLOW_PRIVATE=1` lets a hosted instance reach private addresses (e.g. an IPTV box on your LAN) - leave it off for internet hosting.
- iPhone plays HLS natively; MKV/HEVC-only titles may not play in Safari.

## Notes
- Locally the proxy binds to 127.0.0.1 only. For phone/LAN/internet use, see the hosting section above (password required).
- Browsers can't decode every codec: MKV/HEVC/AC3 titles may not play. Prefer MP4/H.264 sources or a browser with HEVC support.
- Some panels limit simultaneous connections; closing the player frees the slot.
- Try without a subscription: `node test/mock-xtream.js <dir-with-sample.mp4-and-hls/index.m3u8>` then add host `127.0.0.1:9090`, user/pass `demo`.
