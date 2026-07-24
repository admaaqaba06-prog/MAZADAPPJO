# Membership pill-only nav + member page + non-revoking upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the redundant Membership nav tab (pill becomes the sole entry), give active members a real membership dashboard (tier/expiry/benefits/upgrade) instead of the pricing form, and fix the money-path bug where upgrading drops an active member to `pending` (revoking their ability to bid).

**Architecture:** The one money-path decision — whether a subscription request downgrades the user's status — is extracted into a pure, unit-tested helper (`functions/subscriptionRequestStatus.js`) and consumed by the `requestSubscription` callable (same pure-core/thin-wrapper pattern as `settlement.js`/`orderPaymentVerify.js`). The member dashboard is a new conditional branch in the existing `SubscriptionView`; the nav change is two deletions in `DesktopFrame.tsx`. Non-member, pending, and payment-form flows are untouched.

**Tech Stack:** React 19 + Vite + TS (`strict` off), Firebase Cloud Functions CommonJS, Vitest (`src/**/*.test.ts(x)` + `functions/**/*.test.js`), Tailwind, `isAr` bilingual pattern.

## Global Constraints

- **Money-path discipline:** the status-downgrade decision is server-authoritative and lives in a tested pure helper. The client never writes subscription-grant/status fields (unchanged — Firestore rules already block that). `approveSubscription`/the grant path is NOT touched.
- **Non-active flows unchanged:** a `none`/`expired`/`rejected`/`pending`/`undefined` user sees EXACTLY today's behavior (pricing form or pending screen; request still flips them to `pending`). Only an already-`active` user is treated differently (kept active during upgrade review).
- **Preview-gated:** this is customer-facing UI. Build/tsc/tests passing is necessary but NOT sufficient — MJ approves the look on a Vercel preview before merge (the controller pushes + gets the preview; no in-session browser check can reach this authed page).
- **Bilingual + RTL** via `isAr`, matching `SubscriptionView`/`DesktopFrame` conventions.
- **Anchor edits by TEXT, not line numbers.**
- **Deploy caveat:** `tsc --noEmit` currently 0 errors — keep it that way.
- **Workflow:** Fable SDD (Opus fallback if capped, per standing instruction); one commit per task; TDD for the pure helper.

---

## File Structure

**New:**
- `functions/subscriptionRequestStatus.js` + `.test.js` — pure `userStatusForSubscriptionRequest(currentStatus)`.

**Modified:**
- `functions/index.js` — `requestSubscription` uses the helper for the user-doc status write.
- `src/components/SubscriptionView.tsx` — new active-member dashboard branch.
- `src/components/DesktopFrame.tsx` — remove the Membership tab (desktop + mobile).

---

## Task 1: Pure status-decision helper (TDD)

**Files:** Create `functions/subscriptionRequestStatus.js`; Test `functions/subscriptionRequestStatus.test.js`.

**Interfaces — Produces (CommonJS):**
- `userStatusForSubscriptionRequest(currentStatus: string | undefined | null): 'active' | 'pending'` — returns `'active'` (keep-unchanged) ONLY when `currentStatus === 'active'` (an active member upgrading must not lose bidding); returns `'pending'` for everything else (`none`/`expired`/`rejected`/`pending`/`undefined`/`null`) — today's behavior for first-time and re-submitting non-active users.

- [ ] **Step 1: Write the failing test** — `functions/subscriptionRequestStatus.test.js`

```js
import { describe, it, expect } from 'vitest';
const { userStatusForSubscriptionRequest } = require('./subscriptionRequestStatus');

describe('userStatusForSubscriptionRequest', () => {
  it('keeps an already-active member ACTIVE (upgrade must not revoke bidding)', () => {
    expect(userStatusForSubscriptionRequest('active')).toBe('active');
  });
  it('sets pending for a first-time / non-active user', () => {
    for (const s of ['none', 'expired', 'rejected', 'pending', undefined, null, '']) {
      expect(userStatusForSubscriptionRequest(s)).toBe('pending');
    }
  });
});
```

- [ ] **Step 2:** `npx vitest run functions/subscriptionRequestStatus.test.js` → FAIL (module missing).
- [ ] **Step 3: implement** — `functions/subscriptionRequestStatus.js`

