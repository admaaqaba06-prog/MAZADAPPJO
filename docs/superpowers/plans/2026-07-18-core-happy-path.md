# Core Happy Path v1 (Plan A — money path) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inherited wallet/escrow bidding model with the real Mazad model — 1 JD membership gate, bid freely, pay price + 5% buyer's premium within 24h or be blocked — and surface membership (not wallet) as the app's money surface.

**Architecture:** Server-side: `placeBid` keeps its transaction/anti-snipe/rate-limit skeleton but drops all wallet/escrow reads+writes, gating on `subscriptionStatus === 'active'` (+ non-expired). Settlement writes `buyersPremium`/`totalDue`/`paymentDeadlineAt` onto orders; a new scheduled function marks overdue orders `defaulted` and sets `isBlocked` on the user (existing block mechanism). Client-side: the `'wallet'` route renders the existing (currently unrouted) `SubscriptionView`; auth is phone-only; template/false-claim strings are removed; language defaults to Arabic with a persistent selector.

**Tech Stack:** firebase-functions v1 (Node 20), Firestore, React 19 + Vite + Tailwind v4, Vitest (src only; functions/ has no test runner — verify via `node --check` + grep assertions).

## Global Constraints

- Money story copy (exact): membership = «عضوية مزاد — ١ دينار» / "Mazad membership — 1 JD"; buyer's premium = 5%; seller receives 95%; payment window = 24 hours.
- `postToN8n` calls must never gain the ability to throw; do not modify its contract.
- Fils integer math for all money computation server-side (`Math.round(x * 1000)` pattern, as `placeBid` does today).
- Hide, don't delete: wallet/seller code stays in the repo, just unrouted/hidden.
- Every user-facing string added ships in BOTH Arabic and English.
- After each task: `node --check functions/index.js` (if functions touched) and `npm run build` (if src touched) must pass.
- The existing `system_health` collection is the incident log (`logSystemHealth` pattern: `{type, title, details, createdAt}` + add `source` field for server writes).

---

### Task 1: `placeBid` — membership-only gate, no wallet/escrow

**Files:**
- Modify: `functions/index.js` (placeBid, currently lines ~407–669)

**Interfaces:**
- Produces: `placeBid` result contract unchanged (`{success, message, amount?, finalEndTime?}`); bids subcollection docs unchanged; auction update fields unchanged (incl. `previousBidderId`). Consumed by `LiveStreamView` via `AppContext.placeBid` — no client change needed.

- [ ] **Step 1: Replace the wallet sections of placeBid.** Keep steps 1–2 (user fetch, rate limit, `isBlocked`, subscription check, auction fetch, double-bid idempotency, end-time check) exactly as-is, with ONE change — extend the subscription check (current lines 438–440) to also honor expiry:

```js
      const subExpiry = userData.subscriptionExpiry;
      const subExpiryMs = subExpiry && subExpiry.toMillis ? subExpiry.toMillis() : (typeof subExpiry === 'number' ? subExpiry : null);
      if (userData.subscriptionStatus !== 'active' || (subExpiryMs && subExpiryMs <= Date.now())) {
        return { success: false, message: 'MEMBERSHIP_REQUIRED' };
      }
```

Then DELETE entirely: section 3 (wallet read, lines ~471–485), section 4 (both escrow queries incl. `existingEscrowDoc`/`prevEscrowDoc`/`prevWalletSnap` blocks, ~495–535), the `incrementalDeltaFils` computation + insufficient-funds check (~539–544), section 6 (bidder wallet update, ~551–561), section 8 (escrow create/update, ~576–599), and section 9 (outbid refund, ~601–623). KEEP: `const outbidUserId = auctionData.currentBidderId;` (needed by the auction update), min-increment check, rate-limit `lastBidAt` update, bid doc write, section 10 (anti-snipe + auction update incl. `previousBidderId: outbidUserId || null`), section 11 (chat doc), and the return.

- [ ] **Step 2: Verify:**

Run: `node --check functions/index.js` → `functions/index.js` OK (no output, exit 0)
Run: `awk '/exports.placeBid/,/^}\);/' functions/index.js | grep -c "wallets\|escrows"` → Expected: `0`
Run: `awk '/exports.placeBid/,/^}\);/' functions/index.js | grep -c "MEMBERSHIP_REQUIRED"` → Expected: `1`

- [ ] **Step 3: Commit**

