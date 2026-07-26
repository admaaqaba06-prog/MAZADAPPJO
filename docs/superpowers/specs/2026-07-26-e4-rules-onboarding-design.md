# E4 — Rules & Onboarding Design

Date: 2026-07-26
Status: Approved policy (auction roadmap); E4 implementation spec.

## Goal

Make the auction rules **clear, up front, and discoverable** (not buried in a legal
ToC), get an explicit **acceptance at pay-to-bid**, and rewrite the rules content to be
internally consistent with the app (5% buyer + 5% seller, no deposit, ban ladder,
returns). Layered discoverability so a cooldown/ban is fair & enforceable.

## Scope (this epic)

### 1. Plain-language Auction Rules (new `AuctionRulesModal` + shared content)
- New `src/components/AuctionRulesModal.tsx` — a scrollable modal presenting the rules
  in friendly bilingual language. Content lives in one shared source
  (`src/content/auctionRules.ts`, bilingual array) so every entry point shows the same text.
- Reconciled content (locked policy): registered members only · every bid is binding
  (no retracting) · min-increment shown per auction · highest bid at close wins · **pay
  within 24h** · **late/no payment → account cooldown, repeat → 3-month suspension** ·
  **5% buyer premium** added to the winner's total · **5% Mazad commission** on the
  seller's proceeds · **no security deposit** · buyer inspects on delivery and may reject
  damaged/wrong items (returns via Mazad) · Mazad holds funds until the buyer confirms ·
  manipulation/collusion/fake bids → permanent ban.
- NO 3% fee (old Rules doc error), NO deposit language.

### 2. Acceptance at pay-to-bid
- In `SubscriptionView` (the membership paywall = the pay-to-bid moment), add a required
  **"I have read and accept the Auction Rules"** checkbox (with an inline "read the rules"
  link opening the modal) that **gates `handlePay`** (button disabled / guarded until checked).
- On successful subscribe, persist `acceptedAuctionRulesAt` (timestamp) + `acceptedAuctionRulesVersion`
  on the user doc (so we have a record; version lets us re-prompt if rules change materially).
- Rules writable by the owner on their own user doc (not a server-only field).

### 3. Discoverable entry points
Link to the AuctionRulesModal from:
- The **live bidding room** — a small "ⓘ Rules" affordance near the bid dock (mobile + desktop).
- **How It Works** page — a "Read the full auction rules" link.
- The **footer** (landing + app).
- **Account/help** area.

### 4. Just-in-time reminder
- At the **bid-confirm** step, a one-line "this bid is binding" note (reuse the existing
  BidConfirm surface — copy only, no flow change).

### 5. Legal backstop
- Keep `TermsModal` (formal ToC) as-is for now; the plain Auction Rules is the primary,
  discoverable surface. The formal Terms/Rules PDFs get a final legal/lawyer pass separately
  (deferred) — this epic delivers the app UX + reconciled plain content.

## Out of scope
- Ban-ladder ENFORCEMENT (blockedUntil/strikes) = E2. E4 only *communicates* it.
- Returns FLOW = E6. E4 only states the returns policy in the rules.
- Formal legal ToC finalization (lawyer) — deferred.

## Testing
- Unit: acceptance-gate predicate (can't pay until accepted) if extracted; content array shape.
- Existing suite green; lint + build clean.

## Rollout
- Customer-facing → Vercel preview, founder reviews the **rules wording** before merge.
- The rules content is drafted by Claude for MJ's review; final legal wording is MJ's + lawyer's call.
