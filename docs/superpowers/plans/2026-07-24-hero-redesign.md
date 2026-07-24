# Landing Hero Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Refine the landing hero to the approved "Live Room, Elevated" (Direction A) — tighter seller-first headline, real proof in-hero, curated premium imagery, and a noticeably more *alive* auction simulator (ticking countdown, landing bids, climbing counts, just-bid toast) — preserving brand and the existing simulator machinery.

**Architecture:** Enhance the hero's existing right-column simulator (`ACTIVE_ITEMS`/`prices`/`timers`/`bidLogsList`/`handleUserBid`/auto-cycle) — extend, don't rebuild. Left-column copy + a real-proof row. Pure motion/format helpers unit-tested; the rest is presentational, verified by build + the manual preview.

**Tech Stack:** React 19 + TypeScript, Tailwind, Motion (`motion/react`), Vitest.

## Global Constraints

- **Visual source of truth:** `docs/superpowers/specs/2026-07-24-hero-redesign-approved-mockup.html` (the approved, MJ-loved mockup). Match its composition, motion feel, and imagery. Read it before implementing.
- **Preserve brand:** orange `#F05123`, gradients `#FF6B35`→`#D63E10`, ink `#0A0A0A`, off-white `#F7F7F7`, fonts `font-alexandria`/`font-ibmarabic`. No palette/font change.
- **Bilingual RTL-native:** every string in both `ar` + `en`; `dir="ltr"` on numerals/prices/timers; logical `start/end`.
- **Honesty:** the simulator is the interactive DEMO (representative lots, demo first-names, animated bids) — MJ-approved, same pattern as today. The real proof numbers **15,000+ / 1,250+ / 3,400+** are real — use verbatim, never alter. Introduce NO fabricated *statistic* presented as fact.
- **No backend/money/hook changes.** Hero stays a self-contained simulation; `useLandingAuctions` and all other sections untouched (except removing the now-redundant proof strip, Task 1).
- **Performance + a11y:** cheap motion (prefer ONE interval/rAF loop driving the sim, not many timers); honor `prefers-reduced-motion` (degrade to a calm static hero — no ticking/toast). Don't regress the page.
- After each task: `npx tsc --noEmit` (0 errors) and `npm test` (baseline 494, no regression). Customer-facing → hard preview-gate (both languages) before merge.

**Key anchors (current file):** hero `#hero-section` ~948–1240; left copy 972–1088 (badge 972, `t.hero.title*` 992–1008, `t.hero.desc` 1019, CTAs 1030–1048, feature-chips "stats bar" 1051–1088); right sim column 1092+ (phone card 1099, `currentItem.image` 1118, story bars 1145, streamer header 1156+, and the bid/timer/bidder UI further down to ~1240). Sim state + effects: `ACTIVE_ITEMS` (~177), `activeItemIndex`/`prices`/`timers`/`bidLogsList` (~374+), the driving `setInterval`s (~365/385/393), `handleUserBid` (~595), `setIsAutoCycling`. The separate dark proof-strip section sits just AFTER the hero `</section>` (search `t.proof.headline`).

---

### Task 1: Left column — copy, real proof in-hero, curated imagery

**Files:** `src/landing/translations.ts`, `src/landing/LandingView.tsx`.

**Copy (verbatim, both langs) — reuse the existing 3-part `hero.title*` structure (only strings change):**
- `en`: titleFirst `"List it."` · titleGradient `"Sell it live."` · titleLast `"Get paid safely."`
- `ar`: titleFirst `"اعرِضها."` · titleGradient `"بِعْها مباشرةً."` · titleLast `"واقبِض بأمان."`
- Keep `hero.desc` unchanged.

- [ ] **Step 1 — Real proof row replaces the feature-chips.** Replace the three feature-chip cards (`t.hero.stats.steps/verified/live`, ~1051–1088) with a compact real-proof row: **15,000+ buyers · 1,250+ items sold · 3,400+ inspected**. Reuse the EXACT bilingual values already in the removed proof strip (search `t.proof.stats` — `١٥,٠٠٠+`/`15,000+`, `١,٢٥٠+`/`1,250+`, `٣,٤٠٠+`/`3,400+` with labels buyers/sold/inspected). Render numerals `dir="ltr"`. Match the mockup's proof row (bold number + small uppercase label, thin dividers). If the `t.proof` group is only consumed by the strip being removed in Step 3, move/rename its stats into a `hero.proof` group; otherwise reuse in place.
- [ ] **Step 2 — Headline strings.** Apply the new `hero.title*` values above in both language objects.
- [ ] **Step 3 — Remove the redundant proof strip.** Delete the standalone dark proof-strip `<section>` immediately after the hero (the one rendering `t.proof.headline`/`t.proof.stats`) — its numbers now live in the hero; testimonials keep their own. Remove now-orphaned `t.proof` keys only if fully unreferenced (grep first).
- [ ] **Step 4 — Curated imagery in `ACTIVE_ITEMS`.** Update the demo lots to the approved premium set (match the mockup). Set the phone item image to a clean product shot `https://images.unsplash.com/photo-1592286927505-1def25115558?auto=format&fit=crop&w=800&q=80` (replaces the mismatched calendar photo). Keep the car (`photo-1621007947382-bb3c3994e3fb`). ADD a watch lot "Rolex Datejust 41" / "رولكس ديت جست ٤١" using `https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fit=crop&w=800&q=80` (category realty/watch — reuse the existing item shape: id/icon/titleAr/titleEn/detailsAr/detailsEn/image/badge/basePrice/stepPrice/timerStart). Keep the existing `onError` fallback chain; ensure a final Unsplash/gradient fallback so no broken image ever shows.
- [ ] **Step 5 — Verify + commit.** `npx tsc --noEmit` (0); `npm test` (494). Read the hero to confirm proof row + headline render, no leftover feature-chip refs, strip gone.
```bash
git add src/landing/translations.ts src/landing/LandingView.tsx
git commit -m "feat(hero): tighter headline, real proof in-hero, curated imagery; drop redundant proof strip"
```

