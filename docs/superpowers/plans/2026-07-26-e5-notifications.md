# E5 — Notifications & Contact Completeness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guarantee every transacting user has a verified phone + an email, and route every notification event to in-app + WhatsApp + email via one policy-driven `notify()` choke point.

**Architecture:** Slice A adds a `contact` step to the existing ordered transaction gates plus a `ContactCompletionModal` that captures the missing channel (OTP-verifying an added phone via `linkWithCredential`). Slice B introduces a single server `notify()` helper backed by pure `channelsFor`/`copyFor`/`dueReminders` helpers, refactors all existing `postToN8n` emit sites through it (adding an `email` field), and wires three previously-silent events: ban apply/lift, below-reserve decline, and a payment-reminder cron.

**Tech Stack:** React 19 + Vite + TS + Tailwind v4, Firebase (Auth phone-link, Firestore, Functions CommonJS, pubsub schedule), Vitest, Motion.

## Global Constraints

- Money-path functions must NEVER throw from a notification call — `postToN8n`/`notify` swallow all errors and log only (existing rule; preserve it).
- Pure helpers only in `functions/notify.js` — no `firebase`/`firebase-admin` requires (so root Vitest loads them; same rule that broke the deploy in #138).
- Test globs (`vitest.config.ts`): `src/**/*.test.ts(x)` and `functions/**/*.test.js`. Co-locate tests next to source.
- User-doc contact fields are `phoneNumber` (canonical) + `phone` (mirror) + `normalizedPhone` (digits only) + `email`. No `whatsapp` field — WhatsApp reuses `phoneNumber`.
- Arabic-first copy (the app + existing FCM/n8n strings are Arabic-primary); bilingual where a UI label pairs AR/EN.
- No bouncy springs on the modal — smooth ease-out (house motion rule).
- Isolated worktree `/tmp/mazzado-e5`, branch `feat/e5-notifications` (already created off origin/main; spec already committed).

---

## Slice A — Contact completeness

### Task A1: `resolveMissingContact` + `isContactComplete` pure helpers

**Files:**
- Modify: `src/utils/guestGate.ts` (append)
- Test: `src/utils/guestGate.test.ts` (append)

**Interfaces:**
- Produces: `resolveMissingContact(user: ContactUser | null | undefined): { needsPhone: boolean; needsEmail: boolean }`, `isContactComplete(user): boolean`, and types `ContactUser`, `MissingContact`. Consumed by A2 (gate) and A3 (modal).

- [ ] **Step 1: Write the failing test** — append to `src/utils/guestGate.test.ts`:

```ts
import { resolveMissingContact, isContactComplete } from './guestGate';

describe('resolveMissingContact', () => {
  it('phone-OTP user (email empty) needs email only', () => {
    expect(resolveMissingContact({ phoneNumber: '+962790000000', email: '' }))
      .toEqual({ needsPhone: false, needsEmail: true });
  });
  it('Google user (no phone) needs phone only', () => {
    expect(resolveMissingContact({ phoneNumber: '', email: 'a@b.com' }))
      .toEqual({ needsPhone: true, needsEmail: false });
  });
  it('complete user needs nothing', () => {
    expect(resolveMissingContact({ phoneNumber: '+962790000000', email: 'a@b.com' }))
      .toEqual({ needsPhone: false, needsEmail: false });
  });
  it('falls back to phone mirror field', () => {
    expect(resolveMissingContact({ phone: '+962790000000', email: 'a@b.com' }).needsPhone).toBe(false);
  });
  it('treats whitespace + malformed email as missing', () => {
    expect(resolveMissingContact({ phoneNumber: '   ', email: 'not-an-email' }))
      .toEqual({ needsPhone: true, needsEmail: true });
  });
  it('null user needs both', () => {
    expect(resolveMissingContact(null)).toEqual({ needsPhone: true, needsEmail: true });
  });
  it('isContactComplete is true only when nothing missing', () => {
    expect(isContactComplete({ phoneNumber: '+962790000000', email: 'a@b.com' })).toBe(true);
    expect(isContactComplete({ phoneNumber: '', email: 'a@b.com' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `cd /tmp/mazzado-e5 && npx vitest run src/utils/guestGate.test.ts`. Expected: FAIL ("resolveMissingContact is not a function").

- [ ] **Step 3: Write minimal implementation** — append to `src/utils/guestGate.ts`:

```ts
export interface ContactUser {
  phoneNumber?: string;
  phone?: string;
  email?: string;
}
export interface MissingContact {
  needsPhone: boolean;
  needsEmail: boolean;
}

// Deliberately loose email check: block only obviously-broken input (no @, no
// dot-suffix). Email is UNVERIFIED in E5, so this just catches typos/blanks.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function resolveMissingContact(user: ContactUser | null | undefined): MissingContact {
  const phone = ((user?.phoneNumber || user?.phone || '') as string).trim();
  const email = ((user?.email || '') as string).trim();
  return {
    needsPhone: phone.length === 0,
    needsEmail: !EMAIL_RE.test(email),
  };
}

