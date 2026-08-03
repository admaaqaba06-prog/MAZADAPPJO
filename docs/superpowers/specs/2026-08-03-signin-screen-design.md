# Sign-in Screen — Marketing Surface (Design Spec)

**Date:** 2026-08-03 · **Status:** LOCKED with MJ.

## Why

`docs/superpowers/specs/2026-08-03-landing-live-lots-design.md` deferred this deliberately:

> - The sign-in screen redesign. **Separate spec, deliberately sequenced after this.**

That sequencing was right. Its problem statement is the reason:

> The landing page is the first surface in the funnel — visitors reach it, are told there is nothing to buy and that they should sell instead, **and only then reach the sign-in screen.**

PR #231 fixed the first half. This is the second half.

### What the screen is today

Verified on production 2026-08-03 at `mazad-jo.com/sell` and `/discover`: a `max-w-md` card holding a title, two buttons and an escape hatch, centred in a full-width black viewport. On desktop the content occupies roughly a third of the width and a quarter of the height. The only value copy on the page is a small grey footer tagline.

### The framing correction

An earlier pass treated this as a **gate** — a screen that should explain why you were stopped. MJ corrected that: it is a **marketing surface**.

> "they may not have come from a lot - this is more of a marketing opportunity"

That distinction drives the whole design. A gate reasons backwards from the interrupted action; a marketing surface has to work for someone with **no history at all** — an ad click, a shared domain link, a typed URL. Contextual copy is therefore additive, never the foundation.

There is real prior art, and it stops exactly where this begins. `2026-07-18-engagement-ux-design.md` Wave 2 (Activation) names `LoginView.tsx` and shipped two items — **deep-link carry-through** (`cameFromAuctionLink`, `LoginView.tsx:116`) and **zero-silence auth** (`mapAuthError`). Both assume the visitor arrived *from a specific lot*. Neither has anything to say to a cold arrival.

## Decisions taken with MJ (2026-08-03)