---

### Task 2: Right column — bring the live room to life

**Files:** `src/landing/LandingView.tsx`; optional `src/landing/heroSim.ts` (+ `.test.ts`) for extracted pure helpers.

**Reference the approved mockup's `<script>` + CSS for exact behavior/values.** Build ALL of this on the existing simulator state (`prices`/`timers`/`bidLogsList`/`activeItemIndex`/`handleUserBid`); do not add a parallel engine. Prefer extending the existing driving `setInterval` over adding many new timers.

- [ ] **Step 1 — Extract + test the pure bits** (`heroSim.ts`): `formatCountdown(seconds:number):string` → `"mm:ss"`; `stepPrice(price:number, step:number):number`; `driftWatchers(n:number, rand:()=>number):number` (gentle ± drift, never negative); `antiSnipe(secondsLeft:number, bumpTo?:number):number` (if `secondsLeft < 12` return `secondsLeft + 8`, else unchanged). Unit tests: `formatCountdown(7)==="00:07"`, `formatCountdown(38)==="00:38"`, `formatCountdown(605)==="10:05"`; `stepPrice(4850,25)===4875`; `antiSnipe(7)===15` and `antiSnipe(30)===30`; `driftWatchers` stays ≥0 and near input.
- [ ] **Step 2 — Ticking countdown.** The visible timer counts down each second and formats via `formatCountdown`; under ~12s it turns red + pulses (brand red `#FF5A4D`); when a new bid lands within that window, apply `antiSnipe` so it nudges back up (never dies). Wire into the existing timers state/interval.
- [ ] **Step 3 — Landing bids.** Every ~2.5–4.5s (randomized) a bid lands: current price steps via `stepPrice` with a brief **bump** (scale ~1.14) + a **"Latest bid" chip flash** (orange ring) over the media; bid count climbs; an occasional avatar **pops** into the stack. Reuse `bidLogsList`/`handleUserBid` plumbing where possible.
- [ ] **Step 4 — Ambient life.** Watcher count drifts via `driftWatchers` (~every 2.6s). A **"🔥 <FirstName> just bid" toast** blips in on new bids — first-name-only demo names, bilingual list: en `["Omar","Layla","Khaled","Sara","Yousef","Rania","Tariq","Dana"]`, ar `["عمر","ليلى","خالد","سارة","يوسف","رانيا","طارق","دانا"]`. Bid Now button gets a subtle sheen sweep (CSS keyframe). Phone gets a slight tilt + slow float; keep the existing warm-orange glow.
- [ ] **Step 5 — Second lot peek.** Add a decorative "Rolex Datejust" card peeking behind/beside the phone (tilted, its own small live pulse + price), matching the mockup — purely visual, `aria-hidden`.
- [ ] **Step 6 — a11y + perf.** Gate all the new motion behind `prefers-reduced-motion: no-preference` (reduced-motion → calm static hero: no ticking/toast/flashes, static counts). Ensure the sim uses a bounded number of timers and cleans them up on unmount; pause when `document.hidden` if practical.
- [ ] **Step 7 — Verify + commit.** `npx tsc --noEmit` (0); `npm test` (494 + new heroSim tests). Manually reason through: countdown ticks, bids land + bump/flash, counts climb, toast pops, sheen sweeps, reduced-motion calm.
```bash
git add src/landing/LandingView.tsx src/landing/heroSim.ts src/landing/heroSim.test.ts
git commit -m "feat(hero): live-room motion — ticking countdown, landing bids, climbing counts, just-bid toast"
```

---

## Self-Review

**Spec coverage:** tighter headline (T1) ✓; real proof in-hero + strip removed (T1) ✓; curated imagery + fixed phone photo (T1) ✓; ticking countdown + anti-snipe (T2) ✓; landing bids w/ bump+flash + climbing bid count (T2) ✓; watcher drift + just-bid toast w/ demo names + sheen + tilt/float (T2) ✓; second-lot peek (T2) ✓; reduced-motion + perf (T2) ✓; brand/RTL/honesty (Global) ✓; simulation-first, no backend (Non-Goals) ✓.

**Placeholder scan:** exact copy strings, exact imagery URLs, exact demo-name lists, and pure-helper signatures + test cases are all concrete. Presentational motion references the in-repo approved mockup for exact look/timing.

**Type consistency:** `formatCountdown`/`stepPrice`/`driftWatchers`/`antiSnipe` signatures identical across T2 steps; `ACTIVE_ITEMS` item shape reused unchanged.

**Ordering:** T1 (copy/proof/imagery/strip) is independent of T2 (motion); both keep the suite green. Preview gate after T2 + whole-branch + cross-model review.
