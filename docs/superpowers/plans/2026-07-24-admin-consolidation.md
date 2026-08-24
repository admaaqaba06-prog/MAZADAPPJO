# Admin Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the 3166-line `AdminDashboardView.tsx` from 13 flat tabs into 6 primary job surfaces (Home/Verify/Fulfillment/Disputes/Payouts/Launch) + 3 reference tabs (Orders/Members/System), absorbing duplicate/dead tabs — a pure UI reorganization with zero money-logic change.

**Architecture:** Extract each relocated tab body into its own behavior-preserving `src/components/admin/*Section.tsx` component (props-in, handlers-from-parent), add a new needs-attention `AdminHome`, and reduce `AdminDashboardView` to a shell (data wiring from `useApp()` + restructured nav + section routing). New pure logic (attention counts, tab-id migration) is unit-tested; the existing 457-test suite is the regression guard that money handlers are untouched.

**Tech Stack:** React 19 + TypeScript, Tailwind, Vitest. Existing `useApp()`/`useAuctions()` context, `React.Suspense` lazy sections.

## Global Constraints

- **Reuse every money handler/callable VERBATIM** — sections receive them as props from the shell and call them identically. NO change to any transition, escrow/settlement, callable, or `firestore.rules`. Handlers in play: `approveListing`, `rejectListing`, `verifySeller`, `banUser`, `unbanUser`, `releaseEscrow`, `refundEscrow`, `deleteAuction`, `repairEndedAuctionOrder`, `repairStuckEscrowsForEndedAuction`, `approveWithdrawal`, `rejectWithdrawal`, `updateMaintenanceMode`, `updateFeatureFlag`, `resetOnboarding`, `setBids`, `setActiveView`, plus the locally-defined `approveSubscription`, `rejectSubscription`, `approveUserDirect`, `rejectUserDirect`, `handleVerifyOrderPayment`, `handleRejectOrderPayment`, `handleSendFulfillmentNudge`, `handleFulfillmentReleaseEscrow`, `handleResolveDispute`.
- **No new Firestore listeners / data shapes / collections.** Reuse existing derived lists: `realOrders`, `realAuctions`, `subscriptionRequests`, `pendingWithdrawals`/`allWithdrawals`, `escrows`, `usersTotalCount`, and existing count derivations (`pendingOrderPaymentsCount`, `overdueFulfillmentCount`, `openDisputesCount`, pending listings, `pendingByUsersOnly`).
- **Simulated data stays excluded** everywhere (`realOrders`/`realAuctions` convention). The Simulator itself keeps its inline `isAdminUser(currentUser)` gate.
- **Bilingual** (ar + en) for every new/moved string via the existing `isAr ? 'ع' : 'en'` pattern and `translations[language]`.
- **Preserve tab persistence** (`sessionStorage` key `mazad_admin_tab`) and MIGRATE legacy stored ids so a returning admin never lands on a removed tab.
- **No role-gating** (generalist model). Every tab visible to every admin.
- After EVERY task: `npx tsc --noEmit` (0 errors) and `npm test` (baseline 457, must not regress). This is the front-line ops console — surgical, behavior-preserving edits only.

**Key anchors (current file):** `ADMIN_TABS` array `:339-353`; `ADMIN_TAB_DEFAULT='metrics'` `:355`; `readStoredAdminTab` `:358-367`; `useApp()` destructure `:370-401`; `activeTab`/`selectTab` `:424-433`; derived counts `:484-542`; nav render loop `:1146-1185` + drop-builder button `:1186-1191`; section invocations `:1200-1257`. Tab bodies: orders `:1262-1466`, metrics `:1471-1630`, payments `:1635-1748`, listings `:1753-2109`, users `:2114-2198`, subscriptions `:2203-2347`, sessions `:2352-2418`, withdrawals `:2424-2566`, health `:2571-3120`, simulator `:3125-3135`. Existing sections: `admin/VerifyApproveSection.tsx` (234), `admin/FulfillmentSection.tsx` (313), `admin/DisputesSection.tsx` (270), `admin/PaymentVerifyCard.tsx` (203).