1. **The screen sells three things**, chosen from four candidates. In priority order: **live activity**, **trust/escrow**, **how it works**. The fourth candidate — seller opportunity — was explicitly **not** chosen and is out of scope.
2. **Treatment is a marketing panel beside the form.** Desktop two-column: panel left, sign-in card right. Mobile stacks with the **message first**.
3. **Auth mechanics are untouched.** Phone, Google, OTP, resend cooldown, SMS fallback, reCAPTCHA — none of it changes. A sign-in regression blocks every new user, so this change must be able to fail without touching that path.
4. **Real data only.** No fabricated counts, no placeholder lots. This codebase has already removed one round of invented content (fake seller reviews, PR #198; fabricated descriptions, PR #199) and the rule holds here.

## Ordering, and why

**Live activity → escrow → how it works.** Hook, then objection, then instruction.

Fogg's model (`Behavior = Motivation × Ability × Prompt`) is the frame the July spec already established. Ability and Prompt are both fine here: the buttons are one tap and unmissable. **Motivation is the missing term**, so it leads.

Within motivation, live activity precedes trust because a visitor who thinks the marketplace is empty never gets as far as worrying whether it is safe.

## Architecture

### Layout — `LoginView.tsx`

Desktop (`lg:` and up) becomes two columns; the existing card is the right column, **structurally unchanged**. Mobile keeps one column with the panel above the card.

The mobile ordering carries a real cost: a returning user wants the buttons, and message-first pushes them down. Mitigation, and it is not optional — **the mobile panel is the compact variant**: headline, live count, one trust line. The full three-step "how it works" renders **below** the card on mobile, and only in the left column on desktop. Nothing may push the primary buttons below the fold on a 667pt-tall viewport.

### Block 1 — Live activity

Reuses `useLandingAuctions` (`src/landing/useLandingAuctions.ts`) unchanged. It is a **module-level cached single `getDocs`** (`landingAuctionsCache`, `limit(60)`, curated by `curateLandingAuctions`), so a visitor who touched the landing page pays nothing and a direct arrival pays one read. No new query, no new index, no listener.

Renders a real count and up to **three** lots: image, title, current price.

**No countdowns, and this is a measured constraint, not a preference.** Production 2026-08-03: **149 lots are `status: 'live'` but only 4 carry a future `endTime`.** A countdown or an "ending soon" badge would be absent or wrong on ~97% of inventory. Price and title only. (This is the same clockless-lot reality behind `2026-08-02-awaiting-first-bid-design.md`.)

The count is whatever the query returns. It is never rounded up, padded, or hardcoded.

### Block 2 — Trust / escrow

The objection this market actually has: buying from a stranger online. The copy already exists and is already approved — `src/landing/translations.ts:551` (EN) and `:309` (AR):

> "Mazad holds your payment until you receive and approve the item, then releases it to the seller."

Condensed for the panel, in both languages, plus the CliQ payment line. **Do not write new trust claims.** Every claim on this panel must already be true and already stated elsewhere in the product; this codebase has shipped three comments asserting guarantees the code did not provide, and marketing copy is a worse place to do it.

### Block 3 — How it works

Three steps, desktop-only and below-the-card on mobile: watch a live auction → bid → pay by CliQ and the item ships. For visitors who have never used a live-auction app.

### Contextual layer — kept, unchanged

`cameFromAuctionLink` and its banner stay exactly as they are. Per-trigger lines for the other signup moments (`requestSignIn()` fires from bid, sell, save, chat and account taps — see `src/utils/guestGate.ts`) are a **follow-on slice**, not this spec. They layer on top of the marketing panel rather than replacing it.

## Theme constraints — binding

The theme work merged today (#223–#230) and left a **ratchet** at `src/theme.guard.test.ts` with budgets that must never rise:

- neutral hex literals (`text-|bg-|border-[#…]`) ≤ **31**
- `text-gray-200|300` ≤ **43**
- `border-gray-100|200|300` = **0**

The new panel therefore uses **tokens only** — `bg-surface-raised`, `bg-surface-sunken`, `border-line`, `text-fg`, `text-fg-muted` — and the accent, which is theme-invariant and exempt. It must render correctly in **both** light and dark. A raw neutral hex in this panel fails the ratchet and the build.

## Error handling — the honesty rules

Mirrors the rule already stated in `DesktopLiveAuctionLayout.tsx`: *an empty bordered card claims there is information when there is none.*

- **Loading:** the live-activity slot renders **nothing**. No skeleton, no shimmer — a placeholder shaped like content implies content that may never arrive.
- **Empty (zero live lots):** the slot **disappears entirely**. Trust and how-it-works remain and the panel still stands on its own. No "no auctions right now" message on a marketing surface.
- **Error:** identical to empty. Never surfaced to the visitor.
- **The form never waits.** The sign-in card renders and is interactive on first paint regardless of fetch state. If the fetch hangs, the visitor can still sign in — the panel is decoration on the critical path, and must behave like it.
- A lot missing an image, a title, or a price is **skipped**, not rendered half-empty.

## Testing

vitest here is `environment: 'node'` — but PR #222 established a technique this spec adopts: **`renderToStaticMarkup` from `react-dom/server`** (`src/components/contactCompletionModal.render.test.tsx`). Components render to a string in plain node with **no jsdom and no @testing-library**. Do not add either.

This is materially stronger than the source-text assertions used elsewhere in this repo, and it is the required approach here:

- The panel renders the real count and up to three real lots from injected data.
- **Loading renders no lot markup at all** — assert absence, not presence of a skeleton.
- **Empty and error render no activity block**, while the trust block survives.
- A lot missing image/title/price is skipped, and the remaining lots still render.
- **The sign-in buttons render in every one of those states** — loading, empty, error. This is the regression that matters most.
- Both languages: no Arabic in the English render and no English in the Arabic, and Western numerals per the house convention (`ARABIC_UI_DIGITS`).
- No countdown or time-remaining string renders for a clockless lot.
- Existing `LoginView` tests and the theme ratchet must stay green; the ratchet budgets must not rise.

Pure helpers (choosing and shaping the three lots) live in `src/utils/` with their own unit tests, following the house pattern.

## Explicitly NOT in scope

- Any change to auth mechanics, OTP, resend, reCAPTCHA, or `ContactCompletionModal`.
- Seller-opportunity messaging — considered and not chosen.
- Per-trigger contextual lines for bid/sell/save/chat. Follow-on slice.
- The landing page, and any change to `useLandingAuctions`' query, cache or cap.
- Analytics instrumentation. Worth doing — the July spec's funnel (`view→signup→…`) is still uninstrumented, so this change's effect will not be measurable. Called out rather than smuggled in.
- Countdowns, "ending soon" badges, and the clockless-lot problem generally.

## Risks to name plainly

**Mobile message-first is a real trade against returning users.** It was MJ's explicit choice and the compact variant is the mitigation, but if sign-in completion drops on mobile, the ordering is the first thing to reconsider — not the panel itself.

**`LoginView.tsx` is contended.** It was edited twice today by the theme work (#224, #228) and is 620 lines tangled with reCAPTCHA refs and `ConfirmationResult` state. Check for an in-flight session before starting. The two-column split should be additive markup around the existing card, not a rewrite of it.

**A marketing surface is where invented claims appear.** Every line on this panel must already be true and already stated elsewhere in the product. Nothing here may be aspirational.

**Customer-facing layout change: MJ approves the preview before merge** — desktop, mobile, both languages, both themes. Arabic RTL is a first-class check, not a glance.