export function isContactComplete(user: ContactUser | null | undefined): boolean {
  const m = resolveMissingContact(user);
  return !m.needsPhone && !m.needsEmail;
}
```

- [ ] **Step 4: Run test to verify it passes** — Run: `cd /tmp/mazzado-e5 && npx vitest run src/utils/guestGate.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit** — `git add src/utils/guestGate.ts src/utils/guestGate.test.ts && git commit -m "feat(contact): resolveMissingContact/isContactComplete helpers"`

---

### Task A2: add `contact` step to the ordered bid gate

**Files:**
- Modify: `src/utils/guestGate.ts` (`BidGateDecision`, `BidGateArgs`, `resolveBidGate`)
- Test: `src/utils/guestGate.test.ts` (append)

**Interfaces:**
- Consumes: nothing new.
- Produces: `BidGateDecision` now includes `'contact'`; `BidGateArgs` gains `contactComplete: boolean`. Order: `signin → membership → photo → contact → proceed`. Consumed by the bid-flow caller (Task A4).

- [ ] **Step 1: Write the failing test** — append:

```ts
import { resolveBidGate } from './guestGate';

describe('resolveBidGate — contact step', () => {
  const base = { isAuthenticated: true, isMember: true, hasPhoto: true, contactComplete: true };
  it('member with photo but incomplete contact -> contact', () => {
    expect(resolveBidGate({ ...base, contactComplete: false })).toBe('contact');
  });
  it('complete member -> proceed', () => {
    expect(resolveBidGate(base)).toBe('proceed');
  });
  it('photo still precedes contact', () => {
    expect(resolveBidGate({ ...base, hasPhoto: false, contactComplete: false })).toBe('photo');
  });
  it('guest still routes to signin regardless of contact', () => {
    expect(resolveBidGate({ ...base, isAuthenticated: false, contactComplete: false })).toBe('signin');
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npx vitest run src/utils/guestGate.test.ts`. Expected: FAIL (type error / `contact` never returned).

- [ ] **Step 3: Write minimal implementation** — edit the three declarations in `src/utils/guestGate.ts`:

```ts
export type BidGateDecision = 'signin' | 'membership' | 'photo' | 'contact' | 'proceed';

export interface BidGateArgs {
  isAuthenticated: boolean;
  isMember: boolean;
  hasPhoto: boolean;
  /** resolveMissingContact(user) shows nothing missing (verified phone + email). */
  contactComplete: boolean;
}

export function resolveBidGate(args: BidGateArgs): BidGateDecision {
  const { isAuthenticated, isMember, hasPhoto, contactComplete } = args;
  if (!isAuthenticated) return 'signin';
  if (!isMember) return 'membership';
  if (!hasPhoto) return 'photo';
  if (!contactComplete) return 'contact';
  return 'proceed';
}
```

- [ ] **Step 4: Run test to verify it passes** — Run: `npx vitest run src/utils/guestGate.test.ts`. Expected: PASS. Then `npx tsc --noEmit` to surface every existing `resolveBidGate(` caller now missing `contactComplete` — note them for Task A4.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(contact): add contact step to resolveBidGate"`

---

### Task A3: `ContactCompletionModal` component

