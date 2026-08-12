# webdev-workspace

An internal team workspace with five tools behind Supabase auth: a brand
extractor, a standalone image optimizer, a kanban board, EOD/daily standup
reports, and admin user management. Next.js 16 (App Router) + Supabase Auth,
flat JSON files for app data (no database beyond auth).

## Setup

```bash
npm install
npx playwright install chromium   # one-time browser download for bot-blocked sites
npm run dev
```

Open http://localhost:3000. Copy `.env.local.example` to `.env.local` and
fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` (server-only, used for admin user management),
and optionally `SCRAPERAPI_KEY` (last-resort fetch tier for the extractor).

Every route except `/login` is auth-gated by `proxy.ts`; `/users` is
additionally admin-only.

## Tools

### Brand Extractor (`/`)
Paste a website URL, get its brand color palette + images, download selected
images as locally-converted AVIF, and copy a ready-to-paste master prompt for
Claude Code to apply the branding to your own template.

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
- `app/api/scraperapi-usage` proxies ScraperAPI's account endpoint so the UI
  can show remaining credits.

Known limits: color extraction is heuristic (CSS frequency + logo palette),
not a design-system parser. A small number of sites use stronger bot
protection (device fingerprint challenges, interactive CAPTCHAs) that no
fallback tier can clear.

### Image Optimizer (`/optimize`)
Standalone AVIF converter -- no URL fetching involved. Drag/drop, paste, or
pick arbitrary image files, convert each to AVIF via `app/api/optimize`
(`sharp`), queued one at a time, download individually or all at once.

### Kanban Board (`/kanban`)
Three-column (To Do / In Progress / Done) team task tracker: create/edit/
delete tasks, drag-and-drop between columns, checklists, comments, a
per-task history log, and an assignee dropdown sourced from `/api/users`.
"New"/"moved" badges are tracked client-side via localStorage-dismissed
timestamps (`lib/kanbanBadges.ts`). Backed by `app/api/kanban*` and
`lib/kanbanStore.ts`, which persists to the `tasks` table in Postgres.

### EOD Reports (`/reports`)
Daily standup tool: submit "what I did / what's next" for a date (one report
per person per day, upserted), view everyone's reports grouped by
Employee/Intern, and copy a unified report block for standup. Backed by
`app/api/reports` and `lib/eodStore.ts`, persisting to the `eod_reports` table.

### User Management (`/users`, admin-only)
Lists all Supabase Auth users (name/email/role/employment type/generated
password/last sign-in), creates new teammate accounts (auto-generated
password via `lib/generatePassword.ts`, stored in `app_metadata`), and
deletes users. Server-side redirected away for non-admins.

## Architecture notes

- **Auth**: Supabase Auth. Per-user role (`admin`/`developer`), employment
  type (`employee`/`intern`), name, and generated password live in
  Supabase's `app_metadata` (`lib/roles.ts`), not a separate table.
  `lib/supabase/server.ts` exposes a session-bound client (RLS-respecting)
  and an admin client (service-role, used only after verifying admin role
  server-side).
- **Data storage**: Kanban tasks (`tasks`), EOD reports (`eod_reports`), and
  an internal activity/audit log (`activity_events`, read capped at 500 rows
  via `lib/activityLog.ts`, records extractions/kanban CRUD/user creation)
  live in Postgres -- see `supabase/migrations/`. RLS allows any
  authenticated user full access to all three tables (no per-user access
  control, matching the JSON-file stores these replaced). There's currently
  no UI to view the activity log -- it's written but not surfaced anywhere.
- **Shared shell**: `app/layout.tsx` + `app/components/AppShell.tsx` provide
  the collapsible sidebar nav across all tools, user menu/sign-out, and a
  kanban unread-badge poll every 10s.
- This is a small-team internal tool, not built to scale past a single
  server -- JSON-file storage is a deliberate simplicity tradeoff, not an
  oversight.
