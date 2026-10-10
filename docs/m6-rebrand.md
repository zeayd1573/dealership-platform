# MHL → M6 Motors rebrand

Done 2026-09-24. The site is now M6 Motors. Local only, nothing deployed.

## The dealer

  M6 Motors, Dolan's Service Station, Athlone Road, Ballinasloe, Co. Galway, H53 K8W2
  Sales 090 964 5801 · WhatsApp 085 862 2534 (Eanna) · sales@m6motors.ie
  Mon-Fri 8.30-6.00, Sat 8.30-4.00, Sun closed, evening viewings by appointment
  Finance panel: First Citizen, Bluestone, Alphera (NOT Loanitt, which is MHL's)

Taken from m6motors.ie. Their site is built by Happy Dealer on StockManager.

## Design — matched to their current site

Rebuilt 2026-09-24 to mirror m6motors.ie rather than reinterpret it. The palette and
type were read off their live pages with getComputedStyle, not guessed.

  --paper   #ffffff  page            --ink   #212529  body text
  --paper-2 #ededed  grey bands      --muted #6c757d  labels
  --band    #f1f1f1  card price strip
  --shell   #000000  header, footer, primary buttons
  --rule    #d9d9d9  card borders
  Montserrat 400-800 throughout. Square corners. No colour accent; they use black.

What was copied from their layout:
  - Black sticky header, white uppercase letter-spaced nav, phone at the right.
  - Full-bleed hero photo with the copy overlaid left in white uppercase, two
    white-outline buttons, and the search bar overlapping the foot of it.
  - Car card: bordered white card, heart top left, photo count bottom left,
    two-column spec list with small triangle markers, and a grey price strip
    flush to the card edges showing OUR PRICE and MONTHLY.
  - Alternating light grey bands carrying a faint repeating M6 wordmark.

An earlier dark-theme version was built and then replaced at Zeyad's request.

## Homepage, matched section by section

Their order, reproduced:

  1. Hero        their forecourt photo (slide-1), "Unbeatable quality, prices and
                 service" over "A name you can trust.", View stock / Contact us
  2. Search      Make / Model / Year / Body, overlapping the foot of the hero.
                 Models repopulate from the chosen make.
  3. Car finder  "What car suits me?" on a grey band. Body-type tiles, fuel, and a
                 monthly budget. It converts the budget into a price using the
                 dealer's own APR, term and deposit, shows how many cars match,
                 and sends the filters through to the stock page.
  4. Featured Cars   six newest, server-rendered
  5. Why choose M6 Motors   11,500 cars sold, 15 years, 402 reviews, and a live
                 count of cars in stock
  6. Reviews     their five real homepage testimonials, seeded into the reviews
                 table so the dealer can moderate them like any other
  7. Find us     map and contact card (their homepage ends at reviews; this is the
                 one block we keep beyond their layout)

Their hero images slide-1/2/3 are in site/img. Only slide-1 is used so far; the
rotation is not built.

## Assets

  site/img/m6-logo.png     605x445, from their logo-white.png trimmed, upscaled 5x
                           and alpha-thresholded so the edges stay crisp
  site/img/m6-pattern.png  300x210 tile, the faint wordmark on their grey bands
  site/img/est-crest.svg   their EST. 2011 crest
  site/img/simi.svg        their SIMI membership badge
  site/img/favicon.png     512x512, logo on brand black
  site/img/watermark.png   logo on a translucent dark pill, baked into car photos
  site/img/hero-x5.jpg     2000px, the 191C8009 X5, cropped to a wide band
  site/img/about-gle.jpg   1400px

## Stock: 10 cars

Photography is Zeyad's own, from the SSD at shoots/M6Motors/Deliverables/SEPT.
8 photos per car, resized to 1600px, in tools/m6-stock/photos/<REG>/.
Spec and prices scraped from m6motors.ie into tools/m6-stock/stock.json.

  191C8009  2019 BMW X5              €47,950      211G4196  2021 BMW X3        €37,950
  KW75WVJ   2026 Mercedes GLC        €63,950      OV22DUJ   2022 Mercedes GLE  €59,950
  SXZ6714   2023 Lexus UX 250H       €31,950      241D41233 2024 BMW 5 Series  €54,950
  232T409   2023 VW Tiguan Allspace  €43,750      241T1904  2024 Skoda Octavia €38,950
  PN22NVR   2022 VW Golf             €21,450      EK25LHC   2025 Skoda Kodiaq  €52,450

Re-run any time with: cd api && node scripts/import-m6.js

## Redirects from their current site

  /used-cars, /search, /cars      -> /stock
  /cashforcars                    -> /sell-your-car
  /vehicle?id=<short id>          -> the matching car, else /stock

Their short ids are stored in vehicles.external_ref (SITE_IDS in the importer).

## New in the platform

  PATCH /api/dealer   name, phone, address, hours and the rest, admin only.
                      The settings page used to say "ask your website provider".

## Known gaps

  - The watermark cannot be verified locally; the wrangler Images mock does not
    render draw(). It is switched on (bottom right, main photo) and will appear
    in production.
  - Only 10 of their 73 cars are loaded, as asked.
  - road_tax on their site is an expiry date, not a euro amount, so it is imported
    into tax_due. The road_tax column stays empty.
  - Two cars had ambiguous listings. The GLE was matched to the Estate rather than
    the Coupe, because the photo archive files those separately. The Kodiaq appears
    twice on their site; the fuller listing was used.

## Admin panel, matched to the site

The control panel used a warm cream palette, a green accent, rounded corners and
Barlow Semi Condensed. It now shares the site's language:

  Montserrat throughout        square corners everywhere except the count badges
  #f1f1f1 app background       #ffffff cards
  #212529 text                 #6c757d labels
  #d9d9d9 borders              #000000 sidebar and primary buttons

Status colour is deliberately kept. Amber, blue, red and green still mark paused,
reserved, sold and live, because the inbox and stock list need to be scannable and
the public site's monochrome does not serve that.

One fix the change forced: with the accent now black, the sidebar's "Add a car"
button was black on a black sidebar and invisible. It inverts to white on black.

## New cars start paused

A car saved for the first time is now created Paused, not Live, because it has no
photos yet and an empty listing on the website is worse than no listing.

  admin/car.html   on a new car the status select is preset to Paused
                   the save toast reads "Saved and paused. Add photos, then put it live."
                   a hint under the status select says what each status does, and
                   warns if Live is chosen with no photos
                   a banner under Photos offers "Put it live", greyed out until at
                   least one photo is on, and it calls PATCH /api/vehicles/:id/status

Nothing changed server side, so the importer still creates live cars as before.
