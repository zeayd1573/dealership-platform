# StockManager.ie (M6 Motors control panel) - what's actually in it

Inspected 2026-09-22 via Zeyad's authorised M6 login. Vendor: Happy Dealer (Dublin).
Per-dealer subdomain, e.g. m6motors.stockmanager.ie. Enquiry records were not opened,
since they hold M6's customer personal data and were not needed.

## Headline: there is NO DoneDeal integration

Searched the stock list, the vehicle edit form and the settings page. Zero occurrences
of donedeal, dealerhub, carzone, carsireland, portal, publish, sync, feed or api.
The Settings page reads, in full: "More settings on the way. For now, you can set the
default description for when you add new vehicles to the system."

So M6 enter every car twice. Once here for their own website, once in DealerHub for
DoneDeal. The duplication the DealerHub plugin exists to solve is live at M6 today,
inside a product from an agency that has been doing this eight years.

That is the opening. The integration is a real differentiator, not a me-too feature.

## Scale at M6
  Live ads 73 · Paused ads 159 · Enquiries 1235 · Reservations 0 · Reviews pending 0

## Menu structure
  Vehicles · New Ad · Highlighted Vehicles · My Reviews · Paused Ads · Reserved Ads ·
  Enquiries · Finance Options · Other · Logout
  Other -> Team Details, Business Details, Ad Views, Deleted ads, Branding, Calls,
           Marketing, Manage Content, Price History, Settings

## Features we do not have yet, worth considering
  - Paused ads as a first-class state, separate from deleted. M6 have 159 of them.
  - Reserved ads, with a per-car "Cost to Reserve" and a reservation option
    (Default / Customise / None).
  - Per-car finance option: flat rate, IRR, and deposit/trade-in dependent tiers
    with a balance-over / balance-under split. Ours is one APR for the whole site.
  - Price History and Previous Price. We have prev_price but no history view.
  - Ad Views analytics and Calls tracking.
  - Windscreen poster print, /windscreen-classic/<adId>, one click from the stock row.
  - Private notes per vehicle, staff only.
  - NCT Due and Tax Due dates, shown as columns in the stock list.
  - Commercial flag, VIN, Warranty Type and Warranty.
  - Non-car fields: berth, payload, licence type, hours, seat belts, length/width/height.
    They sell campers, commercials and plant, not just cars.
  - "Hide extra info on your website?" per vehicle.
  - Per-row flags on the stock list: aa-approved, hv (highlighted vehicle), ds.

## Things we already match or beat
  - Reg lookup on add-vehicle with manual fallback. We have this via RegCheck.
  - Highlighted vehicles. We have is_highlighted.
  - Reviews moderation. We have it.
  - Branding. We go further, with watermarks and SOLD ribbons baked into photos.
  - They have no server-side rendering story visible; we do.