**Files:**
- Create: `src/components/ContactCompletionModal.tsx`
- Modify: `src/context/AppContext.tsx` (add a `linkPhoneToAccount` + `saveEmail` action; expose a `contactModalOpen` state)

**Interfaces:**
- Consumes: `resolveMissingContact` (A1); existing invisible-reCAPTCHA setup from `LoginView.tsx`; `currentUser`, `db` from AppContext.
- Produces: `<ContactCompletionModal open onClose onComplete />`; AppContext actions `linkPhoneToAccount(phone, code, verificationId)` and `saveEmail(email)`.

**Key logic — phone must ATTACH to the current account, not replace it:**

```ts
// In AppContext, alongside the existing phone-login helpers:
import { PhoneAuthProvider, linkWithCredential } from 'firebase/auth';

// Step 1 (send code): reuse the existing invisible reCAPTCHA verifier + provider.
const linkPhoneSendCode = async (e164Phone: string): Promise<string> => {
  const provider = new PhoneAuthProvider(auth);
  const verificationId = await provider.verifyPhoneNumber(e164Phone, recaptchaVerifier);
  return verificationId; // hand back to the modal for the confirm step
};

// Step 2 (verify + link to THIS uid, not a new phone account):
const linkPhoneToAccount = async (verificationId: string, code: string) => {
  const cred = PhoneAuthProvider.credential(verificationId, code);
  await linkWithCredential(auth.currentUser!, cred); // same UID keeps wallet/history
  const digits = auth.currentUser!.phoneNumber || '';
  await setDoc(doc(db, 'users', auth.currentUser!.uid), {
    phoneNumber: digits, phone: digits, normalizedPhone: digits.replace(/\D/g, ''),
  }, { merge: true });
};

const saveEmail = async (email: string) => {
  await setDoc(doc(db, 'users', auth.currentUser!.uid), { email: email.trim() }, { merge: true });
};
```

- [ ] **Step 1: Build the component.** Model structure + reCAPTCHA plumbing on `ProfileCompletionModal.tsx` and `LoginView.tsx` (invisible verifier). The modal:
  - On open, compute `const { needsPhone, needsEmail } = resolveMissingContact(currentUser)`.
  - Render only the missing field(s). Phone: E.164 input → "Send code" (`linkPhoneSendCode`) → 6-digit code → "Verify" (`linkPhoneToAccount`). Email: validated input → "Save" (`saveEmail`).
  - Bilingual AR/EN labels; smooth ease-out transition (no spring).
  - When both required fields are satisfied, call `onComplete()`.
  - Handle `auth/credential-already-in-use` / `auth/account-exists-with-different-credential` on link by showing "this number is already on another account" (do NOT silently sign the user into the other account).

- [ ] **Step 2: Manual smoke via Vercel preview** (no unit test for the modal UI; the gating logic is covered by A1/A2 and the flow is verified on preview per the customer-facing rule). Run `npm run build` to confirm it compiles.

- [ ] **Step 3: Commit** — `git add -A && git commit -m "feat(contact): ContactCompletionModal + linkPhoneToAccount/saveEmail actions"`

---

### Task A4: wire the gate into the bid + sell flows

**Files:**
- Modify: the bid-flow hook/handler that calls `resolveBidGate` (found via the `tsc` sweep in A2 — likely `src/hooks/useBidFlow.ts` or a live-layout handler)
- Modify: the sell entry (`src/components/SellView.tsx` and/or the `resolveGuestWriteAction('sell')` caller)
- Modify: `src/App.tsx` or the shell that renders gate modals — mount `<ContactCompletionModal>`

**Interfaces:**
- Consumes: `resolveBidGate` (now needs `contactComplete: isContactComplete(currentUser)`), `resolveMissingContact`, `ContactCompletionModal`.

- [ ] **Step 1:** At every `resolveBidGate(` call site, pass `contactComplete: isContactComplete(currentUser)`. When the decision is `'contact'`, open `ContactCompletionModal` instead of proceeding; on its `onComplete`, resume the original bid action.
- [ ] **Step 2:** In the sell entry, before reaching `upload`, if `!isContactComplete(currentUser)` open the same modal and block until complete. (The concierge form already collects a phone into `conciergeContact`, but that does not populate the account — the gate ensures the ACCOUNT has both channels so notifications reach them.)
- [ ] **Step 3:** Run `npm run build` + `npx tsc --noEmit`. Expected: clean.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat(contact): gate bid + sell on contact completeness"`

