# App Simplification + New-User Activation — Design Spec

**Date:** 2026-07-21 · **Goal:** Simplify the app's information architecture, fix the new-user activation funnel from the first Discover landing, make onboarding accurate, add a "How it works" home, trim alerts, and re-center the seller flow around a mandatory approval gate. Framed by the Hooked model (Trigger→Action→Variable Reward→Investment) and "one surface, one mental model."

**Stack:** React 19 + Vite + Tailwind v4 + `motion`; Firebase (Firestore/Auth/Functions). State-based routing via `activeView` in AppContext (no React Router). Bilingual AR-default; house motion = smooth ease-out, no bouncy springs.

**Revenue context (drives decisions):** Real revenue = **10% per transaction (5% seller + 5% buyer premium)**. Membership is a low-friction commitment filter + small recurring base, NOT a paywall that suppresses the bidder pool. Browsing/watching free; only *bidding* is gated.

---

## 1. Simplified Information Architecture

**Nav shrinks 8 → 4 core + role-gated + a persistent Help link:**
- **Discover** (home; default view) — the single browse surface: live + upcoming drops. Tapping a live card enters the bidding room. Absorbs "Live Stream."
- **My Orders** — purchases/payments/wins.
- **Membership** (a.k.a. Account) — status, join/upgrade, profile.
- **Sell** — create a listing or request concierge listing (both → approval gate).
- **How it works** — persistent link (header menu + mobile), opens the explainer page.
- Role-gated: **Admin** (admins), **Seller Center** (sellers) — not in the primary bar for regular users.

**Remove "Live Stream" from nav.** It's not a browse destination; it's the bidding room entered from a live card. When ≥1 auction is live, Discover shows a **"🔴 Live now — N auctions" strip** at the top (tap → enter the live room). Guard against routing into a dead stream when nothing is live (today's `auctions[0]` fallback can dump users into an ended auction — fix).

**Right rail (desktop) becomes useful, not an empty ledger.** For non-members / new users: a compact **"How it works" (3 steps) + live social proof** (see §4). For members with activity: their **4 relevant alerts** (see §5). Drop the escrow-ledger "No recent transactions" default.

## 2. New-User Activation (the funnel)

1. **Onboarding modal → converts (not a dead end).** Keep 3 short steps but the FINAL CTA acts:
   - Non-member → **"Join from 1 JD"** → Membership (join flow).
   - Or **"Explore live drops"** → closes onto Discover with the live strip highlighted.
   - Accuracy fixes (see §3). Add a small "How it works" link in the modal footer.
2. **Empty state keeps them on-platform.** When nothing's live, replace the WhatsApp-first off-ramp with: **upcoming-drops preview + Join CTA + "we'll alert you when the next drop is live"** (follow/notify) + social proof. WhatsApp channel becomes a *secondary* link, not the primary CTA.
3. **Join-at-intent.** When a non-member taps a card's BID/JOIN, lead with an inviting **"Join to bid — from 1 JD"** sheet at that moment (value + what they unlock), not a cold post-attempt rejection. (Improve SubscriptionPromptModal copy + trigger it *before* the bounce where possible.)
4. **Mobile hero gets a real CTA** (Join / Watch live) — currently decorative.
5. **Kill the fake 550ms skeleton** on tab/category/search (synthetic latency). Add subtle `motion` fade/stagger to the card grid (feed currently uses none).
6. **Social proof from real Firestore data** (see §4).

## 3. Accurate Onboarding + How-It-Works page

**Onboarding accuracy (must match reality):**
- Membership: **"from 1 JD/month"** (tiers: 1 JD/mo, 4 JD/6mo, 7 JD/yr). "1 JD to start" is fine as the lead, but don't imply one-time-forever.
- Fees: **5% buyer's premium on win + 5% seller commission** — state both honestly (transparency builds trust).
- Payment: CliQ to Mazad JO (Capital Bank). Pay within 24h of winning.
- Delivery: pickup or paid delivery (~2–4 JD); Mazad arranges.

**New `HowItWorksView`** (persistent nav link + linked from onboarding + empty state): a clean, bilingual explainer of the whole loop:
1. Join (membership tiers, from 1 JD/mo).
2. Browse & watch free; bid live (free to bid, pay only if you win).
3. Win → pay via CliQ + 5% within 24h.
4. Get it → pickup or delivery.
5. Sell with us → submit a listing (self-serve or concierge) → team approves → goes live → 5% on sale.
FAQ accordions for the common questions (from the bot's knowledge base). This is the single source of "understand everything."

## 4. Social Proof (real data only)

Pull live from Firestore (no fake numbers): **active members count, live bidders now, recent wins (item + city, anonymized), total auctions run.** Surface tastefully on: the join banner, the empty-state, and the desktop right rail for new users. If a number is too small to impress early on, fall back to qualitative trust (Secure CliQ, Verified sellers, Pay only if you win) — never fabricate.

## 5. Alerts — trimmed to what matters

A bidder's relevant alerts (keep ONLY these): **① You've been outbid ② You won ③ Payment confirmed/activated ④ A drop you follow is starting.** Remove internal/escrow-jargon events. Rename the rail "Your activity" / "تنبيهاتك". Empty → show How-it-works + social proof (§4), not "No recent transactions."

## 6. Seller flow — re-centered on the approval gate

Both paths on one UI, mandatory Mazad review before anything goes live:
- **Self-serve:** seller creates a listing (title, description, condition, expected price, photos) → **submits for review** → status: *pending → approved & scheduled/live / rejected (with reason)* → track in Seller Center.
- **Concierge:** "Let Mazad list it for me" → submit item details/photos → team creates the listing → same approval/track flow.
- **Admin approval queue:** admins see a queue of pending listings → approve (schedule/publish) or reject (with reason back to the seller). (A pending-listings banner already exists for admins/sellers — formalize it into a proper queue.)
- Seller Center re-centers on: New listing · Pending review · Live · Sold · (5% commission shown).

## 7. Membership as config

One config object (e.g., `membershipConfig`: tiers, "gate bidding only", copy) so the model can change/experiment (e.g., "first bid free", trial) without a rebuild. Browsing/watching never gated; bidding gated with join-at-intent.

---

## Build waves (prioritized, each reviewed + shipped)

- **Wave A — IA + shell:** remove Live Stream from nav; Discover as sole home + live strip + dead-stream guard; simplified nav (4 + role-gated + How-it-works); right rail rework. Kill fake skeleton.
- **Wave B — Activation:** onboarding converts + accuracy; empty-state on-platform; join-at-intent; mobile hero CTA; card-grid motion.
- **Wave C — How It Works page + social proof (real data).**
- **Wave D — Alerts trim** (4 types, useful rail).
- **Wave E — Seller flow** (self-serve + concierge submit → approval gate → track; admin approval queue).

## Success criteria
A first-time visitor understands what Mazad is and how to win in ~5s, can grasp the full model via one How-it-works page, is never pushed off-platform before joining, and the nav/alerts feel simple not overwhelming. Sellers can submit listings (self or concierge) that always pass a Mazad approval gate.

## Deferred / noted
- **CliQ API integration** (MJ building): payment verification will automate — keep orders/payment UX so "team verifies within minutes" flips to "auto-verified" without redesign.
- **Membership monetization** is a live strategic question (given 10% commission); model built as config to allow change.