**Section extraction recipe (used by Tasks 4-8 — follow verbatim):**
1. Create `src/components/admin/<Name>Section.tsx` exporting a component whose props are exactly the data + `on*` handlers + `isAr` that the moved JSX references (mirror the existing `VerifyApproveSection` prop style).
2. MOVE the tab's JSX out of `AdminDashboardView` into the new component **unchanged** — same markup, classes, bilingual ternaries, and handler call sites; only swap closed-over identifiers for the equivalent props.
3. In the shell, render `<NameSection …props />` inside the `activeTab === '<id>'` branch, wrapped in the same `React.Suspense` fallback pattern as the existing job sections; lazy-import it (`const NameSection = React.lazy(() => import('./admin/NameSection'))`).
4. Move any state/helpers used ONLY by that body into the section; leave shared state in the shell and pass as props.
5. Verify: `tsc` 0, full suite green, and the tab renders + its actions still fire (reader confirms call sites unchanged).

---

### Task 1: Pure nav helpers — attention counts + legacy-tab migration

**Files:**
- Create: `src/utils/adminNav.ts`
- Test: `src/utils/adminNav.test.ts`

**Interfaces:**
- Produces: `type AdminTabId = 'home'|'verify'|'fulfillment'|'disputes'|'payouts'|'launch'|'orders'|'members'|'system'`; `const ADMIN_PRIMARY_TABS: AdminTabId[]`; `const ADMIN_REFERENCE_TABS: AdminTabId[]`; `interface AttentionInput { pendingVerify:number; overdueFulfillment:number; openDisputes:number; pendingPayouts:number; pendingListings:number }`; `interface AttentionCounts extends AttentionInput { total:number }`; `computeAttentionCounts(input:AttentionInput):AttentionCounts`; `migrateStoredAdminTab(stored:string|null):AdminTabId`.

- [ ] **Step 1: Write the failing test** — `src/utils/adminNav.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeAttentionCounts, migrateStoredAdminTab, ADMIN_PRIMARY_TABS, ADMIN_REFERENCE_TABS } from './adminNav';

describe('computeAttentionCounts', () => {
  it('sums a total across all job queues', () => {
    const c = computeAttentionCounts({ pendingVerify: 3, overdueFulfillment: 2, openDisputes: 1, pendingPayouts: 4, pendingListings: 5 });
    expect(c.total).toBe(15);
    expect(c.pendingVerify).toBe(3);
    expect(c.pendingPayouts).toBe(4);
  });
  it('is zero when all queues are empty', () => {
    const c = computeAttentionCounts({ pendingVerify: 0, overdueFulfillment: 0, openDisputes: 0, pendingPayouts: 0, pendingListings: 0 });
    expect(c.total).toBe(0);
  });
});

describe('migrateStoredAdminTab', () => {
  it('maps removed legacy ids to their new home', () => {
    expect(migrateStoredAdminTab('metrics')).toBe('home');
    expect(migrateStoredAdminTab('payments')).toBe('verify');
    expect(migrateStoredAdminTab('subscriptions')).toBe('verify');
    expect(migrateStoredAdminTab('listings')).toBe('launch');
    expect(migrateStoredAdminTab('withdrawals')).toBe('payouts');
    expect(migrateStoredAdminTab('sessions')).toBe('system');
    expect(migrateStoredAdminTab('simulator')).toBe('system');
    expect(migrateStoredAdminTab('users')).toBe('members');
  });
  it('passes through still-valid ids', () => {
    expect(migrateStoredAdminTab('verify')).toBe('verify');
    expect(migrateStoredAdminTab('home')).toBe('home');
    expect(migrateStoredAdminTab('orders')).toBe('orders');
  });
  it('falls back to home on null/unknown', () => {
    expect(migrateStoredAdminTab(null)).toBe('home');
    expect(migrateStoredAdminTab('garbage')).toBe('home');
  });
});

describe('tab groups', () => {
  it('primary then reference cover the nav set with no overlap', () => {
    expect(ADMIN_PRIMARY_TABS).toEqual(['home','verify','fulfillment','disputes','payouts','launch']);
    expect(ADMIN_REFERENCE_TABS).toEqual(['orders','members','system']);
    expect(ADMIN_PRIMARY_TABS.some(t => ADMIN_REFERENCE_TABS.includes(t))).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `cd /Users/mj/code/mazzado/.claude/worktrees/feat+admin-consolidation && npx vitest run src/utils/adminNav.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** — `src/utils/adminNav.ts`:

```ts
export type AdminTabId =
  | 'home' | 'verify' | 'fulfillment' | 'disputes' | 'payouts' | 'launch'
  | 'orders' | 'members' | 'system';

export const ADMIN_PRIMARY_TABS: AdminTabId[] = ['home','verify','fulfillment','disputes','payouts','launch'];
export const ADMIN_REFERENCE_TABS: AdminTabId[] = ['orders','members','system'];
export const ADMIN_TAB_DEFAULT: AdminTabId = 'home';

export interface AttentionInput {
  pendingVerify: number;
  overdueFulfillment: number;
  openDisputes: number;
  pendingPayouts: number;
  pendingListings: number;
}
export interface AttentionCounts extends AttentionInput { total: number; }

export function computeAttentionCounts(input: AttentionInput): AttentionCounts {
  const total = input.pendingVerify + input.overdueFulfillment + input.openDisputes
    + input.pendingPayouts + input.pendingListings;
  return { ...input, total };
}

const LEGACY_TAB_MAP: Record<string, AdminTabId> = {
  metrics: 'home',
  payments: 'verify',
  subscriptions: 'verify',
  listings: 'launch',
  withdrawals: 'payouts',
  sessions: 'system',
  simulator: 'system',
  users: 'members',
};
const VALID: AdminTabId[] = [...ADMIN_PRIMARY_TABS, ...ADMIN_REFERENCE_TABS];

export function migrateStoredAdminTab(stored: string | null): AdminTabId {
  if (!stored) return ADMIN_TAB_DEFAULT;
  if ((VALID as string[]).includes(stored)) return stored as AdminTabId;
  return LEGACY_TAB_MAP[stored] ?? ADMIN_TAB_DEFAULT;
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/utils/adminNav.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git add src/utils/adminNav.ts src/utils/adminNav.test.ts && git commit -m "feat(admin): pure nav helpers — attention counts + legacy tab migration"`

---

### Task 2: `AdminHome` needs-attention landing

**Files:**
- Create: `src/components/admin/AdminHome.tsx`
- Modify: `src/components/AdminDashboardView.tsx` (add `home` branch; do NOT yet remove metrics)

**Interfaces:**
- Consumes: `computeAttentionCounts`, `AttentionInput` (Task 1).
- Props: `AdminHome({ isAr, counts, metrics, onSelectTab }: { isAr:boolean; counts: import('../../utils/adminNav').AttentionInput; metrics: { escrowHeld:number; liveAuctions:number; members:number }; onSelectTab:(t: import('../../utils/adminNav').AdminTabId)=>void })`.

- [ ] **Step 1** — Create `AdminHome.tsx`: a scannable landing with (a) an attention list — one row per non-zero job queue (Verify payments/members, Fulfillment overdue, Disputes open, Payouts pending, Listings awaiting approval), each showing its count and calling `onSelectTab('<id>')`; when `computeAttentionCounts(counts).total === 0` show an "all clear" state; and (b) 3 metric cards (escrow held, live auctions, members). Bilingual, Tailwind matching the existing admin cards (`bg-white rounded-3xl border border-gray-200 p-5`). Use `computeAttentionCounts` for the total/all-clear decision. Each attention row is a `<button onClick={() => onSelectTab(id)}>`.