```js
/**
 * Decide what to write to the USER doc's subscriptionStatus when a
 * subscription request is created.
 *
 * The request doc itself is always 'pending' (it needs admin review). But an
 * already-ACTIVE member submitting an upgrade must NOT be downgraded to
 * 'pending' on their user doc — bidding is gated on subscriptionStatus ===
 * 'active', so downgrading would revoke the very membership they're paying to
 * upgrade. Keep them active; the grant (new tier + fresh term) applies on
 * approval. Everyone else keeps today's behavior (flip to pending).
 */
function userStatusForSubscriptionRequest(currentStatus) {
  return currentStatus === 'active' ? 'active' : 'pending';
}

module.exports = { userStatusForSubscriptionRequest };
```

- [ ] **Step 4:** focused test → PASS. **Step 5:** full suite + `node --check functions/subscriptionRequestStatus.js`. **Step 6: commit** `feat(membership): pure helper — active members keep status on upgrade request`

---

## Task 2: Wire the helper into requestSubscription (server)

**Files:** Modify `functions/index.js`.

**Interfaces — Consumes:** Task 1's helper.
**Interfaces — Produces:** `requestSubscription`'s user-doc write uses `userStatusForSubscriptionRequest(userData.subscriptionStatus)` for the `subscriptionStatus` field; the request doc is unchanged (`status:'pending'`, `subscriptionStatus:'pending'` on the REQUEST doc stay).

- [ ] **Step 1: require the module** — anchor: the require line `const { stampDisputeResolution: stampDisputeResolutionTxn } = require('./disputeResolution');` (the last of the pure-module requires near the top). Add directly after it:

```js
const { userStatusForSubscriptionRequest } = require('./subscriptionRequestStatus');
```

- [ ] **Step 2: use it in the user-doc write** — in `exports.requestSubscription`, find the batch write to the USER doc (anchor: the `batch.set(userRef, {` block whose first field is `subscriptionStatus: 'pending',` and includes `subscriptionPlan: resolved.tier,`). Change ONLY the `subscriptionStatus` line:

from:
```js
    // 2. Set user status to pending on user document
    batch.set(userRef, {
      subscriptionStatus: 'pending',
      subscriptionPlan: resolved.tier,
```
to:
```js
    // 2. Set user status on the user doc. An already-active member upgrading
    // stays 'active' (bidding is gated on it) — only non-active users flip to
    // pending. The REQUEST doc is always 'pending' (needs review) regardless.
    batch.set(userRef, {
      subscriptionStatus: userStatusForSubscriptionRequest(userData.subscriptionStatus),
      subscriptionPlan: resolved.tier,
```

Do NOT change the `newRequest` object's `status: 'pending'` / `subscriptionStatus: 'pending'` (those are on the REQUEST doc — correct as-is). Do NOT change any other field in the user-doc write.

- [ ] **Step 3:** `node --check functions/index.js`; full `npx vitest run`. **Step 4: commit** `feat(membership): requestSubscription keeps active members active on upgrade`

---

## Task 3: Active-member dashboard in SubscriptionView

**Files:** Modify `src/components/SubscriptionView.tsx`.

**Interfaces — Consumes:** `currentUser.subscriptionStatus/subscriptionTier/subscriptionPlan/subscriptionExpiry`; existing `plans` array (tier id/name/price/period); `SUBSCRIPTION_TIERS`; `subscribeUser`; `isAr`/`language`; the existing payment-form state (`selectedPlan`/`setSelectedPlan`, `submitted`).

**Interfaces — Produces:** a new branch at the top of the main body conditional — when `currentUser?.subscriptionStatus === 'active'`, render the member dashboard instead of the pricing form; otherwise fall through to today's `isPendingReview ? ... : <pricing form>`.

- [ ] **Step 1: add tier-order + benefits helpers** near the `plans` array (top of component):

```tsx
  // Tier rank for "show only higher tiers" upgrade logic.
  const TIER_RANK: Record<string, number> = { monthly: 0, semiannual: 1, annual: 2 };
  const currentTierId = (currentUser?.subscriptionTier || currentUser?.subscriptionPlan || 'monthly') as string;
  const currentRank = TIER_RANK[currentTierId] ?? 0;
  const isTopTier = currentRank >= 2;

  const memberBenefits = isAr
    ? [
        'زايد مجاناً — لا رسوم على كل مزايدة',
        'ادفع فقط عند الفوز (+٥٪ عمولة المشتري)',
        'الدفع عند الاستلام: متاح لمشتركي VIP',
        'حماية المشتري: مزاد يحتفظ بمبلغك حتى تأكيد الاستلام',
      ]
    : [
        'Bid freely — no per-bid fees',
        'Pay only when you win (+5% buyer premium)',
        'VIP pay-on-delivery',
        'Buyer protection — Mazad holds your payment until you confirm receipt',
      ];

  const formatExpiry = (v?: string | number | null): string | null => {
    if (!v) return null;
    const ms = typeof v === 'number' ? v : Date.parse(v);
    if (!ms || Number.isNaN(ms)) return null;
    return new Date(ms).toLocaleDateString(isAr ? 'ar-JO' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };
```

