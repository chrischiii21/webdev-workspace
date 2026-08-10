# Brand Extractor

Paste a website URL, get its brand color palette + images, download selected
images as locally-converted AVIF, and copy a ready-to-paste master prompt for
Claude Code to apply the branding to your own template.

## Setup

```bash
npm install
npx playwright install chromium   # one-time browser download for bot-blocked sites
npm run dev
```

Open http://localhost:3000.

## How it works

- `app/api/extract` fetches the target site server-side, parses images
  (og:image, icons, `<img>` tags) with cheerio, mines hex/rgb colors out of
  its linked stylesheets, and runs `node-vibrant` on the logo/icon to pull a
  palette from the image itself. CSS-frequency colors (the literal hex
  values the site deploys) lead the palette since they're an exact match;
  logo-derived colors only fill remaining slots as an approximation.
- Sites with bot protection (Akamai/Cloudflare/SiteGround-style WAFs) reject
  plain server-side `fetch`, and some serve a soft-block (HTTP 200 with a
  near-empty or CAPTCHA-redirect page) instead of a clean 403. `lib/extract.ts`
  tries plain `fetch` first (fast), then a real headless Chromium
  (`lib/browserFetch.ts`, via Playwright), then a residential-proxy API
  (`lib/scraperApi.ts`, via ScraperAPI) -- validating actual content at each
  tier rather than trusting status codes alone.
- Displayed thumbnails try loading directly from the source site first; if
  that fails (hotlink protection), they retry through `app/api/image`, which
  fetches server-side using the same fallback chain.
- `app/api/download` fetches an image through that same resilient chain and
  converts it to AVIF locally with `sharp` -- no third-party service in the
  loop, so it isn't dependent on any external account being configured
  correctly. Downloads carry `X-Original-Size` / `X-Optimized-Size`
  response headers so the UI can show the size savings after each download.
- The master prompt is built client-side (`lib/prompt.ts`) from whatever
  colors/images are currently selected, referencing the original site URLs
  (there's no public re-hostable CDN link once Uploadcare is out of the
  picture -- downloaded AVIF files are for dropping into your own project).

## Notes / known limits

- Color extraction is heuristic (CSS frequency + logo palette), not a
  design-system parser -- treat the output as a strong starting point, not
  ground truth.
- No auth, rate limiting, or persistence -- this is a single-user local tool.
- The Playwright fallback needs a real Chromium binary (`playwright install
  chromium`) and a long-lived Node process to reuse the launched browser.
  It runs fine with `npm run dev`/`next start` on a normal server, but
  won't work out of the box on serverless platforms without extra setup
  (e.g. `@sparticuz/chromium` on Vercel/AWS Lambda).
- A small number of sites use stronger bot protection (device fingerprint
  challenges, interactive CAPTCHAs) that no automated fallback can clear --
  those will still fail extraction or per-image download.