```tsx
import React from 'react';
import { computeAttentionCounts, type AttentionInput, type AdminTabId } from '../../utils/adminNav';

interface Props {
  isAr: boolean;
  counts: AttentionInput;
  metrics: { escrowHeld: number; liveAuctions: number; members: number };
  onSelectTab: (t: AdminTabId) => void;
}

export const AdminHome: React.FC<Props> = ({ isAr, counts, metrics, onSelectTab }) => {
  const c = computeAttentionCounts(counts);
  const rows: { id: AdminTabId; n: number; ar: string; en: string }[] = [
    { id: 'verify', n: counts.pendingVerify, ar: 'إيصالات بانتظار التحقق', en: 'Payments & members to verify' },
    { id: 'fulfillment', n: counts.overdueFulfillment, ar: 'طلبات متأخرة للمتابعة', en: 'Fulfillments overdue' },
    { id: 'disputes', n: counts.openDisputes, ar: 'نزاعات مفتوحة', en: 'Disputes open' },
    { id: 'payouts', n: counts.pendingPayouts, ar: 'سحوبات بانتظار الموافقة', en: 'Payouts pending' },
    { id: 'launch', n: counts.pendingListings, ar: 'مزادات بانتظار الاعتماد', en: 'Listings awaiting approval' },
  ];
  const active = rows.filter(r => r.n > 0);
  return (
    <div className="space-y-5">
      <div className="bg-white rounded-3xl border border-gray-200 p-5">
        <h2 className="text-sm font-black text-gray-950 mb-3">{isAr ? 'بحاجة إلى انتباهك' : 'Needs your attention'}</h2>
        {c.total === 0 ? (
          <p className="text-xs font-semibold text-gray-400">{isAr ? 'كل شيء تحت السيطرة — لا يوجد ما ينتظر.' : 'All clear — nothing waiting.'}</p>
        ) : (
          <div className="space-y-2">
            {active.map(r => (
              <button key={r.id} type="button" onClick={() => onSelectTab(r.id)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border border-gray-200 hover:border-orange-300 hover:bg-orange-50/40 transition text-start">
                <span className="text-xs font-bold text-gray-800">{isAr ? r.ar : r.en}</span>
                <span className="min-w-6 h-6 px-2 inline-flex items-center justify-center rounded-full bg-[#FF6B00] text-white text-xs font-black">{r.n}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { ar: 'المبالغ المحتجزة', en: 'Escrow held', v: metrics.escrowHeld, suffix: isAr ? ' د.أ' : ' JOD' },
          { ar: 'مزادات مباشرة', en: 'Live auctions', v: metrics.liveAuctions, suffix: '' },
          { ar: 'الأعضاء', en: 'Members', v: metrics.members, suffix: '' },
        ].map((m, i) => (
          <div key={i} className="bg-white rounded-3xl border border-gray-200 p-5">
            <span className="block text-xs font-semibold text-gray-400">{isAr ? m.ar : m.en}</span>
            <span dir="ltr" className="block mt-1 text-2xl font-black text-gray-950">{m.v.toLocaleString('en-US')}{m.suffix}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminHome;
```

- [ ] **Step 2** — In `AdminDashboardView.tsx`: lazy-import `AdminHome` (`const AdminHome = React.lazy(() => import('./admin/AdminHome'))`). Add `'home'` to the `ADMIN_TABS` array (front). Add an `activeTab === 'home'` render branch (Suspense-wrapped, matching the job-section pattern) that renders `<AdminHome isAr={isAr} counts={{ pendingVerify: subscriptionRequests.length + pendingOrderPaymentsCount, overdueFulfillment: overdueFulfillmentCount, openDisputes: openDisputesCount, pendingPayouts: allWithdrawals.filter(w => w.status === 'pending_review').length, pendingListings: <the pending-listings count used by listings tab> }} metrics={{ escrowHeld: <existing escrow-held total from metrics tab>, liveAuctions: <realAuctions live count>, members: usersTotalCount }} onSelectTab={selectTab} />`. READ the metrics tab body (`:1471-1630`) to reuse the EXACT expressions already computing escrow-held / live-auctions counts — do not recompute differently. Do NOT change the default yet.
- [ ] **Step 3** — `npx tsc --noEmit` (0) and `npm test` (457). 
- [ ] **Step 4: Commit** — `git add src/components/admin/AdminHome.tsx src/components/AdminDashboardView.tsx && git commit -m "feat(admin): needs-attention Home landing (behind new 'home' tab)"`

---

### Task 3: Make Home the default + nav grouping (primary / reference) + legacy migration

**Files:** Modify `src/components/AdminDashboardView.tsx`.

