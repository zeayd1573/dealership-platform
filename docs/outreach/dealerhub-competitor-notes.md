# DealerHub integration: who already does this

Found 2026-09-22 at wp.managedspaces.net (Patrick Ryall / Aestute, independent
freelance developer based in Ireland). Not affiliated with DoneDeal, states so
explicitly on the page.

## Why this matters

It is proof that a solo independent developer can get DealerHub API access, per
dealer, and run it in production. Three live Irish dealerships:

  - Shaw Commercials, Castlebar, Co. Mayo - trucks and commercials - WordPress
  - Franklin Motors, Baldoyle, Dublin - motorcycles and prestige cars - WordPress
  - Brent Harvey Car Sales, Kingscourt, Co. Meath - used cars, 24 vehicles - WordPress

## Direction of the integration (important)

DealerHub is READ-only for third parties. The dealer enters stock in DealerHub, and
the website reads it. There is no third-party API for pushing listings INTO DoneDeal.
The API Usage Policy backs this up: it only ever describes retrieving and displaying
vehicle data, never creating or updating it.

## Their architecture, which matches ours

  - An API/integration service sits between DealerHub and the website.
  - "Your DealerHub credentials never live in the website" - credentials held in the
    service, per dealer.
  - "Stock is cached and served quickly" - the service caches, the site reads cache.
  - Platform-agnostic: WordPress plugin, Duda via the API layer, React/Next.js, custom.

That is the same shape as ours: D1 as the cache and source of truth for rendering,
per-dealer credentials on the dealer record, feed as an import rather than a live
dependency.

## Competitive read

Same market, same country, same integration, already live. Differentiators available
to us: we own the whole stack rather than bolting onto WordPress, we do SSR and SEO
properly, we bake watermarks and SOLD ribbons into photos, and we can bundle the
Loanitt finance handoff. Worth watching, not worth panicking about.
