# Landing Page Seller-Trust Redesign

**Date:** 2026-07-24
**Status:** Approved (design), pending implementation plan
**Scope:** `src/landing/LandingView.tsx` (2846 lines) + `src/landing/translations.ts`; two new small modules (`useLandingAuctions` hook, `landingAnalytics` helper). Frontend-only, no backend/rules changes. The public, unauthenticated front door — highest-traffic surface, accidentally reverted earlier today, so evolved section-by-section (not rewritten) and hard preview-gated.

## Context & Objective

Mazad JO is an early two-sided marketplace in Jordan. The binding constraint is **supply (seller inventory)**, not buyers — if a first-time seller doesn't trust Mazad JO enough to list a valuable item, the marketplace fails regardless of buyer traffic. The north star (MJ's words): **optimize for seller TRUST, not seller acquisition.**

Ground truth established with MJ:
- The business is **already live and real on WhatsApp** — the "15,000+ users · 1,250+ sales · 3,400+ items inspected" stats and the testimonials are REAL WhatsApp track record, NOT fabricated. They are a strength (proof real money has changed hands) and are KEPT and promoted.
- **Starting tomorrow, every WhatsApp auction is also launched in the webapp** → real live/upcoming auction inventory flows into Firestore. So the "live marketplace" centerpiece is REAL-data, with honest graceful fallback for the thin first days.
- **Guest browsing shipped today** (PR #89): a cold visitor who clicks "Enter" now lands on the real, read-only Discover page (real auctions), not a login wall. `auctions` is world-readable (`allow read: if true`). So landing CTAs flow into real content — no fake→real jump.

The current page is a rich, dual-framed ("buy smart AND sell smarter") 2846-line page that already has trust cards, escrow explanation, seller/buyer how-it-works tabs, a "sellers keep 95%" banner, categories, FAQ, real testimonials/stats, a physical-inspection pitch, and an interactive simulated live-auction demo. It reuses `Reveal` (scroll-in), `Counter` (count-up), `getLineIcon`, the orange `#F05123` / ink `#0A0A0A` / IBM-Plex-Arabic design system, RTL via global `<html dir>` + `rtl:` Tailwind variants + explicit `dir="ltr"` on numerals, and `translations.ts` + ~128 inline bilingual ternaries. It fires ZERO analytics and reads ZERO real data today.

The work is therefore a **reframe + one real new section + plumbing**, NOT a rebuild.

## Goals

### 1. Seller-first hero
Reframe the hero to lead with selling: headline about listing a valuable item and selling it live to real buyers (bilingual, RTL-native). **Primary CTA = "List Your Item"** with heavier visual weight (the dominant orange button); **secondary CTA = "Browse Live Auctions"** (lighter). Both currently call `onEnter()`; keep that, but each fires a distinct analytics event and the seller CTA carries seller intent (see §5). Keep the interactive live-auction demo as supporting visual. The headline/subhead move from "buy AND sell" balance to seller-primary while keeping buyer as clear secondary.

### 2. Promote the real proof
The real WhatsApp track record (15,000+ users / 1,250+ sales / 3,400+ inspected) is the trust spine. Surface a compact proof strip HIGHER in the flow (near the top, after the hero) and frame it for sellers ("thousands already buying on Mazad JO — your item meets real demand," honest phrasing tied to the real numbers). Keep the testimonials section (real). Do NOT invent additional numbers; MJ adds more testimonials over time.

### 3. Real live-marketplace centerpiece (NEW)
A curated "Live now on Mazad JO" section reading REAL auctions from Firestore via a new standalone hook `useLandingAuctions` (one-time query, works logged-out — mirrors `useSocialProof`'s standalone `getDocs` pattern; NO AppContext coupling). Curate, don't dump: surface up to ~6-8, prioritized **Ending soon** (live, nearest endTime) then **Featured/most-active**. Each card: product image, title, category, current bid, bid count, time remaining, verification badge if applicable, "View auction" (→ `onEnter`, flows to real read-only Discover via guest-browse). **Honest graceful fallback:** when the query returns nothing (the thin first days), render NOT fake cards but a founding-seller framing ("Auctions launch daily — list now and be one of the first"). Immediately after the section: a seller CTA — *"Ready to see your item here? → List Your Item."*

### 4. Seller-trust journey ordering
Reorder existing + new sections into the trust ladder (reusing existing section components, just re-sequenced where it improves flow — do NOT gratuitously reorder every section; move what materially helps):
hero (seller) → **proof strip** → why-auctions-beat-classifieds/Facebook-Marketplace → how-selling-works (**seller tab default/first**) → **seller CTA** → **real live marketplace** (evidence backs the ask) → categories → testimonials → escrow/inspection trust → FAQ → **final seller CTA**. The existing escrow, office-visit, pricing/commission, categories, FAQ sections are kept.

### 5. Seller-funnel analytics + CTA intent
Add a small `landingAnalytics` helper that emits a defined seller-funnel event taxonomy — `landing_viewed`, `seller_cta_clicked` (with a `location` param: hero/marketplace/final/sticky), `browse_cta_clicked`, `auction_viewed`, `category_selected`, `language_switched`, `seller_form_started`/`seller_form_submitted` if a form is used. Emit CLIENT-SIDE only (console + `window.dataLayer.push` for future GA/Segment) — do NOT write to Firestore for anonymous visitors (the `analytics_events` rule requires auth; opening it to anon writes is an abuse surface, out of scope). Wire these events at each CTA/interaction. Seller CTAs pass a seller-intent signal to `onEnter` where feasible (so post-auth the visitor can be routed toward the Sell flow — if the current `onEnter` can't carry intent without app-shell changes, at minimum fire the distinct analytics event + keep the copy; deep-intent routing is a documented follow-up, not required for v1).

### 6. RTL-native throughout
Every new/changed element works natively in Arabic (RTL) AND English (LTR) — headings, spacing, icon placement, the new marketplace cards, CTAs, animations. Reuse the file's existing RTL idioms (`rtl:` variants, `dir="ltr"` on numerals/prices, global `<html dir>`). Arabic is NOT an afterthought — every new card/section is authored bilingual from the start via the same `t.*` + inline-ternary pattern the file already uses.

## Non-Goals (YAGNI)

- No backend, Firestore rules, or data-model changes. No server-persisted anonymous analytics (client-emit only; server persistence is a flagged follow-up).
- No new business model, branding change, or color-palette change — preserve the premium feel and the existing design system.
- No removal of the real testimonials/stats (they're real — keep + promote).
- No from-scratch rewrite of the 2846-line file — evolve it section-by-section, reusing `Reveal`/`Counter`/`getLineIcon`/translations.
- No new auth/routing rework to make seller-intent deep-link land on Sell (documented follow-up if `onEnter` can't carry intent cleanly).
- No fabricated cards/numbers ever — the marketplace section shows real data or an honest founding-seller fallback.

## Architecture & Components

- **`src/landing/useLandingAuctions.ts`** (new) + `.test.ts` — standalone hook: one-time `getDocs` query of `auctions` (world-readable), returns curated `{ endingSoon: LandingAuction[], featured: LandingAuction[], isLoading, isEmpty }`. Pure curation/sort logic extracted + unit-tested (ending-soon = live & future endTime sorted ascending; graceful empty). Mirrors `useSocialProof`'s standalone-query + module-cache pattern. Simulated auctions (`isSimulated`) excluded (never on a public trust surface).
- **`src/landing/landingAnalytics.ts`** (new) + `.test.ts` — `emitLandingEvent(event, params?)`: console + `window.dataLayer.push` (guarded for SSR/no-dataLayer), plus a pure `buildLandingEvent(event, params)` returning the normalized payload (the tested unit).
- **`src/landing/LandingView.tsx`** — reframed hero, new marketplace section (consumes the hook), promoted proof strip, reordered sections, analytics wiring at CTAs, seller-intent on `onEnter` calls. Reuses existing sub-components.
- **`src/landing/translations.ts`** — new bilingual keys for the reframed hero, the marketplace section, the founding-seller fallback, and the new seller CTAs.

## Testing

- **`useLandingAuctions` curation:** unit tests — ending-soon filters to live+future-endTime and sorts ascending; simulated excluded; empty input → isEmpty true; caps to the display limit.
- **`landingAnalytics`:** unit tests — `buildLandingEvent` normalizes event name + params + timestamp; the emit wrapper no-ops safely when `window.dataLayer` is absent.
- **LandingView:** presentational — build + `tsc` + the manual preview are the evidence. No unit test for the big JSX file.
- **Manual preview (REQUIRED — hard gate, no merge until MJ approves):** desktop + tablet + mobile, AND both languages (Arabic RTL is a first-class check, not a glance). Confirm: seller-first hero with List-Your-Item dominant; real live auctions render when data exists AND the founding-seller fallback renders honestly when empty; proof strip reads truthfully; the trust-journey order flows; guest-browse continuity (View/Browse → real Discover); RTL layout is native (no LTR bleed, numerals correct); analytics events fire (visible in console/dataLayer). Money/functional risk is low (no data writes), so the gate is purely visual/trust judgment — MJ's call.

## Deliverable (post-implementation, per the brief)

After the redesign lands, provide: (1) design-decision rationale, (2) assumptions made, (3) remaining weaknesses, (4) off-landing-page improvements that would further increase seller conversion, (5) what to work on next for marketplace liquidity over 6 months. (This is written up in the final report / PR body, not code.)