- [ ] **Step 2: add an "upgrade in progress (this session)" flag** — the existing `submitted` state already flips true after `subscribeUser` succeeds. For an active member it will NOT trigger `isPendingReview` (they stay active), so reuse `submitted` as the in-session "upgrade under review" signal on the dashboard. No new state needed.

- [ ] **Step 3: add the `upgrading` state** — near the other `useState` declarations (by `const [submitted, setSubmitted] = useState(false);`), add:

```tsx
  const [upgrading, setUpgrading] = useState(false);
```

This lets an active member drop INTO the payment form for a chosen higher tier: the dashboard shows while `!upgrading`; clicking an upgrade tier sets `selectedPlan` + `upgrading=true`, which falls through to the existing pricing form (pre-targeted at that tier). On a successful `subscribeUser`, `submitted` flips true and — because Task 2 keeps the member `active` — they are NOT thrown to the pending screen.

- [ ] **Step 4: render the dashboard branch** — find the main body conditional (anchor: `{isPendingReview ? (`). Gate the active-member dashboard on `!upgrading` so the upgrade CTA can fall through to the pricing form.

Change:
```tsx
        {isPendingReview ? (
```
to:
```tsx
        {currentUser?.subscriptionStatus === 'active' && !upgrading ? (
          /* ACTIVE MEMBER DASHBOARD — replaces the pricing form for paid members. */
          <div className="space-y-6" id="member-dashboard">
            {/* Your membership */}
            <div className="text-center space-y-2">
              <div className="mx-auto w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center">
                <ShieldCheck className="w-6 h-6 text-emerald-600" />
              </div>
              <h1 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight">
                {isAr ? 'عضويتك فعّالة' : "You're a member"}
              </h1>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <span className="text-xs font-black uppercase tracking-wider text-gray-500 font-mono">
                  {plans.find(p => p.id === currentTierId)?.name || currentTierId}
                </span>
                <span className="text-[10px] font-black bg-emerald-600 text-white px-2 py-0.5 rounded-full">
                  {isAr ? 'فعّال' : 'ACTIVE'}
                </span>
              </div>
              {formatExpiry(currentUser?.subscriptionExpiry) && (
                <p className="text-xs text-gray-500">
                  {isAr ? 'يتجدد / ينتهي في ' : 'Renews / expires '}{formatExpiry(currentUser?.subscriptionExpiry)}
                </p>
              )}
            </div>

            {/* Upgrade-under-review (this session only) */}
            {submitted && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-center" id="upgrade-under-review">
                <p className="text-xs font-bold text-amber-700">
                  {isAr ? '⏳ ترقيتك قيد المراجعة — تبقى عضويتك فعّالة حتى الاعتماد.' : '⏳ Your upgrade is under review — your membership stays active until it\'s approved.'}
                </p>
              </div>
            )}

            {/* Member benefits */}
            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
              <h2 className="text-[11px] font-black uppercase tracking-wider text-gray-400 mb-3">
                {isAr ? 'مزايا العضوية' : 'Member benefits'}
              </h2>
              <ul className="space-y-2">
                {memberBenefits.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs font-medium text-gray-700">
                    <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Upgrade options (only tiers above the current one) */}
            {isTopTier ? (
              <div className="text-center text-xs text-gray-400 font-semibold py-2">
                {isAr ? '👑 أنت على أعلى باقة.' : "👑 You're on the top plan."}
              </div>
            ) : (
              <div>
                <h2 className="text-[11px] font-black uppercase tracking-wider text-gray-400 mb-3">
                  {isAr ? 'ترقية العضوية' : 'Upgrade'}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {plans.filter(p => (TIER_RANK[p.id] ?? 0) > currentRank).map(p => (
                    <button
                      key={p.id}
                      onClick={() => { setSelectedPlan(p); setUpgrading(true); }}
                      className={`relative rounded-2xl border-2 p-4 text-start hover:bg-gray-50/50 transition-all cursor-pointer ${p.color}`}
                    >
                      <h3 className="font-black text-xs uppercase tracking-wider text-gray-400 font-mono">{p.name}</h3>
                      <div className="flex items-baseline mt-1">
                        <span className="text-2xl font-black text-gray-900 font-mono">{p.price}</span>
                        <span className="text-[10px] text-gray-500 font-mono font-bold uppercase ms-1">{p.period}</span>
                      </div>
                      <span className="mt-2 inline-block text-[10px] font-black text-[#E85D04]">
                        {isAr ? 'ترقية ←' : 'Upgrade →'}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-gray-400 text-center mt-3">
                  {isAr ? 'الترقية = باقة جديدة كاملة بالسعر الأعلى؛ تبقى عضويتك فعّالة أثناء المراجعة.' : 'Upgrade = a fresh full term at the higher tier; your membership stays active during review.'}
                </p>
              </div>
            )}
          </div>
        ) : isPendingReview ? (
```