- [ ] **Step 1** — Replace `readStoredAdminTab` so it delegates to `migrateStoredAdminTab` (Task 1): `const stored = sessionStorage.getItem(ADMIN_TAB_STORAGE_KEY); return migrateStoredAdminTab(stored);`. Change `ADMIN_TAB_DEFAULT` usage to `'home'` (import the constant from `adminNav` or set locally). Import `AdminTabId`, `ADMIN_PRIMARY_TABS`, `ADMIN_REFERENCE_TABS`, `migrateStoredAdminTab` from `../utils/adminNav` and type `activeTab`/`selectTab` as `AdminTabId`.
- [ ] **Step 2** — Restructure the nav render (`:1146-1185`) into TWO groups: iterate `ADMIN_PRIMARY_TABS` then a thin visual divider (e.g. `<span className="mx-1 h-5 w-px bg-gray-200 shrink-0" />`) then `ADMIN_REFERENCE_TABS`. Drive each button's label + badge from a single `TAB_META: Record<AdminTabId, { ar:string; en:string }>` map (define it near the nav; move the existing Arabic/English labels into it, add `home`='الرئيسية'/'HOME', `payouts`='المدفوعات'/'PAYOUTS', `launch`='إطلاق المزادات'/'LAUNCH', `members`='الأعضاء'/'MEMBERS', `system`='النظام'/'SYSTEM', `orders`='الطلبات'/'ORDERS'). Keep badge counts only where they exist today (`verify`, `fulfillment`, `disputes`, `payouts`) via the existing count vars. Keep the drop-builder button OUT of this loop for now (Task 6 moves it into Launch). The `metrics`/`payments`/`subscriptions`/`sessions`/`simulator`/`withdrawals`/`listings`/`users` ids are NOT in these group arrays, so their nav buttons disappear now — but their render branches still exist (removed/absorbed in Tasks 4-8). That's fine: unreachable branches, no dead UI shown.
- [ ] **Step 3** — `tsc` 0, `npm test` 457. Manually confirm the nav now shows Home first (default) + the two groups, no metrics/sessions/simulator buttons.
- [ ] **Step 4: Commit** — `git add src/components/AdminDashboardView.tsx && git commit -m "feat(admin): default to Home, primary/reference nav groups, legacy tab migration"`

---

### Task 4: Consolidate Verify (absorb CliQ payments + subscriptions failsafe)

**Files:** Modify `src/components/admin/VerifyApproveSection.tsx`, `src/components/AdminDashboardView.tsx`.

- [ ] **Step 1** — READ the current `payments` tab body (`:1635-1748`: `pendingCliQDrops` list + `releaseEscrow`/`refundEscrow` + receipt view) and the `subscriptions` tab's `pendingByUsersOnly` failsafe sub-list (`:2203-2347`, the `approveUserDirect`/`rejectUserDirect` part). READ `VerifyApproveSection.tsx` to see its current two-queue layout.
- [ ] **Step 2** — Extend `VerifyApproveSection` props with: `cliqDrops` (the `pendingCliQDrops` array), `onReleaseCliq` (=`releaseEscrow`), `onRefundCliq` (=`refundEscrow`), `pendingByUsersOnly`, `onApproveUserDirect` (=`approveUserDirect`), `onRejectUserDirect` (=`rejectUserDirect`), plus the receipt-src helpers already used. Add two new labeled sub-sections inside the section: **"CliQ wallet top-ups"** (moved from the payments body, markup unchanged) and, under memberships, the **"pending users — no receipt" failsafe** (moved from the subscriptions body, markup unchanged). Reuse `PaymentVerifyCard`/existing receipt UI where the payments body already does.
- [ ] **Step 3** — In the shell, pass the new props to `<VerifyApproveSection>` (`:1208-1216`). DELETE the standalone `payments` render branch (`:1635-1748`) and the standalone `subscriptions` render branch (`:2203-2347`) — their content now lives in Verify. Keep the `subscriptionRequests` listener and `approveSubscription`/`rejectSubscription`/`approveUserDirect`/`rejectUserDirect`/`pendingCliQDrops`/`pendingByUsersOnly` derivations in the shell (now consumed via props). (`payments`/`subscriptions` were already removed from the nav in Task 3.)
- [ ] **Step 4** — `tsc` 0, `npm test` 457. Confirm Verify now renders three receipt types + failsafe and each approve/reject/release/refund handler is wired identically.
- [ ] **Step 5: Commit** — `git add src/components/admin/VerifyApproveSection.tsx src/components/AdminDashboardView.tsx && git commit -m "feat(admin): fold CliQ top-ups + subs failsafe into Verify"`

---

### Task 5: Payouts (extract withdrawals → PayoutsSection)

**Files:** Create `src/components/admin/PayoutsSection.tsx`; modify `src/components/AdminDashboardView.tsx`.

