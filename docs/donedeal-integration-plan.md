# Where the DoneDeal integration goes

Not built. This is the shape it takes once DoneDeal supply the specification.
Nothing here needs their answer to be designed; only the HTTP calls do.

## Direction

DealerHub is read-only for third parties. The dealer enters stock in DealerHub, our
importer pulls it, our D1 stays the source of truth for rendering. The website never
calls DoneDeal at request time, so a revoked key degrades to stale stock, not a dead
site. That matters because their policy revokes with no notice period.

## Files

  api/src/lib/donedeal.js      NEW. The only file that knows DoneDeal's HTTP shape:
                               auth, fetch a dealer's stock, map their fields to ours.
                               Everything else talks to this, so a spec change is a
                               one-file change.
  api/src/lib/importer.js      NEW. Source-agnostic upsert. Match on
                               vehicles.external_ref, insert new, update changed,
                               mark missing ones sold or paused, pull photos into R2.
                               Reuses processImage() from routes/images.js.
  api/src/routes/integrations.js  NEW. Admin endpoints: connect, disconnect, run now,
                               last-run status.
  api/src/index.js             Mount the new router.
  api/wrangler.jsonc           Add a cron trigger for the nightly run.
  admin/integrations.html      NEW. Connect screen, last sync time, what changed.
  migrations/0006_integrations.sql  NEW. See below.

## Credentials live per dealer, never global

Their policy grants access per dealer, per domain, per implementation. One shared key
across the platform would breach it on day one. So:

  CREATE TABLE dealer_integrations (
    dealer_id INTEGER NOT NULL REFERENCES dealers(id),
    provider TEXT NOT NULL,            -- 'donedeal'
    account_ref TEXT,                  -- their dealer id
    credential TEXT,                   -- encrypted, never returned by any GET
    approved_domain TEXT,              -- the domain we registered with them
    status TEXT NOT NULL DEFAULT 'pending',
    last_sync_at TEXT, last_error TEXT,
    PRIMARY KEY (dealer_id, provider)
  );

Adding a dealer is then a row plus their approval, not a deploy.

## Obligations to build in, not bolt on

  - Purge on revoke. One admin action that deletes every row and photo sourced from
    that provider for that dealer. Their policy requires prompt removal when access
    ends, consent is withdrawn, or the implementation changes.
  - Nothing sourced from DoneDeal gets shown anywhere except that dealer's own site.
  - Re-approval before any material change to domain, hosting or implementation.

## Built 2026-09-26, before hearing back from DoneDeal

Everything except the DoneDeal-specific HTTP calls now exists and is tested.

  migrations/0006_integrations.sql   dealer_integrations, sync_runs, and
                                     vehicles.source / source_synced_at / paused_by_sync
  api/src/lib/integrations.js        credential encryption, the provider registry,
                                     the importer, and the purge
  api/src/routes/integrations.js     connect, list, sync, run history, disconnect

A provider is an object with one method, fetchStock(), returning normalised vehicles.
Adding DoneDeal means writing that one function; nothing else changes.

Proved with a `fixture` provider reading a JSON feed over HTTP:
  first run        3 cars imported, all paused
  second run       price change applied, car missing from the feed paused,
                   new car added paused
  purge            4 feed cars and their photos deleted, 13 hand-entered cars
                   untouched, credential wiped, status revoked, further syncs refused

Design decisions worth keeping:
  - credentials are AES-GCM encrypted under the Worker secret and never returned
    by any endpoint, only a has_credential boolean
  - cars that leave the feed are PAUSED, never deleted; a feed outage must not
    wipe a dealer's stock
  - imported cars arrive paused, matching the admin rule that nothing reaches the
    website without photos
  - paused_by_sync separates "paused because it left the feed" from "paused because
    it is new"; without it the second sync republished photoless cars, which it did
    on the first run of the test

## Sequence

  1. Ask DoneDeal for the documentation. Draft is in Gmail, submission text in
     docs/outreach/donedeal-support-form.md.
  2. Build donedeal.js and importer.js against the spec, with a fixture file.
  3. First dealer authorises, DoneDeal verify with them, key issued for their domain.
  4. Store it, run the import, turn the cron on.