```bash
git add functions/index.js
git commit -m "feat(bid): membership-only gate — remove wallet/escrow from placeBid"
```

---

### Task 2: Order money fields — buyer's premium, total due, payment deadline

**Files:**
- Modify: `functions/index.js` — the closer's order payload (search anchor: `status: "waiting_payment"`, first occurrence, inside `scheduledAuctionCloser`), the repair path's payload (second occurrence, inside `repairEndedAuctionOrder`), and both `payment_due` postToN8n calls.

**Interfaces:**
- Produces on `orders` docs: `buyersPremium: number` (JOD), `totalDue: number` (JOD), `paymentDeadlineAt: Timestamp`. Consumed by Task 3 enforcer and later UI.

- [ ] **Step 1:** In BOTH order payloads (closer + repair), immediately after `winningBidAmount: finalPrice,` insert:

```js
                  buyersPremium: Math.round(Math.round(finalPrice * 1000) * 0.05) / 1000,
                  totalDue: (Math.round(finalPrice * 1000) + Math.round(Math.round(finalPrice * 1000) * 0.05)) / 1000,
                  paymentDeadlineAt: admin.firestore.Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000),
```

- [ ] **Step 2:** Update all four `payment_due`/`auction_won` postToN8n payloads (two in the closer's post-commit block, two in repair): where they send `amount: notifyData.finalPrice` (or `amount: finalPrice`), add after it:

```js
              buyersPremium: Math.round(Math.round(notifyData.finalPrice * 1000) * 0.05) / 1000,
              totalDue: (Math.round(notifyData.finalPrice * 1000) + Math.round(Math.round(notifyData.finalPrice * 1000) * 0.05)) / 1000,
              paymentHours: 24,
```

(in the repair path use `finalPrice` instead of `notifyData.finalPrice`).

- [ ] **Step 3: Verify:** `node --check functions/index.js` OK; `grep -c "buyersPremium" functions/index.js` → Expected ≥ `6`.

- [ ] **Step 4: Commit** — `git commit -am "feat(orders): 5% buyers premium, totalDue, 24h paymentDeadlineAt"`

---

### Task 3: `paymentDefaultEnforcer` — 24h default → block

**Files:**
- Modify: `functions/index.js` (new export, add directly after `scheduledAuctionOpener`)

**Interfaces:**
- Consumes: `orders.paymentDeadlineAt` (Task 2). Produces: order `status: 'defaulted'`, user `isBlocked: true` (existing placeBid check enforces it), `system_health` incident.

- [ ] **Step 1: Add the function:**

```js
/**
 * paymentDefaultEnforcer
 * Every 30 minutes: any order still waiting_payment past its paymentDeadlineAt
 * is marked defaulted and the buyer is blocked (isBlocked) pending admin review.
 * Re-run / runner-up offer is a manual admin decision in v1.
 */
exports.paymentDefaultEnforcer = functions.pubsub
  .schedule('every 30 minutes')
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();
    try {
      const snap = await db.collection('orders')
        .where('status', '==', 'waiting_payment')
        .where('paymentDeadlineAt', '<=', now)
        .get();
      if (snap.empty) return null;
      for (const doc of snap.docs) {
        const o = doc.data();
        const batch = db.batch();
        batch.update(doc.ref, { status: 'defaulted', defaultedAt: admin.firestore.FieldValue.serverTimestamp() });
        if (o.buyerId) {
          batch.set(db.collection('users').doc(o.buyerId), { isBlocked: true, blockedReason: 'payment_default' }, { merge: true });
        }
        batch.set(db.collection('system_health').doc(), {
          type: 'payment_fail',
          title: 'Order defaulted (24h unpaid)',
          details: `Order ${doc.id} (${o.auctionTitle || ''}) buyer ${o.buyerName || o.buyerId} — ${o.totalDue || o.winningBidAmount} JOD. Buyer blocked; decide re-run/runner-up.`,
          source: 'paymentDefaultEnforcer',
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        await batch.commit();
        console.log(`[paymentDefaultEnforcer] defaulted order ${doc.id}, blocked ${o.buyerId}`);
      }
    } catch (err) {
      console.error('[paymentDefaultEnforcer]', err);
    }
    return null;
  });
```

- [ ] **Step 2: Verify:** `node --check functions/index.js` OK; `grep -c "paymentDefaultEnforcer" functions/index.js` → ≥ `2`.
- [ ] **Step 3: Commit** — `git commit -am "feat(orders): 24h payment-default enforcer (defaulted + block)"`
- [ ] **Step 4:** Add `'defaulted'` to the admin order filter union in `src/components/AdminDashboardView.tsx` (search `'all' | 'waiting_payment'` — extend the type union and the filter pill list where the other statuses are rendered, both AR/EN label «متخلف عن الدفع» / "Defaulted"). Verify `npm run build` passes. Commit `feat(admin): defaulted order filter`.

---

### Task 4: Membership replaces wallet as the money surface

**Files:**
- Modify: `src/App.tsx:30` (the `'wallet'` case), `src/components/DesktopFrame.tsx` (nav labels + balance chip)

- [ ] **Step 1:** In `src/App.tsx`, change the wallet route to render the (already-imported) SubscriptionView:

```tsx
    case 'wallet':
      return <SubscriptionView />;
```

Delete the now-unused `WalletView` lazy import line (`src/App.tsx:11`).

- [ ] **Step 2:** In `src/components/DesktopFrame.tsx`: every nav label for the wallet route (search `Wallet & Profile` and the shorter `Wallet` labels near `setActiveView('wallet')` at lines ~182/293/339) becomes «العضوية» / "Membership" (respect each site's existing `isAr ? … : …` pattern; if a site lacks the pattern, use the same conditional the sibling labels use). The header balance chip (search for the element rendering the JOD balance next to the globe icon) becomes a membership chip: when `currentUser?.subscriptionStatus === 'active'` show «عضو ✓» / "Member ✓", else «انضم بـ ١ د.أ» / "Join — 1 JD"; clicking it does `setActiveView('wallet')`.
- [ ] **Step 3:** Verify `npm run build` passes; manually confirm in `npm run preview` that the nav shows Membership and the route renders the subscription tiers.
- [ ] **Step 4: Commit** — `git commit -am "feat(membership): route membership as the money surface, retire wallet UI"`

---

### Task 5: Phone-only auth

**Files:**
- Modify: `src/components/LoginView.tsx`

- [ ] **Step 1:** Locate the Google/Facebook buttons (`grep -n "Continue with Google\|Continue with Facebook" src/components/LoginView.tsx`) and the email/username + password form below the `OR` divider. Wrap each of these blocks in `{false && (…)}` is NOT acceptable — instead remove the JSX blocks and leave the handlers/imports untouched (hide-don't-delete applies to *code paths*, not rendered UI; unused handlers are fine). The phone flow becomes the only visible method, both on Sign up and Log in tabs. Keep the «العربية» toggle.
- [ ] **Step 2:** `npm run build` passes; preview shows phone-only card.
- [ ] **Step 3: Commit** — `git commit -am "feat(auth): phone-only entry (socials/email hidden)"`

---

### Task 6: Cut-list string sweep (Whatnot, CBJ, badges, pills, V3 PILOT)

**Files:**
- Modify: `src/components/WalletView.tsx`, `src/components/MobileLiveAuctionLayout.tsx`, `src/utils/translations.ts`, `src/components/DesktopFrame.tsx`, `src/components/ReelsDesktopRightPanel.tsx`, `src/components/DiscoveryFeedView.tsx`

- [ ] **Step 1:** For each anchor, apply the replacement (AR analog wherever the file's translation pair exists):
  - `WHATNOT WALLET` / `Whatnot` (WalletView, MobileLiveAuctionLayout) → `MAZAD WALLET` (file is unrouted but must not carry the brand).
  - Central-Bank claim (translations.ts + WalletView; `grep -n "Central Bank"`) → EN: `Funds are transferred via CliQ to Mazzado's account at Capital Bank and held until your order completes.` AR: «تُحوَّل الأموال عبر كليك إلى حساب مزادو في كابيتال بنك وتبقى محفوظة حتى اكتمال طلبك.»
  - `24/7 … Finance Desk` → EN: `Our Amman support team is available daily 9:00–23:00.` AR: «فريق الدعم في عمّان متاح يومياً من ٩ صباحاً حتى ١١ مساءً.»
  - `VERIFIED MERCHANT` (DesktopFrame, ReelsDesktopRightPanel) → render nothing for regular users: replace the badge element with `null` (delete the JSX element).
  - `V3 PILOT` (DesktopFrame) → delete the element.
  - Filter pills in DiscoveryFeedView (`grep -n "Soccer" …`) → replace the pill array contents with the real categories: `['سيارات','عقارات','هواتف','ساعات','إلكترونيات']` (or the file's existing category source if one exists nearby — prefer reusing it).
- [ ] **Step 2:** Verify: `grep -rn "WHATNOT\|Central Bank\|V3 PILOT\|Soccer" src | wc -l` → `0`; `npm run build` passes.
- [ ] **Step 3: Commit** — `git commit -am "fix(brand): remove template branding, false claims, fake badges"`

---

### Task 7: Bilingual, Arabic-default, persistent across landing⇄app

**Files:**
- Modify: `src/context/AppContext.tsx:423-425`, `src/landing/LandingView.tsx`

- [ ] **Step 1:** AppContext default flips to Arabic:

```ts
  const [language, setLanguageState] = useState<'en' | 'ar'>(() => {
    return (localStorage.getItem('mazad_language') as 'en' | 'ar') || 'ar';
  });
```

- [ ] **Step 2:** LandingView: initialize its `lang` state from the same key (`localStorage.getItem('mazad_language') === 'en' ? 'en' : 'ar'`) and persist on toggle (in the existing `setLang` click handlers, add `localStorage.setItem('mazad_language', next)`). The landing's existing header selector already satisfies "selector on the landing"; the app's globe icon satisfies "throughout" — verify the globe toggle writes the same key (grep `mazad_language` in AppContext `setLanguage`; if it doesn't persist, add the `localStorage.setItem` there).
- [ ] **Step 3:** Verify: `npm run build`; preview: landing loads AR by default, switch to EN, click Enter → app is EN; switch app to AR via globe, reload `/` → landing is AR.
- [ ] **Step 4: Commit** — `git commit -am "feat(i18n): Arabic default, persistent language across landing and app"`

---

### Task 8: Premium disclosure at bid time + membership upsell copy

**Files:**
- Modify: `src/components/LiveStreamView.tsx`, `src/components/SubscriptionPromptModal.tsx`

- [ ] **Step 1:** In LiveStreamView, under the main bid button (locate via `grep -n "زايد\|Bid now\|minNextBid" src/components/LiveStreamView.tsx` and place adjacent to the button's amount rendering), add a persistent one-line disclosure using the component's existing language conditional and next-bid amount variable (`nextBid` below = that variable's actual name at the site):

```tsx
<p className="text-[11px] text-gray-400 text-center mt-1">
  {isAr
    ? `المجموع عند الفوز: ${(Math.round(nextBid * 1000) * 1.05 / 1000).toLocaleString()} د.أ (شامل عمولة المشتري ٥٪)`
    : `Total if you win: ${(Math.round(nextBid * 1000) * 1.05 / 1000).toLocaleString()} JOD (incl. 5% buyer's premium)`}
</p>
```

- [ ] **Step 2:** In SubscriptionPromptModal, ensure the headline copy states the gate plainly — EN: `Membership required to bid — join for 1 JD`, AR: «المزايدة تتطلب عضوية — انضم بـ ١ دينار فقط» — and its CTA calls `setActiveView('wallet')` (the membership route) then closes the modal. Also map the `MEMBERSHIP_REQUIRED` server message (Task 1) in `AppContext.placeBid`'s error handling (`grep -n "Active subscription pass required" src/context/AppContext.tsx` — replace the string match trigger with `MEMBERSHIP_REQUIRED`) so it opens this modal.
- [ ] **Step 3:** `npm run build` + existing Vitest suite: `npx vitest run` → all pass.
- [ ] **Step 4: Commit** — `git commit -am "feat(bid): 5% premium disclosure + membership upsell wiring"`

---

### Task 9: Whole-branch verification

- [ ] `node --check functions/index.js` OK; `npm run build` OK; `npx vitest run` all pass.
- [ ] Grep assertions: `awk '/exports.placeBid/,/^}\);/' functions/index.js | grep -c "wallets"` → 0; `grep -rc "WHATNOT" src` → 0; `grep -c "paymentDefaultEnforcer\|buyersPremium" functions/index.js` → ≥ 8 total.
- [ ] Update `docs/ROADMAP.md`: mark the money-story items shipped; note ratings (Plan B) and landing pass (Plan C) as next.
- [ ] Commit docs, push branch, PR titled `feat: Core Happy Path v1 — membership model replaces wallet/escrow`.
