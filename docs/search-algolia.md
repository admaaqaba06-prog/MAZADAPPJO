# Algolia Search — Ops Runbook

Discover search is powered by Algolia, behind a swappable `SearchProvider` abstraction. This is the operator guide to turn it on. All code ships dormant (flag `enableAlgoliaSearch` defaults **OFF**), so nothing below affects production until you complete these steps.

## What's what

| Thing | Value | Secret? |
|---|---|---|
| Algolia App ID | `O45I2Z57QS` | No (public — ships in client) |
| Search-only key | `82e302cd6429c71d908ec360333e2706` | No (public — read-only, safe in client) |
| **Admin/write key** | (Algolia dashboard → Settings → API Keys → **Admin API Key**) | **YES — never commit, never put in client** |
| Index name | `auctions` | — |
| Feature flag | `siteSettings/featureFlags.enableAlgoliaSearch` | — |

The client (`src/services/search/`) uses only the **search-only** key (with the above as a public fallback). The **admin key** is used ONLY by the sync Cloud Function and the backfill script, via the Firebase secret `ALGOLIA_ADMIN_KEY`.

## Turn-on steps (in order)

**1. Set the admin key as a Firebase secret**
```
firebase functions:secrets:set ALGOLIA_ADMIN_KEY
```
Paste the Admin API Key from the Algolia dashboard when prompted. (I never see this value.)

**2. Deploy the sync function** (mirrors every future `auctions` write into Algolia)
```
firebase deploy --only functions:onAuctionWriteAlgolia
```
It indexes only public, non-simulated `live`/`upcoming` lots and deletes a lot from the index when it leaves those states.

**3. Backfill existing lots + apply index settings** (one-time, idempotent)
```
ALGOLIA_ADMIN_KEY=<the-admin-key> node scripts/algolia-backfill.cjs
```
This applies index settings (searchable: title/description/category/sellerName; facets: status, category; ranking: ending-soon first) and indexes all current live/upcoming lots. Safe to re-run.

**4. (Optional) Client env at build time** — the public fallbacks already work, but you can set them explicitly in the hosting deploy workflow (`.github/workflows/firebase-hosting-deploy.yml`), since Vite inlines `VITE_*` vars during the build:
```
VITE_ALGOLIA_APP_ID=O45I2Z57QS
VITE_ALGOLIA_SEARCH_KEY=82e302cd6429c71d908ec360333e2706
```

**5. Flip the flag ON** — `siteSettings/featureFlags` doc, set `enableAlgoliaSearch: true` (boolean). (Same doc as `enablePaginatedDiscover`.)

**6. Verify in-browser** (customer-facing → preview-gate): open Discovery, type a query with a typo (e.g. "iphon", "rolx"), confirm typo-tolerant matches appear across all lots; confirm a category chip filters results; clear the box → the normal feed returns.

**7. Set a billing alert** in the Algolia dashboard. Free tier ≈ 10K searches/mo + 50K records; beyond that ≈ $0.50 / 1K searches. Set a usage alert so a traffic spike can't run up a surprise bill.

## Kill switch
Set `enableAlgoliaSearch: false` → the search box instantly reverts to the client-side `.includes` filter over loaded lots (today's behavior). No deploy needed.

## Swapping providers later
The feed depends only on the `SearchProvider` interface (`src/services/search/SearchProvider.ts`). To move to Typesense (documented cheaper-at-scale option), implement the interface in a new provider and swap the singleton in `src/services/search/index.ts` — no feed changes. The sync function + backfill would be re-pointed similarly.
