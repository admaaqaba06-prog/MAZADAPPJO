# E5 — Notifications & Contact Completeness Design

Date: 2026-07-26
Status: Approved (design). Fifth roadmap epic. Two slices — A gates on the other, so build A first.

## Why

Two live sign-in methods each capture only ONE contact channel:
- **Phone OTP** (the WhatsApp funnel) → `phoneNumber` set, `email = ''`.
- **Google** → `email` set, `phoneNumber = ''`.

The post-signup modal (`ProfileCompletionModal`) collects name + city only. Result today: a
Google user can win an auction with **no phone**, so every WhatsApp notification for them posts
with `phone: ''` and vanishes; phone users have no email, and **no email channel exists in the
code at all**. Notifications also have three silent gaps: bans, below-reserve declines, and
unpaid-order reminders send nothing.

E5 fixes both halves: (A) guarantee every transacting user has a **verified phone + an email**,
and (B) a delivery layer that pushes each event to **in-app + WhatsApp + email** per a policy map.

## Verified current state (from a codebase map)

- **Auth:** only Phone OTP (`loginWithPhone`) and Google (`loginWithGoogle`) are wired into UI.
  An email/password `registerUser` exists in `AppContext.tsx` but no component calls it.
- **User doc contact fields** (`src/types.ts:6-56`): `email: string` (`''` when absent),
  `phoneNumber?: string` (canonical), `phone?: string` (mirror), `normalizedPhone` (client-written).
  No `whatsapp` field — WhatsApp routing reuses `phoneNumber`.
- **User doc writers:** client first-login branch (`AppContext.tsx:932-993`) and server
  `onUserCreated` (`functions/index.js:1834`), both `{merge:true}`, both write empty strings
  rather than fabricating.
- **Notifications out:** one helper `postToN8n(event, payload)` (`functions/index.js:39`) →
  `N8N_WEBHOOK_URL`; every payload's only contact field is `phone`. 11 emit sites (won,
  payment_due, below_reserve_offer, below_reserve_seller_accepted, outbid, order status ×5,
  membership_rejected, order_payment_rejected, ship/confirm nudges).
- **In-app bell:** a real, active `notifications` Firestore collection (`AppContext.tsx:2826`,
  `NotificationCenter.tsx`); `addNotification` builds docs client-side.
- **Dead paths:** server FCM sends (`admin.messaging().send` reading `users/{uid}.fcmToken`)
  exist, but no client ever registers a token → deferred, not used.
- **Silent today:** ban apply/lift (no emit in `banLadder.js`), `declineBelowReserve`
  (`index.js:2355`, emits nothing), and there is **no** recurring payment-reminder cron.

## Locked decisions

- **Capture point:** at first transaction (bid or list), NOT up-front — matches the existing
  `guestGate` pattern, keeps the WhatsApp funnel's first seconds friction-free.
- **Email delivery:** route through the existing n8n webhook — functions add an `email` field;
  n8n fans out to WhatsApp + email. One notification brain; templates live in n8n.
- **Added-phone verification:** OTP-verify a phone added post-signup (deliverability is the whole
  point). Email stays unverified for now.

---

## Slice A — Contact completeness

Guarantee a transacting user has BOTH a verified phone and an email.

### Gate
- Extend the ordered bid gate `resolveBidGate` (`src/utils/guestGate.ts`) from
  `signin → membership → photo → proceed` to `signin → membership → photo → **contact** → proceed`.
- The sell flow (`SellView` / guest-write `sell` action) requires contact before `upload`.
- New pure helper `resolveMissingContact(user) → { needsPhone: boolean, needsEmail: boolean }`:
  - `needsPhone` = no non-empty `phoneNumber`/`phone`.
  - `needsEmail` = no non-empty, format-valid `email`.
  - Both false → gate passes. Unit-tested (phone-only user, email-only user, complete user,
    whitespace/malformed values).

### ContactCompletionModal
- Renders ONLY the missing field(s) derived from `resolveMissingContact`.
- **Phone missing (Google user):** phone input → send OTP → verify. Attach to the SAME account
  with `linkWithCredential(PhoneAuthProvider.credential(verificationId, code))` — NOT
  `signInWithPhoneNumber` (which would create/switch to a separate phone account). Reuse the
  existing invisible-reCAPTCHA setup from `LoginView`. On success write `phoneNumber`, `phone`,
  `normalizedPhone` to the user doc.
- **Email missing (phone user):** email input, format-validated client-side, written unverified.
- Bilingual AR/EN copy. Motion per the no-bouncy-spring house rule (smooth ease-out).
- On completion the gate re-resolves and the original action (bid/list) proceeds.

