# E2 — Ban Ladder (graduated, auto-expiring) Design

Date: 2026-07-26
Status: Approved policy (roadmap + confirmed): 1st non-payment (after the 24h window
lapses) = 48h cooldown → 2nd = 3-month suspension → fraud/manipulation = permanent
(admin only). Replaces today's indefinite block.

## Current state
- `paymentDefaultEnforcer` (every 30 min): orders `waiting_payment` past
  `paymentDeadlineAt` → marked `defaulted` + buyer set `{ isBlocked:true,
  blockedReason:'payment_default' }` **indefinitely** (functions/index.js:488).
- `placeBid` rejects if `userData.isBlocked` (index.js:864) — no expiry notion.
- No `strikeCount` / `blockedUntil` on the user.

## Design

### 1. Pure ladder logic (`functions/banLadder.js` + tests)
- Constants: `FIRST_COOLDOWN_MS = 48*3600*1000`, `REPEAT_SUSPENSION_MS = 90*24*3600*1000`.
- `resolvePaymentDefaultBan(newStrikeCount, nowMs)` →
  `{ blockedUntil, blockedReason }`:
  - `newStrikeCount <= 1` → `blockedUntil = nowMs + FIRST_COOLDOWN_MS`, `'payment_default'`.
  - `newStrikeCount >= 2` → `nowMs + REPEAT_SUSPENSION_MS`, `'payment_default_repeat'`.
  - (Permanent is admin/fraud only — NOT produced here; a permanent ban has
    `isBlocked:true` + `blockedUntil` null.)
- `isEffectivelyBlocked(user, nowMs)` → `!!user.isBlocked && (blockedUntil==null || toMs(blockedUntil) > nowMs)`.
  Handles Firestore Timestamp | number | null. Expired (`blockedUntil <= now`) = NOT blocked.
- Unit-tested: 1st→48h, 2nd→90d, permanent (null blockedUntil) stays blocked, expiry boundary.

### 2. Enforcer — apply the ladder + strike count
On each defaulted order, per buyer (dedupe buyers within a run; a buyer with N newly
defaulted orders advances by N strikes computed once):
- Read the buyer's current `strikeCount` (default 0); `newStrike = current + defaultsThisRun`.
- `{ blockedUntil, blockedReason } = resolvePaymentDefaultBan(newStrike, now)`.
- Set on the user: `{ isBlocked:true, blockedUntil, blockedReason, strikeCount:newStrike }`.
- Strike only lands on the `waiting_payment → deadline lapsed → defaulted` transition
  (already how the enforcer fires) — matches "strike only after the 24h window lapses."

### 3. Auto-expiry
- **placeBid gate** (index.js:864): reject only when `isEffectivelyBlocked(userData, Date.now())`
  — an expired cooldown no longer blocks bidding.
- **Enforcer, start of run**: also query `users where isBlocked==true && blockedUntil <= now`
  → clear `{ isBlocked:false, blockedUntil: delete }` (keep `strikeCount`) so the UI/ban
  banner reflects the lift without waiting for a bid attempt.
- Never auto-clear a permanent ban (`blockedUntil == null`).

### 4. Client — ban modal + live sync
- Extend the existing `currentUser` onSnapshot merge (AppContext ~1324) to carry
  `blockedUntil`, `blockedReason`, `strikeCount` — so ban/unban/expiry reflects live
  WITHOUT a refresh (the deferred "live session-sync").
- The client bid gate + a **ban modal**: when an effectively-blocked user taps bid (or on
  entering a bid surface while blocked), show a modal — reason + "restricted until
  <date/time>" (or "permanently" when blockedUntil null) — instead of the terse toast.
- Reuse `isEffectivelyBlocked` on the client (share via a small util or mirror it).

### 5. Admin
- Members list already shows Active/Banned (E-seller work). Surface the reason + expiry
  in the admin ban view where feasible (nice-to-have; not blocking).

## Testing
- `banLadder.js` unit tests (ladder durations, effectively-blocked incl. Timestamp/number/null, expiry boundary).
- Existing suite green; `node -c functions/index.js`; lint + build clean.

## Rollout / safety
- Money-adjacent (placeBid gate + user blocking) → TDD the pure logic + **cross-model
  adversarial review** of the enforcer + gate change before merge.
- Customer-facing (ban modal) → Vercel preview.
- functions + (no rules change expected) deploy on merge.

## Out of scope
- Fraud/manipulation permanent-ban tooling stays admin-driven (existing ban button).
- Returns (E6), ratings (E7).
