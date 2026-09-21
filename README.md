# Ad Intel

A private ad-library tool for tracking your own ads and your competitors' ads
across Meta, Google, TikTok, and LinkedIn. Scraping is done on-demand via
Apify actors; ads are stored in Postgres (Supabase), searchable and
filterable by platform, brand, theme, and active status.

## Stack (all free-tier)

- **Next.js** (App Router, TypeScript) — frontend + API routes, deploy free on **Vercel**
- **Supabase** — Postgres database, auth (team login), free tier
- **Apify** — scraping actors for each ad platform, pay-per-result (cheap; see costs below)
- Search is Postgres full-text search — no extra service needed

## 1. Create accounts (you'll need to do this yourself)

1. [supabase.com](https://supabase.com) → new project. Note the project URL and anon key (Settings → API).
2. [vercel.com](https://vercel.com) → connect your GitHub account (for deployment later).
3. [apify.com](https://apify.com) → sign up, then grab an API token from Settings → API & Integrations.

## 2. Set up the database

In the Supabase dashboard, open the **SQL Editor** and run the contents of
[`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql). This creates all tables,
indexes, and row-level-security policies.

By default Supabase allows public sign-ups. Since this is a shared team tool
with no per-user data isolation (anyone signed in sees everything), either:
- Go to **Authentication → Settings** and disable "Allow new users to sign up" once your team has accounts, or
- Leave it open only while you and your teammates are creating your accounts, then disable it.

## 3. Configure environment variables

Copy `.env.example` to `.env.local` and fill in:

```bash
cp .env.example .env.local
```

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from Supabase Settings → API
- `APIFY_API_TOKEN` — from Apify Settings → API & Integrations
- `APIFY_ACTOR_*` — actor slugs (defaults already filled in, see below)

## 4. Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign up for an account, then go to **Brands** to add your own brand and competitors.

## 5. Deploy (free)

Push this repo to GitHub, then in Vercel: **New Project → import the repo**, add the same environment variables from `.env.local` in the Vercel project settings, and deploy.

## How syncing works

Each brand can have identifiers for any of the four platforms (Meta Page ID,
Google advertiser ID/domain, TikTok handle, LinkedIn company name). On the
Brands page, hit **Sync** next to a platform to:

1. Start the matching Apify actor run with that brand's identifier
2. Poll until the run finishes (usually 10s–2min depending on ad count)
3. Normalize the results and upsert them into the `ads` table
4. Mark any previously-tracked ad for that brand+platform that *didn't* show up in this run as inactive

This gives you an "ads currently running" count per brand that's accurate as
of the last time you clicked Sync — not live/real-time (per your own note,
these platforms' public libraries are approximate anyway).

Ads are auto-tagged with a theme (Discount, New Launch, Retargeting, etc.) via
a keyword classifier ([`src/lib/classify.ts`](src/lib/classify.ts)) at ingest time. You can
add/remove theme tags manually on any ad's detail page — manual edits are
preserved on future syncs.

## Apify actors used

Picked for being the most-used, best-documented actor per platform as of the
research behind this build. **Field names on scraper output can change over
time** — if a sync starts returning empty headlines/media, check the actor's
current "Input"/"Output" tabs on the Apify Store and adjust
[`src/lib/apify/normalize.ts`](src/lib/apify/normalize.ts) accordingly.

| Platform | Default actor | Cost | Notes |
|---|---|---|---|
| Meta | `curious_coder/facebook-ads-library-scraper` | ~$0.75/1,000 ads | Default. Input schema confirmed live (`urls: [{url}]`, `scrapeAdDetails`, `count`). Swap to the official `apify/facebook-ads-scraper` (~$3.40/1,000) if you hit reliability issues — its input uses `startUrls` instead, so you'd need to edit `buildActorInput` in `normalize.ts` too. |
| Google | `silva95gustavo/google-ads-scraper` | ~$1.90/1,000 ads | Needs the brand's **advertiser ID** (the `AR...` string from an `adstransparency.google.com/advertiser/AR...` URL) — a domain alone isn't a valid input for this actor. Headline/description/CTA/landing URL come from each ad's `variations[]`; no spend data (Google's public library doesn't disclose it). |
| TikTok | `coregent/tiktok-ads-library-creative-center-scraper` | ~$1.80/1,000 | Cheaper pick. More-used alternative: `brilliant_gum/tiktok-ads-library-scraper` (~$15/1,000). |
| LinkedIn | `memo23/linkedin-ads-scraper` | ~$0.0004–0.0015/ad | Cheapest of all four. Impressions/targeting data only populates for EU-facing ads (LinkedIn's own transparency rule). |

All four are pay-per-result (no rental fee), so they draw down Apify's free
monthly usage credit proportionally — fine for low-volume MVP use. TikTok is
the most expensive per ad; swap in `beyondops/tiktok-ad-library-scraper`
($0.01/1,000) if you don't need to search by a specific competitor name.

## Project structure

```
src/
  app/
    (app)/            # authenticated pages (dashboard, brands, ad library)
    api/               # brands, ads, and sync (Apify trigger + poll) routes
    login/              # sign-in/sign-up
  components/          # AdCard, FiltersBar, SyncButton, BrandForm, etc.
  lib/
    apify/             # Apify API client, per-platform input builders + normalizers
    supabase/          # browser/server Supabase clients
    classify.ts        # keyword-based theme tagger
    types.ts
supabase/migrations/    # SQL schema
```

## Known MVP limitations

- Ad counts reflect the last manual sync, not real-time data (by design, per your request — no scheduler).
- Theme classification is keyword-based, not AI — good enough to browse by theme, not a precise taxonomy. Swappable later for an LLM classification pass if you want sharper tagging.
- Google Ads Transparency Center scraping has no dominant, battle-tested Apify actor — expect to revisit its field mapping.
- All signed-in users share one workspace (no per-user permissions/roles) — fine for a small team, not built for external clients.
