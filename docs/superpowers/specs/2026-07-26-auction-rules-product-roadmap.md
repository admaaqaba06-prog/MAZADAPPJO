# Mazad JO — Auction Rules & Product Roadmap

Date: 2026-07-26
Status: Decisions locked (this doc). Each epic gets its own design spec + plan before build.
Source: team meeting notes + Auction Rules / Terms docs, reviewed with MJ.

## Locked policy decisions

- **Fees — total take 10%.** Buyer pays **hammer price + 5%** (buyer premium, already
  built). Seller **nets 95 on a 100 sale** — a **5% seller commission** is deducted on
  payout (NEW). Every price surface must reflect this.
- **Payment window: 24h** (per-auction configurable, default 24h — already built). Keep.
- **No security deposit.** Remove the deposit-to-bid concept from rules, terms, and any code path.
- **Ban ladder (graduated, auto-expiring):** 1st non-payment = warning + short cooldown
  (24–48h, TBD) → 2nd = 3-month suspension → fraud/collusion = permanent. Replaces
  today's indefinite block. **Must be communicated in-app** (see E4) — that's the
  condition for it being fair/enforceable.
- **All money is manually approved by MazadJo.** No auto-release of escrow; admin
  verifies payment and approves release.
- **Auction start: support both** — scheduled drops (built) AND first-bid-starts-the-clock (new).
- **Two-way ratings** (buyer↔seller), visible throughout the app.
- **Auto-relist** unsold listings (opt-in, after 24h, with a cap).

## Rules discoverability (layered — not one buried ToC)

A cooldown/ban is only fair if the user could have known. Surface rules where they bite:
1. **Plain-language "Auction Rules" page** (the 12 rules, friendly), reachable from the
   live bidding room ("ⓘ Rules" by the bid button), How It Works, footer, and account/help.
2. **Acceptance modal at bidding onboarding** (E4) — the ~5 rules that bite (bids binding ·
   pay within 24h · non-payment → cooldown, repeat → 3-month · 5% buyer premium · no
   returns except damage) + "I accept" + link to full rules.
3. **Just-in-time reminders** at bid-confirm ("binding bid") and win/pay ("pay in 24h — late = cooldown").
4. **Formal legal ToC** kept as the backstop (footer + signup), separate from the plain rules.
5. **Concrete consequences in the rules text** — replace vague "penalties may apply" with the actual ladder.

## Doc reconciliation needed (current inconsistencies)

- Rules doc says **3%** fee; Terms doc says **5%**; app charges 5% buyer premium. → Rewrite
  both to: **5% buyer premium + 5% seller commission**, consistent with the app.
- Terms doc says "**permanent ban for ANY violation without notice**" → soften to the ladder
  (permanent reserved for fraud); non-payment follows the cooldown ladder.
- Both docs mention "**security deposit**" → remove.
- Rule 6 vague penalties → concrete cooldown ladder.

## Epics (each gets its own spec + plan before build)

### E1 · Money model (foundational — do first)
- Add **5% seller commission** deducted on payout; keep 5% buyer premium.
- Reflect economics everywhere: winner "total if you win", seller "you'll receive" on the
  listing + Seller Center Money + order detail (100 → buyer 105, seller 95, Mazad 10).
- Add **CliQ sender-phone** field at payment (family transfers come from a different number).
- Confirm all release/approval is **manual by admin** (mostly built — verify no auto path).
- Remove **security-deposit** concept.

### E2 · Enforcement ladder + in-app surfacing
- `blockedUntil` + `strikeCount` + `blockedReason` on the user; enforcer applies the ladder
  and **auto-unblocks on expiry**. Replaces indefinite block.
- **In-app ban modal/warning** (reason + when it lifts) + **live session-sync** so a
  ban/unban reflects without a refresh (the deferred item).

### E3 · Auction engine
- Per-listing **start mode**: scheduled (built) or **first-bid-starts-the-clock** (open,
  awaiting first bid; duration clock begins on first bid).
- **Auto-relist** after 24h if unsold (opt-in toggle + relist cap).
- **Below-reserve near-miss:** seller taps "accept last price" → buyer must confirm → sale.

### E4 · Rules & onboarding
- **"I accept the auction rules" modal** in bidding onboarding (before first bid / at membership).
- **Rewrite Rules + Terms** to be internally consistent and match the app (5%+5%, no deposit,
  ban ladder, returns) + the layered discoverability entry points above.

### E5 · Notifications
- **Non-winner** engagement ("you were outbid — here's what's live").
- **Seller notifications:** auction ended · buyer paid · buyer didn't pay in window ·
  below-reserve near-miss offer.

### E6 · Fulfillment, escrow & returns
- Buyer confirms receipt (built) → MazadJo manually approves release.
- **Returns/damage flow:** buyer rejects on delivery → dispute → refund-from-escrow → + policy text.

### E7 · Two-way reputation
- Add **seller→buyer** ratings (buyer→seller built); surface **both** on profiles, listings,
  bidder identity, and orders.

## Build order
1. E1 (money) → 2. E4 (rules rewrite + acceptance modal) → 3. E2 (ban ladder) →
4. E3 + E5 (engine + notifications, parallelizable) → 5. E6 (returns) + E7 (ratings).

## Open specifics to confirm before speccing each epic
- **E2:** exact 1st-miss cooldown length (24 vs 48h); does non-payment count as a strike
  only after the full 24h window lapses?
- **E3:** first-bid-start — confirm the duration clock starts on first bid.
- **E6:** returns policy — who pays return shipping on a damage/mistake return?
