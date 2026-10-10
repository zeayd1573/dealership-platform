# Enquiry email alerts

Built 2026-09-22. Local only, not deployed. OFF by default: a fresh install cannot
email anybody until a dealer ticks the box AND enters an address.

## How it works

  site/*.html  ->  POST /api/enquiries  ->  row saved in D1
                                        ->  waitUntil(notify())  ->  Resend

The enquiry is stored first. The email is sent after the response, via waitUntil, and
any failure is logged as a warning and swallowed. A dead mail provider can never lose
an enquiry or show an error to a customer.

## Files

  api/src/lib/mail.js          Resend call + the enquiry email template. Never throws.
  api/src/routes/enquiries.js  notify() at the bottom: the on/off gate and lookups.
  api/src/routes/site.js       POST /api/site/test-email
  api/src/lib/site.js          notify_* defaults + PRIVATE_SITE_KEYS
  admin/settings.html          "Enquiry alerts" panel

## Settings (per dealer, in site_settings)

  notify_on     '0' | '1'      default '0'
  notify_to     comma separated addresses; empty means nothing is sent
  notify_from   verified sender, e.g. MHL Motors <enquiries@mhlmotors.ie>; empty uses
                Resend's test sender, which only delivers to your own account address
  notify_types  comma separated enquiry types; empty = all

All four are in PRIVATE_SITE_KEYS, so /api/public/site never returns them. The
dealer's email address is not exposed to the public site.

## To go live

  1. Create a Resend account and add the sending domain (DNS records).
  2. cd api && npx wrangler secret put RESEND_API_KEY
  3. Deploy, then in the admin: Settings -> Enquiry alerts, tick it on, add the
     address, set "Send from" to an address on the verified domain, Send me a test.

Until step 1 is done, leave "Send from" empty and test only to your own address.
Resend's free tier is 3,000 emails a month, which is far beyond one dealer's volume.

## Details worth knowing

  - Reply-To is set to the customer's address, so the dealer hits reply and it goes
    straight to the customer. That is the single most useful part of this.
  - The subject reads like "Finance enquiry - 2019 Audi A4 - Conor Walsh".
  - Everything in the email is HTML-escaped. Verified against injected script and img
    tags in the name and message fields.
  - The finance form's extra fields (deposit, term, employment) appear as rows, so
    once the finance form is cut back those rows shrink by themselves.
