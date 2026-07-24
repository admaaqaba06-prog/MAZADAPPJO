# Landing Hero Redesign — "Live Room, Elevated"

**Date:** 2026-07-24
**Status:** Approved (design via visual companion — Direction A refined), pending implementation plan
**Scope:** The hero section of `src/landing/LandingView.tsx` (`#hero-section`, ~lines 948–1240) + its copy in `translations.ts` + the `ACTIVE_ITEMS` demo data. Approved mockup saved at `docs/superpowers/specs/2026-07-24-hero-redesign-approved-mockup.html`.

## Objective

The current hero explains the product but doesn't create enough desire. Goal: within ~3 seconds a visitor grasps the value prop, trusts the platform, and imagines selling their own valuable item — converting to sign up and bid/sell. MJ reviewed three directions in the visual companion and had a strong positive reaction to **Direction A ("The Live Room, Elevated")**, then asked for **more liveliness** (like the ticking countdown), to **keep the demo bidder names**, and to **use similar premium imagery**. This spec implements that approved, refined Direction A.

The hero's right column is ALREADY the interactive live-auction simulator (`ACTIVE_ITEMS` cycling with `currentItem`, `prices`, `timers`, `bidLogsList`, `handleUserBid`, `setIsAutoCycling`, story-progress bars). This is an ENHANCEMENT of that existing demo — not a rebuild — plus tightened left-column copy and real proof brought into the hero.

## Approved design (Direction A, refined)

### Left column
- **Tighter headline** for instant comprehension: `titleFirst` = "List it." · `titleGradient` = "Sell it live." (keep the self-drawing orange underline) · `titleLast` = "Get paid safely." (bilingual; Arabic authored natively, RTL). The existing three-part `t.hero.title*` structure is reused — only the strings change.
- Keep the subhead (`t.hero.desc`) — the "thousands of serious buyers / inspected / paid safely" promise.
- Keep the seller-first CTAs exactly: primary "List your item →" (`onEnter('upload')` + `seller_cta_clicked`), secondary "Browse live auctions" (`onEnter()` + `browse_cta_clicked`). Unchanged.
- **Bring the REAL proof into the hero** under the CTAs: a compact numeric row — **15,000+ buyers · 1,250+ items sold · 3,400+ inspected** (the real WhatsApp track record, verbatim, already used elsewhere). This replaces the current three feature-chips (`t.hero.stats.steps/verified/live`) as the hero trust signal, so credibility lands in 3 seconds. To avoid triplication, the separate dark "proof strip" section immediately below the hero (added in the prior landing redesign) is REMOVED — its numbers now live in the hero; the testimonials section keeps its own copy.

### Right column — the live room, more alive
Enhance the existing phone simulator with the motion MJ approved (all tuned subtle, not frantic):
- **Ticking countdown** — the timer visibly counts down each second (`00:38 → 00:37 …`), turns red + pulses under ~12s, with an **anti-snipe nudge** (a late bid bumps it back up) so it never dies.
- **New bid every ~2.5–4.5s** → the current bid **bumps + flashes**, a **"Latest bid" chip** pulses orange over the media, the **bid count climbs**.
- **Watcher count drifts** gently (e.g. 1,428 ↔ ±). **Bidder count climbs**. An occasional **avatar pops** into the stack.
- A **"🔥 <FirstName> just bid" toast** blips in on new bids — representative demo first-names (MJ approved keeping names; first-name-only, illustrative demo energy, consistent with the existing sim — NOT presented as verified real-time facts).
- **Bid Now button** gets a subtle sheen sweep. Phone gets a slight tilt + slow float; keep the cinematic warm-orange glow already behind the card.
- **A second lot peeks** behind the phone (a premium "Rolex Datejust" card, tilted) so it reads as a marketplace, not one item.

### Imagery ("use similar imagery")
Update `ACTIVE_ITEMS` demo images to the curated premium set from the approved mockup — a clean **iPhone 15 Pro Max** product shot (replacing the current mismatched phone photo that showed an unrelated calendar), the **Toyota Camry**, and add a **Rolex/watch** and keep breadth (car/phone/watch/realty). Premium Unsplash-style product photography with `onError` fallback so a failed load degrades to a gradient, never a broken image. MJ's own photos slot into these slots later.

## Constraints

- **Preserve brand identity** — orange `#F05123` / gradients `#FF6B35`→`#D63E10`, ink `#0A0A0A`, off-white, fonts `font-alexandria`/`font-ibmarabic`. No palette/font change.
- **Bilingual, RTL-native** — every new/changed string in both `ar` and `en`; motion/layout correct in RTL (`dir="ltr"` on numerals/prices/timers, logical `start/end`).
- **Honesty line (the team's established rule):** the simulated live room is the interactive DEMO (representative lots + demo names + animated bids) — illustrative of the experience, exactly the existing pattern. The **real proof numbers (15k/1.25k/3.4k) are real** and stay the factual trust signal. Do NOT introduce fabricated *statistics* presented as fact; demo activity in the sim is fine and MJ-approved.
- **No backend / money / hook changes.** The hero stays a self-contained simulation (reliable aliveness every load); the real-data `useLandingAuctions` marketplace section lower on the page is untouched. Real-auction wiring into the hero is a documented future option (YAGNI now).
- **Performance:** the added intervals/animations must be cheap (a single rAF/interval loop, not many timers), pause on tab-hidden if practical, and not regress the page. Respect `prefers-reduced-motion` — degrade to a calm static state.
- **Preview-gated:** customer-facing — MJ approves the Vercel preview (both languages) before merge.

## Architecture & Testing

- **`src/landing/LandingView.tsx`** — hero section only: left copy/proof edits; right-column sim enhancements built on the existing `ACTIVE_ITEMS`/`prices`/`timers`/`bidLogsList`/`handleUserBid`/auto-cycle state (extend, don't duplicate); new decorative peek card; motion. Remove the redundant standalone proof-strip section.
- **`src/landing/translations.ts`** — new/updated hero headline strings; a `hero.proof` group (or reuse existing proof keys) for the 15k/1.25k/3.4k labels; demo first-name list if externalized.
- **`ACTIVE_ITEMS`** — curated image URLs + titles/prices.
- Any **pure helper** extracted for the liveliness (e.g. `formatCountdown`, a `stepBid` reducer, or a `nextWatcherCount`) gets a small unit test. The bulk is presentational JSX — build + `tsc` + the manual preview are the evidence.
- **Manual preview (hard gate):** desktop + mobile, both languages. Confirm: 3-second comprehension of the seller value prop; the room feels alive (countdown ticks, bids land, counts climb, toast pops) but not frantic; real proof reads truthfully; imagery is premium and correct (no mismatched photos); RTL native; reduced-motion degrades gracefully.

## Non-Goals (YAGNI)

- No new hero data source / real-auction wiring into the hero (simulation-first, approved).
- No change to CTAs' targets, the marketplace section, testimonials, or any money path.
- No palette/font/brand change.
- Not redesigning other landing sections (only the redundant proof strip is removed as a direct consequence of moving proof into the hero).
