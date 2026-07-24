# Membership: pill-only nav + real member page + non-revoking upgrade

**Date:** 2026-07-24
**Status:** Approved (design), pending implementation plan
**Scope:** Nav (`DesktopFrame.tsx`), the membership page (`SubscriptionView.tsx`), and one money-path server change (`functions/index.js` `requestSubscription`).

## Context & Problem

Three findings, all confirmed in code:

1. **The "Membership" nav tab and the "Member ✓ / Join — 1 JD" pill are already redundant** — both call `setActiveView('wallet')` (`DesktopFrame.tsx:311` tab, `:370` pill; mobile tab `:193`). Two controls, one destination.
2. **There is no active-member state.** `SubscriptionView` (rendered at `activeView === 'wallet'`) has exactly two branches: `isPendingReview` → pending screen, else → **the payment/pricing form**. A paid member who clicks the pill lands back on the pricing form as if they never joined. The user doc already carries the data a real member page needs: `subscriptionStatus`, `subscriptionTier`, `subscriptionExpiry`, `subscriptionPlan` (`types.ts:21–24`).
3. **Upgrading would revoke the membership being upgraded.** `requestSubscription` (`functions/index.js:1258–1266`) unconditionally writes `subscriptionStatus: 'pending'` to the user doc. Bidding is gated on `subscriptionStatus === 'active'` (`useBidFlow.ts:44`, `DesktopLiveAuctionLayout.tsx:919`, `MobileLiveAuctionLayout.tsx:1090`). So an active member who submits an upgrade drops to `pending` and **cannot bid until an admin approves** — the exact opposite of what paying more should do.

## Goals

### 1. Fold the Membership tab into the pill (nav cleanup)
Remove the "Membership" nav entry from BOTH the desktop top-nav (`DesktopFrame.tsx`) and the mobile bottom-nav. The pill (`Member ✓` / `Join — 1 JD`) stays as the single entry to `wallet`. No behavior change to the pill itself.

### 2. Active-member page (new third state in `SubscriptionView`)
When `subscriptionStatus === 'active'`, render a membership dashboard instead of the pricing form:
- **Your membership:** current tier name (Starter Bidder / Professional Elite / Supreme Investor, mapped from `subscriptionTier`/`subscriptionPlan`), an "Active" status chip, and the renewal/expiry date from `subscriptionExpiry` (formatted; gracefully omitted if null).
- **Member benefits:** a clean list of the real perks — bid freely (no per-bid fee), pay only when you win (+5% premium), VIP pay-on-delivery, escrow buyer-protection (payment held until you confirm receipt). Bilingual. Sourced as a small local list in the component (no benefits data exists elsewhere to reuse; the VIP/escrow lines mirror `dropCaption.ts` + the join-funnel copy).
- **Upgrade:** show tiers ABOVE the member's current one with an "Upgrade" CTA that drops into the existing payment flow pre-targeted at that higher tier. If the member is already on the top tier (`annual`), show "You're on the top plan" and no upgrade CTA.
- **Upgrade-under-review indicator:** if the member is active AND has an open upgrade request (see §3 — they stay `active`, so `isPendingReview` won't fire), show a subtle inline "Upgrade under review" banner on the member page rather than the full pending takeover. Detected via an existing open `subscriptionRequests` doc for this user, OR (simpler, no new read) a local `submitted` flag after they submit in-session. Use the local flag for v1 — the full cross-session detection is a nice-to-have, not required.

Non-members (`none`/`expired`/`rejected`) and `pending` users see EXACTLY today's UI — the pricing form and the pending screen are unchanged.

### 3. Upgrade must not revoke active membership (money-path server change)
`requestSubscription` change: when the requesting user is **already `active`**, do NOT write `subscriptionStatus: 'pending'` to the user doc — keep them `active` so they keep bidding while the upgrade request is reviewed. The `subscriptionRequests` doc is still created with `status: 'pending'` (it needs admin review), and the other user-doc fields (`subscriptionPlan` for the *requested* tier, proof, transfer name/phone) still write. On approval, `approveSubscription` grants the new tier + a fresh full term (new `subscriptionExpiry`), exactly as it does for a first-time grant — this is the "new full term at the new tier" model MJ chose.

**Extraction for testability:** the user-doc-status decision is pure logic — extract a small pure helper `userStatusForSubscriptionRequest(currentStatus): 'pending' | 'active-unchanged'` (or equivalent) into a tested module (mirroring the `settlement.js`/`orderPaymentVerify.js` pattern), and have the callable use it. A first-time/none/expired/rejected user → `pending` (today's behavior, unchanged); an already-`active` user → stays `active`. This keeps the one money-path branch under unit test.

## Non-Goals (YAGNI)

- No proration/credit math — upgrade is a fresh full term (MJ's explicit call).
- No change to the pricing form, the pending screen, or the payment/verify flow itself beyond the one status-write conditional.
- No change to `approveSubscription`/the grant path — it already sets tier + fresh expiry correctly for any grant.
- No new "downgrade" or "cancel membership" actions.
- No cross-session open-upgrade-request detection in v1 (local in-session flag only for the "under review" indicator).
- No change to the pill's own appearance/logic.

## Testing

- **Server helper** (`userStatusForSubscriptionRequest` or equivalent): unit tests — `none`/`expired`/`rejected`/`undefined` → pending; `active` → stays active; `pending` → pending (an already-pending user re-submitting is not an active member, keep today's behavior).
- **`requestSubscription` wiring:** the callable uses the helper for the user-doc status write; the request doc always gets `status:'pending'`. (No unit harness for the callable itself — the pure helper carries the logic; build + the helper's tests are the evidence, consistent with the other money-path callables.)
- **SubscriptionView active state:** presentational — build + `tsc` + the manual preview are the evidence (no unit test for the new UI branch).
- **Manual preview (REQUIRED, preview-gated — no merge until MJ approves the look):** (a) active member sees the member dashboard (tier, expiry, benefits, upgrade options) NOT the pricing form; (b) top-tier member sees no upgrade CTA; (c) non-member and pending users see today's UI unchanged; (d) nav shows no Membership tab, pill still works on both breakpoints; (e) **the money-path check MJ/colleague must do with real/sim data:** an active member submits an upgrade → stays able to bid (status stays active), the request appears in the admin Verify & Approve queue, and on approval the new tier + fresh expiry applies.

## Architecture & Components

- `functions/subscriptionRequestStatus.js` (new) + `.test.js` — pure `userStatusForSubscriptionRequest(currentStatus)`.
- `functions/index.js` — `requestSubscription` uses the helper for the user-doc status write (the one conditional).
- `src/components/SubscriptionView.tsx` — new `subscriptionStatus === 'active'` branch (member dashboard); benefits list; upgrade section; in-session upgrade-under-review indicator. Existing pending + pricing-form branches untouched.
- `src/components/DesktopFrame.tsx` — remove the Membership tab from desktop top-nav and mobile bottom-nav (2 deletions). Pill unchanged.