---

## Slice B — Notification delivery layer

### Task B1: `channelsFor` policy map (pure)

**Files:**
- Create: `functions/notify.js`
- Test: `functions/notify.test.js`

**Interfaces:**
- Produces: `channelsFor(event: string) → { inapp, whatsapp, email }`. No firebase deps.

- [ ] **Step 1: Write the failing test** — `functions/notify.test.js`:

```js
const { channelsFor } = require('./notify');

describe('channelsFor', () => {
  it('auction_won → all three channels', () => {
    expect(channelsFor('auction_won')).toEqual({ inapp: true, whatsapp: true, email: true });
  });
  it('outbid → in-app + whatsapp, NOT email', () => {
    expect(channelsFor('outbid')).toEqual({ inapp: true, whatsapp: true, email: false });
  });
  it('below_reserve_declined → in-app only', () => {
    expect(channelsFor('below_reserve_declined')).toEqual({ inapp: true, whatsapp: false, email: false });
  });
  it('account_banned → all three', () => {
    expect(channelsFor('account_banned')).toEqual({ inapp: true, whatsapp: true, email: true });
  });
  it('unknown event defaults to in-app only (never silently emails)', () => {
    expect(channelsFor('made_up_event')).toEqual({ inapp: true, whatsapp: false, email: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `cd /tmp/mazzado-e5 && npx vitest run functions/notify.test.js`. Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation** — `functions/notify.js`:

```js
'use strict';
// Pure notification policy + scheduling helpers. NO firebase deps (root Vitest
// must load this; see #138). channelsFor is the single source of truth for which
// channels an event reaches — spam-y events (outbid) skip email here.

const ALL = { inapp: true, whatsapp: true, email: true };
const INAPP_WA = { inapp: true, whatsapp: true, email: false };
const INAPP_ONLY = { inapp: true, whatsapp: false, email: false };

const CHANNEL_POLICY = {
  auction_won: ALL,
  payment_due: ALL,
  payment_reminder: ALL,
  below_reserve_offer: ALL,
  below_reserve_seller_accepted: ALL,
  below_reserve_declined: INAPP_ONLY,
  outbid: INAPP_WA,
  order_preparing: ALL,
  order_shipped: ALL,
  order_delivered: ALL,
  order_completed: ALL,
  order_refunded: ALL,
  membership_rejected: ALL,
  order_payment_rejected: ALL,
  account_banned: ALL,
  ban_lifted: ALL,
  seller_ship_nudge: INAPP_WA,
  buyer_confirm_nudge: INAPP_WA,
};

function channelsFor(event) {
  return CHANNEL_POLICY[event] || INAPP_ONLY;
}

module.exports = { channelsFor };
```

- [ ] **Step 4: Run test to verify it passes** — Run: `npx vitest run functions/notify.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** — `git add functions/notify.js functions/notify.test.js && git commit -m "feat(notify): channelsFor policy map"`

---

### Task B2: `copyFor` in-app copy map (pure)

**Files:**
- Modify: `functions/notify.js` (add `copyFor` + export)
- Test: `functions/notify.test.js` (append)

**Interfaces:**
- Produces: `copyFor(event, data) → { title: string, description: string, type: string }` where `type` is one of the `Notification` union (`src/types.ts`: `'info'|'outbid'|'win'|'refund'|'verify'|'alert'|'bid'|'loss'|'wallet'|'order'|'subscription'|'admin'`). Consumed by `notify()` (B3) for the in-app doc.

- [ ] **Step 1: Write the failing test** — append:

```js
const { copyFor } = require('./notify');

describe('copyFor', () => {
  it('auction_won maps to win type with title + interpolated body', () => {
    const c = copyFor('auction_won', { auctionTitle: 'ساعة', totalDue: 105 });
    expect(c.type).toBe('win');
    expect(c.title.length).toBeGreaterThan(0);
    expect(c.description).toContain('ساعة');
  });
  it('account_banned maps to alert type', () => {
    expect(copyFor('account_banned', { reason: 'payment_default' }).type).toBe('alert');
  });
  it('unknown event yields a safe info default', () => {
    const c = copyFor('mystery', {});
    expect(c.type).toBe('info');
    expect(typeof c.title).toBe('string');
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npx vitest run functions/notify.test.js`. Expected: FAIL (`copyFor` undefined).

