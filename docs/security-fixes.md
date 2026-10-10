# Security review and fixes

Reviewed and fixed 2026-09-27. Deployed to production the same day.

## Fixed

CRITICAL  Production admin password was `mhl-admin-2026`, committed in four tracked
          files, and it worked on the live site. Rotated. The stored hash was changed
          through the API, not just the ADMIN_PASS secret, because that secret only
          covers first-time bootstrap and does not touch an existing user row.
          The hardcoded fallback is gone from all four scripts; they now require
          ADMIN_PASS in the environment and exit if it is missing.

HIGH      Stored script injection through the JSON-LD block. JSON.stringify does not
          escape "</script>", and car make/model/colour reach that block, including
          from a stock feed. Verified exploitable, then fixed by escaping < > & and
          the line separators. seo.js jsonLd().

HIGH      Permanent delete removed photos filtered only by vehicle id; the ownership
          check ran afterwards, so another dealer's photos were already gone from R2
          by the time the request was refused. Ownership is now proved first.

MEDIUM    Uploads accepted SVG, which can carry script and was served back from our
          own origin next to the admin panel. Now sniffed by magic bytes; only JPEG,
          PNG, WebP and GIF are stored. The watermark path, which skips resizing to
          keep transparency, was bypassing the check entirely and is covered too.

MEDIUM    No brute-force protection at all. Eight failures per IP and username now
          triggers a fifteen minute lockout, counted in login_attempts.

MEDIUM    No security headers. Added CSP, nosniff, frame-ancestors none, HSTS,
          referrer policy and permissions policy.

MEDIUM    A password change left existing tokens valid for their full seven days.
          users.token_version is bumped on change and checked on every request; the
          person changing it gets a fresh token so they are not signed out.

LOW       Errors returned raw database text, leaking table and column names.
LOW       The feed URL was dealer-supplied and unrestricted, so the Worker could be
          pointed at internal addresses with the stored credential attached. Now
          https only, public hosts only, redirects refused.
LOW       Public single-vehicle read was not dealer-scoped.
LOW       Credential encryption shared JWT_SECRET. CRED_SECRET is now set separately.
LOW       Public enquiry form had no rate limit or size cap. Five per IP per ten
          minutes, fields truncated, counted in enquiry_throttle rather than by
          writing the IP into the enquiry itself.

## Verified clean, not changed

SQL injection: every dynamic column list comes from a hardcoded allowlist and every
value is bound. Data exposure: the scrub lists are correct, no private column,
notify setting or credential leaks publicly. Password hashing: PBKDF2-SHA256,
100k iterations, per-user salt, constant-time compare. JWT algorithm pinned on
verify. Upload paths cannot be traversed. No CSRF exposure, tokens are in a header.
.dev.vars has never been committed.

## Known gaps still open

  - one shared admin login, so no record of who did what
  - an admin who locks themselves out has no self-service unlock; clear the
    login_attempts row in D1
  - CSP still needs 'unsafe-inline' for scripts because the pages carry inline blocks
  - no nightly database backup

## A trap worth remembering

Rotating the ADMIN_PASS secret does NOT change the login password once a user row
exists. bootstrapAdmin only runs when the users table is empty. Change the password
through POST /api/auth/password, or the old one keeps working.
