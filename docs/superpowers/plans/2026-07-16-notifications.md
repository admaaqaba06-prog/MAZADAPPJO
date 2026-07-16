# WhatsApp Notification Pipe (Phase 5) — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** The app's Cloud Functions POST structured events to a configurable n8n webhook on key state changes (you-won, payment-due, outbid, order shipped/delivered). n8n turns them into WhatsApp messages. App side only; the n8n workflows + templates live on the n8n side.

**Architecture:** One fire-and-forget helper `postToN8n(event, payload)` (Node 20 global `fetch`) reads `process.env.N8N_WEBHOOK_URL` and **no-ops if unset** — so this is safe to deploy immediately and does nothing until the URL is configured. Wired into the existing `scheduledAuctionCloser` (you-won + payment-due), `onBidCreated` (outbid), and a NEW `orders/{orderId}` onUpdate trigger (shipped/delivered/completed/refunded). The webhook URL is provided at deploy time from a GitHub secret written into `functions/.env` by the CI workflow.

**Tech Stack:** firebase-functions v1 (Node 20), global `fetch`. No new deps. `functions/` has no test runner → verify via `node --check` + review + a documented manual webhook test.

## Global Constraints
- **Never break a financial path:** every `postToN8n` call is wrapped so a webhook failure only logs, never throws — the closer/bid/escrow logic must be unaffected.
- **No duplicate sends:** you-won/payment-due fire ONLY when the closer actually settles the auction *this run* (not on cron re-runs where it's already `completed`/`ended`), and AFTER the transaction commits (not inside — txns retry).
- **No new deps.** `node --check functions/index.js` must pass. Do not modify `scheduledAuctionCloser`'s settlement logic, escrow, or bid logic beyond adding the post-commit notify calls.
- **Phone field is `phoneNumber`** (may be empty; n8n normalizes). Guard empty — still send the event (n8n decides), but include whatever phone exists.
- **Safe-by-default:** with `N8N_WEBHOOK_URL` unset, the whole pipe is inert. Activation = set the secret (Task 5).

---

### Task 1: `postToN8n` helper (no-op when unconfigured)
**Files:** Modify `functions/index.js` (add helper near the top, after `db` is defined).

- [ ] Add:
```js
// Fire-and-forget notification to the n8n webhook. No-ops if unconfigured.
// NEVER throws — these calls sit inside financial/transaction paths.
async function postToN8n(event, payload) {
  const url = process.env.N8N_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, ...payload, ts: Date.now() }),
    });
  } catch (e) {
    console.warn(`[n8n] ${event} webhook failed:`, e && e.message);
  }
}
```
- [ ] `cd functions && node --check index.js` → passes. Commit `feat(notify): add postToN8n webhook helper (no-op when unconfigured)`.

---

### Task 2: you-won + payment-due (in `scheduledAuctionCloser`)
**Files:** Modify `functions/index.js` (`scheduledAuctionCloser` ~:13, settle path ~:101-177).

- [ ] Inside the per-auction settle: capture notify data in outer vars ONLY on a real settlement. In the transaction's winner branch (`totalBids > 0 && winnerId`, ~:112), after reading `winnerSnap` (~:158), capture:
```js
      // (notify) capture for post-commit webhook; winnerSnap already read here
      notifyData = {
        phone: (winnerSnap.exists ? (winnerSnap.data().phoneNumber || '') : ''),
        winnerId, winnerName, finalPrice, auctionTitle: auctionData.title, auctionId,
      };
```
Declare `let notifyData = null;` before the `runTransaction`, and ensure it's only set on the branch that actually settles (guard already present: the txn early-returns if `status === 'completed' || 'ended'`, so `notifyData` stays null on re-runs).
- [ ] AFTER `await db.runTransaction(...)` resolves for that auction, fire both events if it settled:
```js
      if (notifyData) {
        await postToN8n('auction_won', {
          phone: notifyData.phone, name: notifyData.winnerName,
          auctionId: notifyData.auctionId, auctionTitle: notifyData.auctionTitle,
          amount: notifyData.finalPrice,
        });
        await postToN8n('payment_due', {
          phone: notifyData.phone, name: notifyData.winnerName,
          auctionId: notifyData.auctionId, auctionTitle: notifyData.auctionTitle,
          amount: notifyData.finalPrice,
        });
      }
```
Use `winnerSnap.exists` (property, not `.exists()`). Do NOT change any settlement/order/escrow writes.
- [ ] `node --check` passes. Commit `feat(notify): emit auction_won + payment_due on close`.

---

### Task 3: outbid (in `onBidCreated`)
**Files:** Modify `functions/index.js` (`onBidCreated` ~:250, outbid branch ~:267-293).

- [ ] The previous bidder's user doc is already read (`prevUserData` ~:272-274). Add a notify call in the outbid branch, OUTSIDE the `if (fcmToken)` guard so it fires even without a push token:
```js
        await postToN8n('outbid', {
          phone: (prevUserData && prevUserData.phoneNumber) || '',
          name: (prevUserData && prevUserData.name) || 'Bidder',
          auctionId: context.params.auctionId,
          auctionTitle: (auctionData && auctionData.title) || '',
          amount: bidData.amount,
        });
```
Keep the existing FCM logic intact. `node --check` passes. Commit `feat(notify): emit outbid event`.

---

### Task 4: order status changes (NEW onUpdate trigger)
**Files:** Modify `functions/index.js` (add a new export).

- [ ] Add a trigger that fires when an order's `status` changes to a notify-worthy value:
```js
exports.onOrderStatusChanged = functions.firestore
  .document('orders/{orderId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    if (before.status === after.status) return null; // no status change
    const NOTIFY = {
      preparing_shipment: 'order_preparing',
      shipped: 'order_shipped',
      delivered: 'order_delivered',
      completed: 'order_completed',
      refunded: 'order_refunded',
    };
    const event = NOTIFY[after.status];
    if (!event) return null;
    let phone = '';
    try {
      if (after.buyerId) {
        const u = await db.collection('users').doc(after.buyerId).get();
        phone = (u.exists && u.data().phoneNumber) || '';
      }
    } catch (e) { console.warn('[n8n] order phone lookup failed:', e && e.message); }
    await postToN8n(event, {
      phone, name: after.buyerName || 'Buyer',
      orderId: context.params.orderId, auctionId: after.auctionId || '',
      auctionTitle: after.auctionTitle || '', amount: after.winningBidAmount || 0,
      status: after.status, trackingNumber: after.trackingNumber || '',
    });
    return null;
  });
```
- [ ] `node --check` passes. Commit `feat(notify): emit order status-change events`.

---

### Task 5: activate via config (CI writes functions/.env from a secret)
**Files:** Modify `.github/workflows/firebase-deploy.yml`; add `functions/.env` to `.gitignore` if not already ignored; create `docs/NOTIFICATIONS.md`.

- [ ] In the deploy workflow, BEFORE the `firebase deploy` step, write the URL from a secret so the deployed function has it (empty secret → empty var → helper no-ops):
```yaml
      - name: Configure Functions env (n8n webhook)
        run: echo "N8N_WEBHOOK_URL=${{ secrets.N8N_WEBHOOK_URL }}" > functions/.env
```
- [ ] Ensure `functions/.env` is git-ignored (add `functions/.env` to `.gitignore`).
- [ ] Create `docs/NOTIFICATIONS.md`: how to activate (add repo secret `N8N_WEBHOOK_URL` → next deploy wires it), and the **event payload spec** for whoever builds the n8n side:
  - `auction_won` `{ event, phone, name, auctionId, auctionTitle, amount, ts }`
  - `payment_due` `{ ...same... }`
  - `outbid` `{ event, phone, name, auctionId, auctionTitle, amount, ts }`
  - `order_preparing|order_shipped|order_delivered|order_completed|order_refunded` `{ event, phone, name, orderId, auctionId, auctionTitle, amount, status, trackingNumber, ts }`
- [ ] Commit `feat(notify): wire N8N_WEBHOOK_URL via CI + document event contract`.

---

## Notes for the executor
- Functions have no test runner — verify each task with `node --check functions/index.js` + careful reading; the real end-to-end test is a human setting `N8N_WEBHOOK_URL` to a https://webhook.site URL and triggering events.
- The pipe is INERT until `N8N_WEBHOOK_URL` is set, so all of this is safe to deploy now.
- Line numbers are approximate — read `scheduledAuctionCloser` and `onBidCreated` fully before editing; do not disturb settlement/escrow/bid logic.
- `winnerSnap.exists` is a property (Admin SDK), not a function.