- [ ] **Step 3: Write minimal implementation** — add to `functions/notify.js` (Arabic-primary, terse; interpolate from `data`). Provide an entry for every event key in `CHANNEL_POLICY`, each returning `{ title, description, type }`. Example shape (fill all events):

```js
function copyFor(event, data = {}) {
  const t = data.auctionTitle || data.orderId || '';
  const M = {
    auction_won:  { type: 'win',   title: 'فزت بالمزاد 🎉',   description: `مبروك! ربحت "${t}". المبلغ المستحق ${data.totalDue || ''} د.أ.` },
    payment_due:  { type: 'order', title: 'دفعة مستحقة',       description: `يرجى دفع "${t}" خلال ${data.paymentHours || 24} ساعة.` },
    payment_reminder: { type: 'order', title: 'تذكير بالدفع',  description: `ما زال "${t}" بانتظار الدفع. بادر قبل انتهاء المهلة.` },
    below_reserve_offer: { type: 'info', title: 'عرض أقل من السعر', description: `أعلى مزايدة على "${t}" ${data.topBid || ''} د.أ — تقبل؟` },
    below_reserve_seller_accepted: { type: 'win', title: 'البائع قبل عرضك', description: `قبل البائع مزايدتك على "${t}". أكّد للشراء.` },
    below_reserve_declined: { type: 'loss', title: 'لم يُقبل العرض', description: `لم يقبل البائع مزايدتك على "${t}".` },
    outbid: { type: 'outbid', title: 'تمت المزايدة عليك', description: `تجاوزك أحدهم على "${t}".` },
    order_preparing: { type: 'order', title: 'يتم التجهيز', description: `طلبك "${t}" قيد التجهيز.` },
    order_shipped: { type: 'order', title: 'تم الشحن', description: `تم شحن طلبك "${t}".` },
    order_delivered: { type: 'order', title: 'تم التوصيل', description: `تم توصيل طلبك "${t}".` },
    order_completed: { type: 'order', title: 'اكتمل الطلب', description: `اكتمل طلبك "${t}".` },
    order_refunded: { type: 'refund', title: 'تم الاسترجاع', description: `تمت إعادة مبلغ طلبك "${t}".` },
    membership_rejected: { type: 'subscription', title: 'مراجعة العضوية', description: data.reason || 'تم رفض طلب العضوية.' },
    order_payment_rejected: { type: 'order', title: 'رُفض إثبات الدفع', description: data.reason || 'يرجى إعادة إرسال إثبات الدفع.' },
    account_banned: { type: 'alert', title: 'تم تقييد الحساب', description: data.reason === 'payment_default_repeat' ? 'تم تعليق حسابك ٣ أشهر لتكرار عدم الدفع.' : 'تم تقييد المزايدة ٤٨ ساعة بسبب عدم الدفع.' },
    ban_lifted: { type: 'info', title: 'تم رفع التقييد', description: 'يمكنك المزايدة مجدداً.' },
    seller_ship_nudge: { type: 'order', title: 'ذكّر بالشحن', description: `يرجى شحن الطلب "${t}".` },
    buyer_confirm_nudge: { type: 'order', title: 'أكّد الاستلام', description: `يرجى تأكيد استلام "${t}".` },
  };
  return M[event] || { type: 'info', title: 'تنبيه', description: '' };
}
module.exports = { channelsFor, copyFor };
```

