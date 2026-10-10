# Site structure

Audited and fixed 2026-09-27. Deployed.

```
/                          Homepage
├── /stock                 Used cars (all 10 linked server-side)
│   └── /cars/{id}-{slug}  Car detail
├── /finance               Car finance
├── /sell-your-car         Sell or trade in
├── /car-sourcing          Car sourcing        (footer only)
├── /about                 About us            NEW
├── /reviews               Customer reviews    NEW
├── /contact               Contact
└── /privacy               Privacy & cookies
```

Two levels deep. Nothing is more than two clicks from the homepage. Nav carries six
items: Home, Used Cars, Finance, Sell Your Car, About, Contact. Car Sourcing, Reviews
and Privacy sit in the footer.

## What was wrong, and what changed

ORPHAN      /privacy had no server-rendered inbound link and was missing from the
            sitemap. The SSR footer still showed "Privacy · Terms" as dead text left
            over from before the page existed. It is now a real link in both the
            server and client footers, and in the sitemap. The dangling "Terms"
            reference is gone; there is no terms page to point at.

CANONICALS  Only /, /stock and car pages had one, because only those went through
            injectHead. The static pages are now routed through the Worker as well
            (PLAIN_PAGES in seo.js), so every page gets a canonical, the
            server-rendered header and footer, and breadcrumb markup.

BREADCRUMBS /stock showed them on screen with no structured data behind them. Every
            page except the homepage now emits BreadcrumbList.

METADATA    The homepage title ran to 79 characters and car descriptions to 205,
            both past the point search results truncate. A clamp() now trims titles
            at 62 and descriptions at 158, cutting on a word boundary. The homepage
            title was shortened at source rather than truncated.

## New pages

/about      Their live site has About, Meet The Team and Reviews and ours had none,
            which is a gap a dealer would notice. Pulls its copy from the same site
            settings as the homepage block, so editing it in the admin updates both.
            A "Meet the team" section is built but hidden; it needs names and
            photographs from M6.

/reviews    Lists every approved review with an average rating, and carries a
            submission form. Submissions land as `pending` and do not appear until
            approved in the admin, which is verified.

## Verified on production

  every page 200, canonical present, breadcrumb markup present
  titles 33-58 chars, descriptions 104-158
  19 URLs in the sitemap, no orphans: every page has 8 inbound internal links
  car pages render 9 spec blocks with JavaScript disabled

## Still missing versus their live site

  - Meet The Team: needs photos and names
  - Motobility: a whole customer segment with its own search demand; needs a
    decision from M6 on whether they want it
  - no terms and conditions page