- [ ] **Step 1** — Apply the **Section extraction recipe** to the `withdrawals` body (`:2424-2566`). Props: `{ isAr, withdrawals: allWithdrawals, onApprove: approveWithdrawal, onReject: rejectWithdrawal }` plus any reject-reason state used only here (`rejectingId`/`rejectionReason` — if used solely by withdrawals, move into the section; if shared with another still-inline body, keep in shell and pass down). Render under `activeTab === 'payouts'`.
- [ ] **Step 2** — `tsc` 0, `npm test` 457. Approve/reject a payout renders/wires unchanged.
- [ ] **Step 3: Commit** — `git add src/components/admin/PayoutsSection.tsx src/components/AdminDashboardView.tsx && git commit -m "feat(admin): extract Payouts (withdrawals) section"`

---

### Task 6: Launch (extract listings → LaunchSection + create-drop CTA)

**Files:** Create `src/components/admin/LaunchSection.tsx`; modify `src/components/AdminDashboardView.tsx`.

- [ ] **Step 1** — Apply the extraction recipe to the `listings` body (`:1753-2109`: three sub-lists — pending approval → `approveListing`/`rejectListing`; completed + repair tools → `repairEndedAuctionOrder`/`repairStuckEscrowsForEndedAuction` + `AuctionEscrowDiagnosticPanel`; master directory → `deleteAuction`). Props = `isAr` + the auctions-derived lists + those handlers + `repairResults`/`isProcessingAction` state if used only here. Also pass `onCreateDrop: () => setActiveView('auction-drop-builder')`.
- [ ] **Step 2** — At the TOP of LaunchSection render a prominent **"Create auction drop"** button (bilingual) calling `onCreateDrop`. Render `<LaunchSection>` under `activeTab === 'launch'`. Remove the standalone drop-builder button from the nav row (`:1186-1191`) — it now lives inside Launch.
- [ ] **Step 3** — `tsc` 0, `npm test` 457. Listings actions unchanged; create-drop opens `auction-drop-builder`.
- [ ] **Step 4: Commit** — `git add src/components/admin/LaunchSection.tsx src/components/AdminDashboardView.tsx && git commit -m "feat(admin): Launch surface (listings mgmt + create-drop CTA)"`

---

### Task 7: Reference — extract Orders ledger + Members

**Files:** Create `src/components/admin/OrdersLedgerSection.tsx`, `src/components/admin/MembersSection.tsx`; modify `src/components/AdminDashboardView.tsx`.

- [ ] **Step 1** — Extract the `orders` body (`:1262-1466`: filter bar + list + `setAdminSelectedOrderId` → `OrderDetailsView` pane trigger). Props: `isAr`, `orders`/`filteredOrders`, `realOrders` (for stat chips), `adminOrderFilter`/`setAdminOrderFilter`, `onOpenOrder: setAdminSelectedOrderId`. The `OrderDetailsView` full-pane (`:1103-1114`) stays in the shell (it overlays regardless of tab); the section only triggers it. Render under `activeTab === 'orders'`.
- [ ] **Step 2** — Extract the `users` body (`:2114-2198`) → `MembersSection` with props `{ isAr, users, onVerifySeller: verifySeller, onBan: banUser, onUnban: unbanUser }`. Render under `activeTab === 'members'`.
- [ ] **Step 3** — `tsc` 0, `npm test` 457.
- [ ] **Step 4: Commit** — `git add src/components/admin/OrdersLedgerSection.tsx src/components/admin/MembersSection.tsx src/components/AdminDashboardView.tsx && git commit -m "feat(admin): extract Orders ledger + Members reference sections"`

---

### Task 8: System (merge health + sessions + simulator; quarantine dev tools)

**Files:** Create `src/components/admin/SystemSection.tsx`; modify `src/components/AdminDashboardView.tsx`.