- [ ] **Step 4: Run test to verify it passes** — Run: `npx vitest run functions/notify.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** — `git add functions/notify.js functions/notify.test.js && git commit -m "feat(notify): copyFor in-app copy map"`

---

### Task B3: the `notify()` choke point (impure, in index.js)

**Files:**
- Modify: `functions/index.js` (add `notify()` near `postToN8n`, ~line 54; import `channelsFor`, `copyFor`)

**Interfaces:**
- Consumes: `channelsFor`, `copyFor` (B1/B2), `db`, `postToN8n`.
- Produces: `async notify({ uid, event, data })` — looks up the user, writes the in-app doc when `channels.inapp`, and posts to n8n with `phone` + `email` + `name` + `channels` when `whatsapp||email`. Never throws. Consumed by B4–B8.

- [ ] **Step 1: Add the require** at the top of `functions/index.js`:

```js
const { channelsFor, copyFor } = require('./notify');
```

- [ ] **Step 2: Implement `notify()`** right after `postToN8n` (~line 54):

```js
// Single notification choke point (E5). Resolves the event's channels, writes
// the in-app bell doc, and hands phone+email+channels to n8n for WhatsApp/email
// fan-out. NEVER throws — same money-path safety contract as postToN8n.
async function notify({ uid, event, data = {} }) {
  const channels = channelsFor(event);
  let user = {};
  if (uid) {
    try {
      const s = await db.collection('users').doc(uid).get();
      if (s.exists) user = s.data() || {};
    } catch (e) { console.warn(`[notify] user lookup ${uid} failed:`, e && e.message); }
  }
  if (channels.inapp && uid) {
    try {
      const c = copyFor(event, data);
      await db.collection('notifications').add({
        userId: uid, type: c.type, title: c.title, description: c.description,
        timestamp: Date.now(), read: false, priority: data.priority || 'medium',
        ...(data.auctionId ? { auctionId: data.auctionId } : {}),
      });
    } catch (e) { console.warn(`[notify] in-app ${event} failed:`, e && e.message); }
  }
  if (channels.whatsapp || channels.email) {
    await postToN8n(event, {
      phone: user.phoneNumber || user.phone || data.phone || '',
      email: user.email || data.email || '',
      name: user.name || data.name || '',
      channels, ...data,
    });
  }
}
```

- [ ] **Step 3: Verify it loads** — Run: `node -c functions/index.js`. Expected: OK.
- [ ] **Step 4: Commit** — `git add functions/index.js && git commit -m "feat(notify): notify() choke point (in-app + n8n email/whatsapp)"`

---

### Task B4: route existing emit sites through `notify()`

**Files:**
- Modify: `functions/index.js` — the 11 `postToN8n(` sites (settlement won/payment_due `:366/:375`, below_reserve_offer `:396`, below_reserve_seller_accepted `:2216`, confirm won/payment_due `:2336-2337`, outbid `:991`, order status `:1036`, membership_rejected `:1713`, order_payment_rejected `:1756`, ship/confirm nudge `:1792`)

**Interfaces:**
- Consumes: `notify()` (B3). Each site passes the `uid` it already has in scope (winnerId/buyerId/sellerId/prev-bidder id) and keeps its existing payload fields as `data`.

- [ ] **Step 1:** Replace each `await postToN8n(event, { phone, ...fields })` with `await notify({ uid: <the target uid in scope>, event, data: { ...fields } })`. Drop the now-redundant per-site `phone` lookups (e.g. the below-reserve seller-phone `get()` at `:389-394` — `notify()` looks it up). Keep `idempotencyKey` fields inside `data`. Leave the direct `admin.messaging().send` FCM blocks as-is (dead but harmless).
- [ ] **Step 2:** Confirm no `postToN8n(` call remains outside `notify()` except inside `notify()` itself — Run: `grep -n "postToN8n(" functions/index.js` (expect one call, inside `notify`).
- [ ] **Step 3:** Run: `node -c functions/index.js && npx vitest run`. Expected: all existing tests still pass (666+).
- [ ] **Step 4: Commit** — `git add functions/index.js && git commit -m "refactor(notify): route all emit sites through notify()"`

---

### Task B5: ban apply / lift notifications

**Files:**
- Modify: `functions/index.js` — `paymentDefaultEnforcer` (auto-expiry block `:740-753` → `ban_lifted`; strike/block block `:798-805` → `account_banned`); the manual admin ban/unban callables (find via `grep -n "isBlocked" functions/index.js`)

**Interfaces:**
- Consumes: `notify()`.

- [ ] **Step 1:** In the auto-expiry loop, after the successful `uDoc.ref.set({ isBlocked:false, ... })`, add `await notify({ uid: uDoc.id, event: 'ban_lifted', data: {} });`.
- [ ] **Step 2:** In the strike/block section, after `batch.commit()`, add `await notify({ uid: buyerId, event: 'account_banned', data: { reason: blockedReason, blockedUntil } });`.
- [ ] **Step 3:** In the manual admin ban callable, after the block write, `await notify({ uid: targetUid, event: 'account_banned', data: { reason: 'admin' } })`; in the manual unban, `await notify({ uid: targetUid, event: 'ban_lifted', data: {} })`.
- [ ] **Step 4:** Run: `node -c functions/index.js && npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** — `git add functions/index.js && git commit -m "feat(notify): ban applied + lifted notifications"`

---

### Task B6: below-reserve decline notification

**Files:**
- Modify: `functions/index.js` — `declineBelowReserve` (`:2355`)

**Interfaces:**
- Consumes: `notify()`.

- [ ] **Step 1:** After the decline commits, notify the top bidder: `await notify({ uid: <topBidderId from the offer>, event: 'below_reserve_declined', data: { auctionId, auctionTitle } });`. Read the bidder id from the auction's `belowReserveOffer` (the accept path already reads it). Post-commit, never inside the transaction.
- [ ] **Step 2:** Run: `node -c functions/index.js && npx vitest run`. Expected: PASS.
- [ ] **Step 3: Commit** — `git add functions/index.js && git commit -m "feat(notify): notify buyer on below-reserve decline"`

---

### Task B7: `dueReminders` helper (pure)

**Files:**
- Modify: `functions/notify.js` (add `dueReminders` + a local `toMs`)
- Test: `functions/notify.test.js` (append)

**Interfaces:**
- Produces: `dueReminders(order, nowMs) → ('50'|'final')[]`. Uses `order.status`, `order.paymentDeadlineAt`, `order.paymentWindowHours`, `order.remind50Sent`, `order.remindFinalSent`. Consumed by the cron (B8).

- [ ] **Step 1: Write the failing test** — append. Use a 24h window; deadline at `D`; window start `D - 24h`.

```js
const { dueReminders } = require('./notify');
const H = 3600 * 1000;
const D = 1_000_000_000_000; // arbitrary deadline ms
const order = (over = {}) => ({ status: 'waiting_payment', paymentDeadlineAt: D, paymentWindowHours: 24, ...over });

describe('dueReminders', () => {
  it('nothing due early in the window', () => {
    expect(dueReminders(order(), D - 20 * H)).toEqual([]); // 20h before deadline (>12h)
  });
  it('50% milestone once past halfway', () => {
    expect(dueReminders(order(), D - 10 * H)).toEqual(['50']); // 10h left (<12h) 
  });
  it('does not resend 50% once flagged', () => {
    expect(dueReminders(order({ remind50Sent: true }), D - 10 * H)).toEqual([]);
  });
  it('final milestone inside last 2h supersedes 50', () => {
    expect(dueReminders(order(), D - 1 * H)).toEqual(['final']);
  });
  it('final not resent once flagged', () => {
    expect(dueReminders(order({ remindFinalSent: true }), D - 1 * H)).toEqual([]);
  });
  it('expired / non-waiting orders yield nothing', () => {
    expect(dueReminders(order(), D + H)).toEqual([]);
    expect(dueReminders(order({ status: 'paid' }), D - 1 * H)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npx vitest run functions/notify.test.js`. Expected: FAIL.

- [ ] **Step 3: Write minimal implementation** — add to `functions/notify.js`:

```js
function toMs(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Which unpaid-order reminders are due now (and not already sent). 'final' (last
// 2h) supersedes '50' so a late first-run sends one message, not two. The cron
// (index.js) marks both flags when it sends 'final'.
function dueReminders(order, nowMs) {
  if (!order || order.status !== 'waiting_payment') return [];
  const deadline = toMs(order.paymentDeadlineAt);
  if (deadline == null || nowMs >= deadline) return [];
  const hours = Number(order.paymentWindowHours) > 0 ? Number(order.paymentWindowHours) : 24;
  const windowMs = hours * 3600 * 1000;
  const finalThreshold = deadline - 2 * 3600 * 1000;
  const halfway = deadline - windowMs / 2;
  if (!order.remindFinalSent && nowMs >= finalThreshold) return ['final'];
  if (!order.remind50Sent && nowMs >= halfway) return ['50'];
  return [];
}

module.exports = { channelsFor, copyFor, dueReminders };
```

- [ ] **Step 4: Run test to verify it passes** — Run: `npx vitest run functions/notify.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** — `git add functions/notify.js functions/notify.test.js && git commit -m "feat(notify): dueReminders scheduling helper"`

---

### Task B8: payment-reminder cron

**Files:**
- Modify: `functions/index.js` (new `exports.paymentReminderSweep`; import `dueReminders`)

**Interfaces:**
- Consumes: `dueReminders` (B7), `notify()` (B3).

- [ ] **Step 1:** Add `dueReminders` to the `./notify` require. Add the cron after `paymentDefaultEnforcer`:

```js
// E5 — nudge buyers with an unpaid order still inside its payment window. One
// reminder at ~50% remaining, a final one ~2h before expiry; idempotent via
// remind50Sent/remindFinalSent flags. Expired orders are the enforcer's job.
exports.paymentReminderSweep = functions.pubsub
  .schedule('every 30 minutes')
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();
    const nowMs = now.toMillis();
    try {
      const snap = await db.collection('orders')
        .where('status', '==', 'waiting_payment')
        .where('paymentDeadlineAt', '>', now)
        .get();
      for (const doc of snap.docs) {
        const o = doc.data();
        const due = dueReminders(o, nowMs);
        if (due.length === 0) continue;
        await notify({
          uid: o.buyerId,
          event: 'payment_reminder',
          data: {
            auctionId: o.auctionId, auctionTitle: o.auctionTitle,
            totalDue: o.totalDue || o.winningBidAmount,
            paymentHours: resolvePaymentWindowHours(o.paymentWindowHours),
            idempotencyKey: `${doc.id}_payment_reminder_${due[0]}`,
          },
        });
        const flags = due[0] === 'final'
          ? { remind50Sent: true, remindFinalSent: true }
          : { remind50Sent: true };
        await doc.ref.set(flags, { merge: true });
      }
    } catch (err) {
      console.error('[paymentReminderSweep]', err);
    }
    return null;
  });
