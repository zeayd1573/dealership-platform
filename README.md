# Dealership Platform

Car-dealer website + control panel + API, running on Cloudflare (Workers, D1, R2, Images).
First live dealer: MHL Motors, Kilbeggan — https://dealer-platform-api.zeyad-1c1.workers.dev

## Layout

| Folder   | What it is |
|----------|------------|
| `api/`   | Cloudflare Worker (Hono). Routes in `src/routes`, schema in `migrations/`, deploy with `./deploy.sh`. Serves `site/` at `/` and `admin/` at `/admin/` in production. |
| `site/`  | Public dealer website (static HTML/CSS/JS, reads the API). |
| `admin/` | Dealer control panel (static, needs a login). |
| `tools/` | Dev helpers: `e2e.js` (browser test), `shoot.js` (screenshots), `mhl-stock/` (scraped MHL data + import source). |

## Run locally

```
cd api && npm install && npm run migrate:local && npm run dev     # API + site on http://localhost:8787
npx serve admin -l 3100                                            # admin on http://localhost:3100
```
Dev secrets live in `api/.dev.vars` (admin login, JWT secret, RegCheck username).
Seed MHL's cars: `cd api && npm run import:mhl`.

## Deploy

`cd api && ./deploy.sh` — builds assets, applies migrations, sets any missing secrets, deploys.
Quick redeploy of code/pages only: `npm run deploy`.

## Test

`cd tools && npm install && node e2e.js` (expects the API on 8787 and admin on 3100).