The rest of the existing conditional (`isPendingReview` body, then the `: (` pricing-form body) stays byte-identical. Because the dashboard is gated on `!upgrading`, clicking an upgrade tier (`setUpgrading(true)`) falls straight through to the existing pricing form with `selectedPlan` pre-set — no other change to the form needed; `handlePay`/`subscribeUser` run as they do today.

- [ ] **Step 5: verify** — `npm run build && npx vitest run && npx tsc --noEmit` (0 errors). `ShieldCheck` is already imported (confirmed). **Step 6: commit** `feat(membership): active-member dashboard (tier, expiry, benefits, upgrade)`

---

## Task 4: Remove the Membership tab from both navs

**Files:** Modify `src/components/DesktopFrame.tsx`.

**Interfaces:** None — two JSX deletions. The pill (which routes to `wallet`) is the sole remaining entry; it is NOT touched.

- [ ] **Step 1: remove the desktop top-nav Membership tab** — anchor: find the desktop `<button onClick={() => setActiveView('wallet')}` whose label is `{isAr ? 'العضوية' : 'Membership'}` and whose icon is `<WalletIcon className="w-4 h-4 shrink-0 stroke-[2]" />`. Delete the entire `<button>…</button>` block (the desktop one — inside the `#global-top-navigation` nav).

- [ ] **Step 2: remove the mobile bottom-nav Membership tab** — anchor: the OTHER `<button onClick={() => setActiveView('wallet')}` whose icon is `<WalletIcon className="w-5 h-5" />` and label `{isAr ? 'العضوية' : 'Membership'}` (the mobile one — `text-[9px]` label, inside `#mobile-nav-bar`). Delete that entire `<button>…</button>` block.

Verify after both: `grep -n "'العضوية'\|Membership" src/components/DesktopFrame.tsx` returns NOTHING (the pill uses `Member ✓`/`Join`, not the word "Membership"). If it still matches, a tab wasn't fully removed.

- [ ] **Step 3: check for now-unused imports** — if `WalletIcon` is no longer used anywhere in `DesktopFrame.tsx` after both deletions (`grep -n "WalletIcon" src/components/DesktopFrame.tsx`), remove it from the lucide import line to keep tsc/lint clean. If it's still used (e.g. the pill), leave it.

- [ ] **Step 4:** `npm run build && npx vitest run && npx tsc --noEmit` (0 errors). **Step 5: commit** `feat(membership): remove redundant Membership nav tab (pill is sole entry)`

---

## Post-implementation

- **Manual preview (REQUIRED, MJ):** active member sees the dashboard (tier/expiry/benefits/upgrade) not the pricing form; top-tier member sees no upgrade CTA; non-member + pending users unchanged; nav has no Membership tab, pill works both breakpoints.
- **Money-path smoke (MJ/colleague, real/sim data):** active member submits an upgrade → can still bid (status stays active), request shows in admin Verify & Approve, approval applies new tier + fresh expiry.
- Finish via superpowers:finishing-a-development-branch → PR → **hold for MJ's preview approval** → merge.

## Self-Review

**Spec coverage:** pill-only nav (Task 4) ✓; active-member dashboard w/ tier+expiry+benefits+upgrade (Task 3) ✓; non-revoking upgrade money-path fix via tested pure helper (Tasks 1–2) ✓; non-active/pending flows untouched (Tasks 2–3 leave those branches byte-identical) ✓; grant path untouched (no task edits approveSubscription) ✓; preview-gated (post-impl) ✓.

**Placeholder scan:** no TBD. Task 3 Step 3 resolves its own "how does the upgrade CTA reach payment" question inline with the `upgrading` state approach — a disclosed decision, not a placeholder.

**Type consistency:** `userStatusForSubscriptionRequest(currentStatus) → 'active'|'pending'` matches between Tasks 1 and 2. Tier ids `monthly|semiannual|annual` consistent with the existing `plans` array + `SUBSCRIPTION_TIERS` across Task 3. `submitted`/`selectedPlan`/`setSelectedPlan` are existing state reused, not redeclared.
