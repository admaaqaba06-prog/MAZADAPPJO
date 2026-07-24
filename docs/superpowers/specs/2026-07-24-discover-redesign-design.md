# Discover Page Redesign

**Date:** 2026-07-24
**Status:** Approved (design), pending implementation plan
**Scope:** `src/components/DiscoveryFeedView.tsx` (the customer-facing browse/discover page) and `src/components/CountdownStoriesBar.tsx` (removed). Frontend-only — no backend, no data model, no rules changes.

## Context & Problem

A first-principles review of the live Discover page (`?view=discovery`, the default customer landing view) found genuine redundancy above the fold, confirmed in code, not just visually:

1. **Three CTAs trigger the identical action.** `handleWatchLive()` (jump straight into the first live auction's bidding room) is bound to: the green "Live now" banner, a desktop-only header button, and a mobile-only hero-card button state. Three visual elements, one action.
2. **The "Ending soon" rail duplicates the grid below it.** `CountdownStoriesBar` and the main grid (`filteredAuctions` on the `'live'` tab) both render the same underlying set — `status === 'live'` auctions — in two different visual layouts, back-to-back on one screen.
3. **Search and category filters sit low on the page**, after two hero sections and the rail, despite being the primary tool for intent-driven visitors (matches eBay/StockX/Whatnot convention: filter tools sit immediately below the header, often sticky).
4. **A dual-purpose "pending listings" box sits on the customer page.** For sellers it shows their own listing's review status (legitimate — not duplicated elsewhere). For admins it *also* shows an "Approve & Go Live" shortcut — which already exists in the dedicated Admin → Auctions & Lots tab. Verified: Seller Center's "Auctions" tab already has its own "Pending" sub-tab with a count badge (`src/components/SellerCenterView.tsx`), so the seller-status half is fully redundant on Discover too — it already has a proper home.

## Goals

Collapse the redundancy without touching the parts that already work well: the per-card design (thumbnail, LIVE + countdown badge, title, bid count, current bid, one CTA button) stays exactly as-is — it already matches modern live-commerce patterns and was not part of this critique.

### 1. One "watch live" CTA, not three
Keep the green "Live now — N auctions" banner (`id="live-now-strip"`) as the sole entry point into `handleWatchLive()`. Remove:
- The desktop header's "Watch Live Drops" button (`hidden lg:flex` block).
- The mobile hero card's "Watch live" button **state only** — the card's other two states (non-member → "Join from 1 JD"; member with zero live auctions → "Browse") are distinct, legitimate actions and stay untouched.

### 2. Remove the "Ending soon" rail
Delete `<CountdownStoriesBar />` and its import from `DiscoveryFeedView.tsx`. Delete `src/components/CountdownStoriesBar.tsx` itself — confirmed it has no other consumer (`sharedTicker.ts`'s reference to the name is a comment, not an import). The main grid already carries the LIVE + countdown badge per card; nothing is lost.

### 3. Search + category pills move up, become sticky
Extract the search input + category-pills block into a sticky position immediately below the top nav — above the green banner — on both breakpoints:
- **Mobile:** the existing mobile top bar (`id="mobile-header..."` region) is already `sticky top-0 z-40 bg-white`. Extend that same sticky wrapper to include the search input + category pills directly beneath the bar's row, so they stick together as one unit (no pixel-offset math needed).
- **Desktop:** the global app header (`src/components/DesktopFrame.tsx`, `id="global-desktop-header"`) lives outside this component, in a non-scrolling flex sibling — it is already permanently visible by construction (only `DiscoveryFeedView`'s own `overflow-y-auto` pane scrolls). So the search+pills block just needs its own `lg:sticky lg:top-0 lg:z-30` wrapper inside `DiscoveryFeedView` to park immediately under that always-visible header.

The **"Join Funnel Banner"** (non-member 3-step conversion pitch + live social proof) is a separate, unrelated element that currently sits directly above the search input in the DOM. It is NOT part of this redesign — it stays in normal (non-sticky) page flow, now appearing after the green banner/hero and before the tabs, preserving its current relative position in the content column.

### 4. Remove the pending-listings box entirely
Delete the whole block (both the seller "under review" state and the admin "Approve & Go Live" state) plus its now-solely-used `pendingListingsToDisplay` memo and the `approveListing` destructure (only consumer was this block). Seller status: already covered by Seller Center's Auctions → Pending sub-tab (no changes needed there — confirmed it already exists and works). Admin approval: already covered by Admin → Auctions & Lots (no changes needed there either).

## Final page order (top to bottom)

1. Top nav (mobile sticky bar / desktop global header — both unchanged in themselves)
2. **Search bar + category pills** (new sticky position)
3. Green "Live now — N auctions" banner (the one surviving CTA)
4. Desktop header title + subtitle (kept, button removed)
5. Mobile hero card (kept; Watch-live state removed, Join/Browse states kept)
6. Join Funnel Banner (non-members; unchanged, now here in the flow)
7. Tabs: Active live feed / Upcoming drops (unchanged)
8. Grid (unchanged — card design untouched)

Removed entirely: `CountdownStoriesBar` component + file, desktop "Watch Live Drops" button, mobile hero's "Watch live" state, the pending-listings box + its dead memo/destructure.

## Non-Goals (YAGNI)

- No changes to the per-card grid design (thumbnail, badges, CTA) — already good, not part of the critique.
- No changes to Seller Center or the Admin panel — both already have the homes this redesign relies on; verified, not assumed.
- No changes to the Join Funnel Banner's content, position relative to other content, or logic.
- No new data fetching, no new Firestore reads, no backend/rules changes — this is a pure client-side layout change.
- No changes to `handleWatchLive()`'s behavior — only which elements call it.

## Testing

This is JSX restructuring in a large page component with no natural pure-function extraction point — there is nothing here to unit-test in the way the admin slices' business logic was. Verification is:
- `npm run build && npx vitest run && npx tsc --noEmit` (regression safety — confirms nothing else in the app broke, 0 new TS errors).
- **Manual visual verification in a real browser** (dev server or deployed preview) — required before calling this done, per the project's UI-change convention. Specifically confirm: sticky search+pills actually stays pinned while scrolling on both breakpoints; the green banner still correctly hides when there are zero live auctions (existing `liveNowAuctions.length > 0` guard, untouched); the mobile hero card's three states still render correctly (non-member/member-with-live/member-without-live) minus the removed watch-live variant; Seller Center's Pending sub-tab still shows a seller's own under-review listing (spot check, not a regression risk since untouched, but confirms the redundant removal was actually safe).