```

- [ ] **Step 2:** Run: `node -c functions/index.js && npx vitest run`. Expected: PASS (666+ existing + new notify tests).
- [ ] **Step 3: Commit** — `git add functions/index.js && git commit -m "feat(notify): payment-reminder cron (50% + final)"`

---

### Task B9: full green + PR

- [ ] **Step 1:** Run the full gate — `cd /tmp/mazzado-e5 && node -c functions/index.js && npx tsc --noEmit && npm run lint && npm run build && npx vitest run`. All green.
- [ ] **Step 2:** Push + open a DRAFT PR (base main). Body summarizes both slices, the channel matrix, the three new events, and the deferrals. Fetch the Vercel preview URL.
- [ ] **Step 3:** Cross-model money-path review of the `functions/index.js` diff (notify refactor + reminder cron touch order state) before marking ready.
- [ ] **Step 4:** Report to MJ with the preview URL for the ContactCompletionModal + gate; hold for merge approval (customer-facing rule).

---

## Self-Review (done)

- **Spec coverage:** Slice A (capture at first transaction, OTP-verify phone, email) → A1–A4. Slice B (`notify()` + channel map + email field + 3 new events + copy) → B1–B8. Deferrals (FCM, email verification) explicitly untouched. ✓
- **Placeholder scan:** every code step has real code; copy map fills all events; no TBD. ✓
- **Type consistency:** `resolveMissingContact`/`isContactComplete` (A1) feed `contactComplete` (A2) and the modal (A3/A4); `channelsFor`/`copyFor`/`dueReminders` (B1/B2/B7) all live in `functions/notify.js` and feed `notify()`/cron (B3/B8); in-app `type` values match the `Notification` union in `src/types.ts`. ✓
