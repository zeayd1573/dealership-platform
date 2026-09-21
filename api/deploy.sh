#!/usr/bin/env bash
# One-shot production deploy. Requires `npx wrangler login` once beforehand.
set -euo pipefail
cd "$(dirname "$0")"
export PATH="/usr/local/bin:$PATH"
echo "== building static assets"; node scripts/build-assets.js
echo "== applying D1 migrations (remote)"; npx wrangler d1 migrations apply dealer-platform --remote
echo "== setting secrets (skips ones already set unless FORCE_SECRETS=1)"
set_secret() { if [ "${FORCE_SECRETS:-0}" = "1" ] || ! npx wrangler secret list 2>/dev/null | grep -q "\"$1\""; then printf '%s' "$2" | npx wrangler secret put "$1"; else echo "   $1 already set"; fi; }
set_secret JWT_SECRET "${JWT_SECRET:-$(openssl rand -hex 32)}"
set_secret ADMIN_USER "${ADMIN_USER:-admin}"
set_secret ADMIN_PASS "${ADMIN_PASS:-$(openssl rand -base64 12 | tr -d '/+=' | cut -c1-14)}"
set_secret REG_USERNAME "${REG_USERNAME:-}"
echo "== deploying worker"; npx wrangler deploy
echo "== done. If ADMIN_PASS was generated it was printed above only once; save it."