- [ ] **Step 1** — Create `SystemSection` with three labeled zones. READ the `health` (`:2571-3120`), `sessions` (`:2352-2418`), and `simulator` (`:3125-3135`) bodies. Move markup unchanged:
  - **Operations:** maintenance toggle+message (`updateMaintenanceMode`), the 5 feature-flag toggles (`updateFeatureFlag`), the 5 health status cards, the live system-health log stream+filter (`systemHealthLogs`/`logSystemHealth`).
  - **Monitoring:** the Active Sessions table (`users.filter(u => u.sessionId)`), read-only, moved from the `sessions` body.
  - **Developer (quarantined — clearly labeled danger zone):** the 🧪 Simulator (`SimulatorPanel`, keep the inline `isAdminUser(currentUser)` gate), `resetOnboarding`, and the reactivate-all/reset-all-auctions utilities (`setBids` etc.). REMOVE the fake "backup snapshot" button (it only writes a `localStorage` timestamp — delete it and its handler/label; note removal in the report).
  - Props: `isAr` + `maintenanceMode`, `featureFlags`, `updateMaintenanceMode`, `updateFeatureFlag`, `systemHealthLogs`, `logSystemHealth`, `users`, `resetOnboarding`, `setBids`, `currentUser`, plus the derived health signals (`stuckAuctions`/`stuckOrders`/`settlementFresh`) or recompute-in-section if they were inline to health.
- [ ] **Step 2** — Render `<SystemSection>` under `activeTab === 'system'`. DELETE the standalone `health`, `sessions`, `simulator` render branches from the shell.
- [ ] **Step 3** — `tsc` 0, `npm test` 457. Maintenance/flags/log/sessions/simulator all render + function; no fake backup.
- [ ] **Step 4: Commit** — `git add src/components/admin/SystemSection.tsx src/components/AdminDashboardView.tsx && git commit -m "feat(admin): System section (ops + monitoring + quarantined dev tools)"`

---

### Task 9: Remove the metrics tab + dead code; final shell sweep

**Files:** Modify `src/components/AdminDashboardView.tsx`.

- [ ] **Step 1** — DELETE the standalone `metrics` render branch (`:1471-1630`) — its escrow/live/members figures now live in `AdminHome`; keep `ConversionFunnelCard` ONLY if you relocate it into `AdminHome` (optional; if not relocating, drop it from this view). Remove the dead diagnostic `useEffect` that only `console.log`s pending counts (`:826-837`). Remove the now-unused `readStoredAdminTab`'s old local `ADMIN_TABS`/`ADMIN_TAB_DEFAULT` if fully superseded by `adminNav` exports.
- [ ] **Step 2** — Grep the file for any orphaned state/handlers no longer referenced after all extractions (e.g. helpers used only by removed bodies); remove only those with zero remaining references (confirm via grep). Do NOT remove anything still consumed by a section via props.
- [ ] **Step 3** — `tsc` 0, `npm test` 457. Confirm every nav tab (home/verify/fulfillment/disputes/payouts/launch/orders/members/system) renders a real section and no removed id is reachable.
- [ ] **Step 4: Commit** — `git add src/components/AdminDashboardView.tsx && git commit -m "chore(admin): remove metrics tab + dead code after consolidation"`

---

## Self-Review

**Spec coverage:** Home (T2/T3) ✓; Verify absorbs CliQ + subs failsafe (T4) ✓; Fulfillment/Disputes untouched ✓; Payouts primary (T5) ✓; Launch = listings + create-drop (T6) ✓; Reference Orders/Members (T7) ✓; System = health+sessions+simulator, dev quarantined, fake backup removed (T8) ✓; metrics folded + dead code (T9) ✓; legacy tab migration (T1/T3) ✓; nav primary/reference groups (T3) ✓. Every removed/absorbed tab from the spec is accounted for.

**Placeholder scan:** New logic (T1 helpers, T2 AdminHome) is complete code. Extraction tasks (T4-T9) are behavior-preserving MOVES against exact line anchors following one explicit recipe — the JSX to move lives in the file; tasks specify boundaries, the prop contract, the call-site change, and verification. A few props reference values the implementer must read from the named line ranges (e.g. the exact escrow-held expression, pending-listings count) — these are pointed to precisely and must be reused verbatim, not reinvented.

**Type consistency:** `AdminTabId` and the tab-id string set are identical across `adminNav.ts`, the migration map, the nav groups, and every `activeTab === '<id>'` branch. Section prop names mirror the existing `VerifyApproveSection` style (`isAr` + data + `on*`).

**Ordering safety:** T3 removes legacy nav buttons before T4-T8 remove their render branches — the interim has unreachable-but-present branches (harmless), never a nav button pointing at a deleted branch. Each task keeps the full suite green.

**Preview gate:** After T9 + whole-branch review (+ cross-model), STOP. Deploy preview; MJ reviews in both languages and "feels out" placement. No merge until approved.