### Backfill posture
No forced migration. Existing incomplete users hit the modal at their next transaction only.

---

## Slice B — Notification delivery layer

### The `notify()` choke point
A single server helper replaces scattered `postToN8n` calls:

```
notify({ uid, event, channels, data })
  1. Look up users/{uid} → { name, phoneNumber, email }.
  2. If channels.inapp: write an in-app doc to `notifications` (bell store).
  3. If channels.whatsapp || channels.email: postToN8n(event, {
       phone, email, name, channels, ...data
     }) — n8n routes to WhatsApp and/or email per `channels`.
```

- `channels` is `{ inapp, whatsapp, email }` booleans, resolved from the policy map by event.
- Idempotency keys preserved where emit sites already pass them (won/payment_due).
- All existing emit sites are refactored to call `notify()` instead of raw `postToN8n`.

### Channel policy map (one source of truth)

| Event | in-app | WhatsApp | email |
|---|:-:|:-:|:-:|
| `auction_won` | ✓ | ✓ | ✓ |
| `payment_due` | ✓ | ✓ | ✓ |
| `payment_reminder` *(NEW)* | ✓ | ✓ | ✓ |
| `below_reserve_offer` (seller) | ✓ | ✓ | ✓ |
| `below_reserve_seller_accepted` (buyer) | ✓ | ✓ | ✓ |
| `below_reserve_declined` *(NEW, buyer)* | ✓ | – | – |
| `outbid` | ✓ | ✓ | – |
| `order_preparing`/`shipped`/`delivered`/`completed`/`refunded` | ✓ | ✓ | ✓ |
| `membership_rejected` | ✓ | ✓ | ✓ |
| `order_payment_rejected` | ✓ | ✓ | ✓ |
| `account_banned` *(NEW)* | ✓ | ✓ | ✓ |
| `ban_lifted` *(NEW)* | ✓ | ✓ | ✓ |
| `seller_ship_nudge`/`buyer_confirm_nudge` | ✓ | ✓ | – |

Pure helper `channelsFor(event) → { inapp, whatsapp, email }` (tested; unknown event defaults to
in-app only, never silently emails).

### New events to wire
- **`account_banned` / `ban_lifted`:** emit from the payment-default enforcer + manual ban/unban
  paths and on **auto-expiry** of a ban (not just manual unban). Include reason + (for bans)
  `blockedUntil`.
- **`below_reserve_declined`:** `declineBelowReserve` notifies the top bidder that the offer
  wasn't accepted (in-app only — soft news, no push spam).
- **`payment_reminder` cron:** a scheduled function scanning unpaid orders inside their payment
  window; sends one reminder at ~50% of the window remaining and a final one ~2h before expiry.
  Idempotent via per-milestone flags on the order (e.g. `remind50Sent`, `remindFinalSent`) so a
  re-run never double-sends. Only unpaid/awaiting-payment orders; skips paid/cancelled.
  Pure helper `dueReminders(order, nowMs) → ['50'|'final']` (tested).

### Copy
Bilingual AR/EN message templates keyed by event, authored in-repo (mirrors `auctionRules.ts`).
These are the source strings n8n uses for WhatsApp/email bodies and the in-app doc uses for its
title/body. Keep the terse house voice.

---

## Deferred (explicitly out of E5)
- **FCM / native push** — dead server paths (no client token registration). Its own future
  effort. WhatsApp + email + in-app cover the need now.
- **Email verification / double-opt-in** — email is written + used unverified.
- **Per-user notification preferences / unsubscribe** — later; the policy map is global for now.

## Testing / rollout
- Pure helpers (`resolveMissingContact`, `channelsFor`, `dueReminders`) unit-tested.
- ContactCompletionModal + the new gate step are customer-facing → **Vercel preview** before merge.
- The money-adjacent surface (payment-reminder cron touches order state flags only, no wallet
  movement) → cross-model review of the functions diff before merge.
- n8n WhatsApp+email templates are MJ's n8n work, out of repo; functions supply `email` + `channels`.
- Functions deploy on merge to main (pipeline healthy since #138).

## Open specifics (assumed unless changed)
- Payment-reminder cadence: 50%-remaining + final 2h-before-expiry.
- Google phone attach via `linkWithCredential` on the signed-in account.
- Ban-lift notice fires on auto-expiry too.
- Build order: Slice A (contact completeness) → Slice B (delivery layer). A gates B's usefulness.
