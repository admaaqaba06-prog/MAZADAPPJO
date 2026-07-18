# Engagement & Conversion UX — Design Spec

**Date:** 2026-07-18 · **Goal:** Turn the functional core flow into a high-engagement, high-conversion experience with animation and positive feedback at every step. Framed by the **Hooked model** (Trigger → Action → Variable Reward → Investment) and the **Fogg Behavior Model** (Behavior = Motivation × Ability × Prompt).

**Principles**
- Every tap gets **instant, positive feedback** — nothing is ever silent.
- The **bid and the win are emotional peaks** — treat them like the reward they are.
- **Reduce friction to zero** at the money moments; increase *delight*, not steps.
- Motion is **meaningful** (confirms an action, directs attention) — not decoration. Use the existing `motion` (Framer) dep; smooth ease-out, no bouncy springs (per house style).
- Bilingual, Arabic-first; every string AR + EN.

---

## Wave 1 — The Reward Loop (the variable-reward core) _[build first]_

**Files:** `src/components/MobileLiveAuctionLayout.tsx`, `src/components/DesktopLiveAuctionLayout.tsx`, `src/components/LiveStreamView.tsx`, `src/components/AuctionDetailsModal.tsx`, `src/context/AppContext.tsx` (bid result handling), a new `src/components/feedback/` (toast + confetti + bid-confirm primitives).

1. **Bid = a rush, not a form submit.**
   - Fix the accidental-bid trap (P0): the quick amounts become clearly-labeled **bid buttons** («زايد ٢٠») with a lightweight **confirm** step showing total incl. 5% before commit; swipe-to-bid remains the primary commit. One pattern, unmistakable.
   - On success: the current price **animates up** (count-up), a brief **"🔥 أنت الأعلى الآن!" / "You're winning!"** pill pops and fades, subtle scale pulse on the price. Positive, <1s.
2. **Outbid = urgency.** When someone tops you: a red-tinted attention animation + **«تم تجاوزك — زايد لاستعادة الصدارة»** with a one-tap re-bid at the new minimum.
3. **Win = celebration.** On winning: full-screen **confetti burst** + **«🎉 مبروك! فزت بالمزاد»**, the item, the total incl. 5%, and one obvious **«ادفع الآن»** next step. This is the peak — make it feel earned.
4. **Anti-sniping drama.** Under ~10s left, the countdown turns red and pulses; a soft "+15s extended!" toast when a late bid extends it — turns a technical rule into excitement.
5. **Live liveliness.** Real bid feed animates in new bids (slide+fade); active-bidder chips; "X watching" only if real.

## Wave 2 — Activation (Trigger → Action; conversion) _[build second]_

**Files:** `LandingView.tsx`, `LoginView.tsx`, `SubscriptionView.tsx`, `OnboardingModal.tsx`, `DiscoveryFeedView.tsx`.

1. **Deep-link carry-through:** a WhatsApp drop link lands the user on *that item* (with countdown), through signup, back to it — never a generic feed.
2. **Zero-silence auth:** loading states on Send-code / verify; friendly AR/EN errors (no raw Firebase strings); success micro-confirm before transition.
3. **Membership as a no-brainer:** SubscriptionView with value framing ("bid on everything for 1 JD"), a clean CliQ→proof→pending flow with a **submitted-successfully** state (kills the silent-submit + duplicate bug), and a **"you're in!" celebration** on approval.
4. **First-bid nudge:** for a new member with 0 bids, a gentle inline coach on the first auction ("tap to place your first bid").
5. **Onboarding polish:** progress dots already there; add a subtle per-step illustration animation.

## Wave 3 — Investment & retention (bring them back) _[build third]_

**Files:** order/rating components (Plan B overlaps), profile, notifications.

1. **Post-win review** (Plan B): rating the win is the investment; it also gates the next bid — habit loop.
2. **"Your wins" + streaks:** a small trophy shelf; won-count with positive reinforcement.
3. **Watchlist / follow:** save an item or vendor → WhatsApp/app nudge when it's live (ties to the notification pipe).
4. **Return triggers:** "an auction you watched is live now" via the pipe.

---

## Cross-cutting: the feedback system
A small shared kit so feedback is consistent everywhere:
- `Toast` — success/info/warn with icon + AR/EN, auto-dismiss, smooth ease-out.
- `Confetti` — one-shot celebratory burst (win, membership approved).
- `CountUp` — animated number transitions (price, totals).
- `Pressable` — buttons get a tactile scale-on-press by default.
- Replace all silent `alert()` / no-feedback paths with these.

## Then: backend, analytics, admin _(next phase, separate spec)_
- **Analytics:** instrument the funnel (view→signup→member→first-bid→win→pay) so we can measure the conversion we're now optimizing. Events already partly exist (`analytics_events`); define the funnel + a dashboard.
- **Admin:** Aya's console polish (fast subscription approval, order/payment ops), the health dashboard (already specced), fix the subscription double-write/duplicate/downgrade bugs.
- This phase gets its own spec after Wave 1 ships.

## Success criteria
A new user feels a positive response to *every* tap; placing a bid produces a visible rush; winning feels like a celebration; and each step points unmistakably at the next. Measured later via the analytics funnel.
