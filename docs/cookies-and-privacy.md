# Cookie consent and the privacy notice

Built 2026-09-25. Local only, not deployed.

## What it does

Nothing that tracks runs before the visitor agrees.

  site/js/consent.js   the banner, the preferences panel, and the gated loaders
  site/privacy.html    privacy and cookie notice, /privacy
  site/css/site.css    .cc styles, matching the site
  seo.js               no longer injects the Google tag; it emits
                       window.__consent = { ga: '<id>' } and consent.js decides

Google Consent Mode v2 is set to denied before anything loads, then updated on the
visitor's answer, so even a granted Analytics collects nothing beforehand.

Verified in the browser:
  before any choice   no Google script in the DOM, consent default denied
  after Reject all    still no Google script, choice stored
  after Accept all    Google script loads, consent updated to granted

## The rules it follows

  - no non-essential cookies or tags before consent
  - Reject is the same size and colour as Accept, side by side
  - nothing is pre-ticked except Strictly necessary, which is disabled
  - the choice can be changed later from "Cookie settings" in the footer
  - closing or scolling past the banner is not treated as consent
  - the stored choice carries a version, so bumping VERSION in consent.js re-asks
    everybody after a policy change

## Still to do before this is legally finished

  - a solicitor should read the privacy notice; it is written from what the site
    actually does, but it is not legal advice
  - the finance section says applications are handled by a regulated provider on
    their own system. That becomes true when the Loanitt handoff is built. Until
    then the finance form still collects employment and income, so either build the
    handoff or cut those fields before the site goes live
  - no cookie is actually set by us yet beyond localStorage; if a session cookie is
    added later, list it in the table

## A regression this turned up

Rewriting SITE_DEFAULTS during the M6 rebrand silently dropped eight keys:
analytics_id, the five watermark_* keys, sold_stamp_on and photo_version. saveSite
ignores keys that are not in SITE_DEFAULTS, so the importer's watermark settings had
been discarded without any error. All eight are restored and the watermark is back on.
