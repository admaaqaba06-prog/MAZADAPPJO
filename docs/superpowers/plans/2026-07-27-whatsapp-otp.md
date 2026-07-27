# WhatsApp OTP Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Authenticate phone users via a WhatsApp-delivered OTP + Firebase custom token (no reCAPTCHA, no Firebase SMS), with Firebase SMS kept as a fallback.

**Architecture:** Two callables (`requestWhatsappOtp`, `verifyWhatsappOtp`) backed by pure helpers; delivery via the already-built n8n OTP relay (`N8N_OTP_WEBHOOK_URL`); verify resolves the uid via `getUserByPhoneNumber` (preserves existing accounts) and mints a custom token; client signs in with it.

**Tech Stack:** React 19 + Vite + TS + Firebase (Functions CommonJS, Admin Auth custom tokens, Firestore), Vitest.

## Global Constraints
- `verifyWhatsappOtp` makes ZERO wallet/ledger/escrow writes — it only authenticates.
- The custom token is minted ONLY after a code is verified.
- No account-existence leak (generic responses).
- `functions/whatsappOtp.js` is PURE (only node builtins `crypto`; no firebase imports) — root Vitest loads it (#138 guard).
- OTP send must never throw into the callable (mirror `postToN8n`).
- Delivery relay already exists + proven: n8n workflow `hTVBPL7BqJVIV37e`, webhook `https://mazadjo.app.n8n.cloud/webhook/send-otp`, payload `{phone, code}`.
- Test globs: `src/**/*.test.ts(x)`, `functions/**/*.test.js`; functions tests need `import { describe, it, expect } from 'vitest'`.
- Arabic-primary; bilingual UI; worktree `/tmp/mazadjo-otp`, branch `feat/whatsapp-otp`.

---

## Slice A — Server

### Task A1: pure OTP helpers
**Files:** Create `functions/whatsappOtp.js`, `functions/whatsappOtp.test.js`.
**Interfaces:** `normalizeJordanPhone`, `generateOtpCode`, `hashOtp`, `canSendOtp`, `checkOtp`, constants.

- [ ] **Step 1: failing test** — `functions/whatsappOtp.test.js`:
```js
import { describe, it, expect } from 'vitest';
const {
  normalizeJordanPhone, generateOtpCode, hashOtp, canSendOtp, checkOtp,
  OTP_TTL_MS, SEND_COOLDOWN_MS, MAX_SENDS_PER_HOUR, MAX_ATTEMPTS, CODE_LENGTH,
} = require('./whatsappOtp');

describe('normalizeJordanPhone', () => {
  it('normalizes local + international shapes to +9627XXXXXXXX', () => {
    expect(normalizeJordanPhone('0791234567')).toBe('+962791234567');
    expect(normalizeJordanPhone('+962 79 123 4567')).toBe('+962791234567');
    expect(normalizeJordanPhone('00962791234567')).toBe('+962791234567');
  });
  it('rejects junk / non-Jordan-mobile', () => {
    expect(normalizeJordanPhone('123')).toBeNull();
    expect(normalizeJordanPhone('0611234567')).toBeNull(); // not a 7-prefixed mobile
    expect(normalizeJordanPhone('')).toBeNull();
  });
});

describe('generateOtpCode', () => {
  it('is a 6-digit numeric string', () => {
    for (let i = 0; i < 50; i++) {
      const c = generateOtpCode();
      expect(c).toMatch(/^\d{6}$/);
      expect(c.length).toBe(CODE_LENGTH);
    }
  });
});

describe('hashOtp', () => {
  it('is deterministic + salt-sensitive + not the plaintext', () => {
    expect(hashOtp('123456', 's1')).toBe(hashOtp('123456', 's1'));
    expect(hashOtp('123456', 's1')).not.toBe(hashOtp('123456', 's2'));
    expect(hashOtp('123456', 's1')).not.toContain('123456');
  });
});

describe('canSendOtp', () => {
  const cfg = { cooldownMs: SEND_COOLDOWN_MS, windowMs: 3600000, maxPerWindow: MAX_SENDS_PER_HOUR };
  it('allows a first send (no record)', () => {
    expect(canSendOtp(null, 1_000_000, cfg).ok).toBe(true);
  });
  it('blocks inside the cooldown with a retryAfter', () => {
    const r = canSendOtp({ lastSentAt: 1_000_000, sendCount: 1, windowStartAt: 1_000_000 }, 1_030_000, cfg);
    expect(r.ok).toBe(false);
    expect(r.retryAfterSec).toBeGreaterThan(0);
  });
  it('allows again after the cooldown', () => {
    expect(canSendOtp({ lastSentAt: 1_000_000, sendCount: 1, windowStartAt: 1_000_000 }, 1_070_000, cfg).ok).toBe(true);
  });
  it('blocks once the hourly cap is hit', () => {
    expect(canSendOtp({ lastSentAt: 1_000_000, sendCount: 5, windowStartAt: 1_000_000 }, 1_100_000, cfg).ok).toBe(false);
  });
  it('resets after the window elapses', () => {
    expect(canSendOtp({ lastSentAt: 1_000_000, sendCount: 5, windowStartAt: 1_000_000 }, 1_000_000 + 3_700_000, cfg).ok).toBe(true);
  });
});

describe('checkOtp', () => {
  const salt = 's';
  const rec = (over = {}) => ({ codeHash: hashOtp('123456', salt), salt, expiresAt: 2_000_000, attempts: 0, ...over });
  it('accepts the right code before expiry', () => {
    expect(checkOtp(rec(), '123456', 1_500_000)).toEqual({ ok: true });
  });
  it('rejects the wrong code', () => {
    expect(checkOtp(rec(), '000000', 1_500_000).ok).toBe(false);
  });
  it('rejects an expired code', () => {
    expect(checkOtp(rec(), '123456', 2_500_000).ok).toBe(false);
  });
  it('rejects when attempts exhausted', () => {
    expect(checkOtp(rec({ attempts: MAX_ATTEMPTS }), '123456', 1_500_000).ok).toBe(false);
  });
  it('rejects a missing record', () => {
    expect(checkOtp(null, '123456', 1_500_000).ok).toBe(false);
  });
});
```

- [ ] **Step 2: red** — `cd /tmp/mazadjo-otp && npx vitest run functions/whatsappOtp.test.js` → FAIL.
- [ ] **Step 3: implement** — `functions/whatsappOtp.js`:
```js
'use strict';
// Pure WhatsApp-OTP helpers. Only node crypto (no firebase) so root Vitest loads it (#138).
const crypto = require('crypto');

const OTP_TTL_MS = 10 * 60 * 1000;       // code valid 10 min
const SEND_COOLDOWN_MS = 60 * 1000;      // 60s between sends
const MAX_SENDS_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;
const CODE_LENGTH = 6;

function normalizeJordanPhone(input) {
  if (!input) return null;
  let d = String(input).replace(/[^\d]/g, '');
  if (d.startsWith('00962')) d = d.slice(5);
  else if (d.startsWith('962')) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);
  if (!/^7\d{8}$/.test(d)) return null;
  return `+962${d}`;
}

function generateOtpCode() {
  // crypto-random, zero-padded, uniform over [0, 10^CODE_LENGTH)
  const max = 10 ** CODE_LENGTH;
  return String(crypto.randomInt(0, max)).padStart(CODE_LENGTH, '0');
}

function hashOtp(code, salt) {
  return crypto.createHash('sha256').update(`${salt}:${code}`).digest('hex');
}

function canSendOtp(record, nowMs, cfg) {
  const cooldownMs = cfg.cooldownMs, windowMs = cfg.windowMs, maxPerWindow = cfg.maxPerWindow;
  if (!record) return { ok: true };
  const sinceLast = nowMs - (record.lastSentAt || 0);
  if (sinceLast < cooldownMs) {
    return { ok: false, retryAfterSec: Math.ceil((cooldownMs - sinceLast) / 1000) };
  }
  const windowStart = record.windowStartAt || 0;
  const inWindow = nowMs - windowStart < windowMs;
  if (inWindow && (record.sendCount || 0) >= maxPerWindow) {
    return { ok: false, retryAfterSec: Math.ceil((windowMs - (nowMs - windowStart)) / 1000) };
  }
  return { ok: true };
}

function checkOtp(record, code, nowMs) {
  if (!record || !record.codeHash) return { ok: false, reason: 'no_code' };
  if (nowMs >= (record.expiresAt || 0)) return { ok: false, reason: 'expired' };
  if ((record.attempts || 0) >= MAX_ATTEMPTS) return { ok: false, reason: 'too_many_attempts' };
  const candidate = hashOtp(String(code || ''), record.salt);
  const a = Buffer.from(candidate);
  const b = Buffer.from(record.codeHash);
  const match = a.length === b.length && crypto.timingSafeEqual(a, b);
  return match ? { ok: true } : { ok: false, reason: 'mismatch' };
}

module.exports = {
  OTP_TTL_MS, SEND_COOLDOWN_MS, MAX_SENDS_PER_HOUR, MAX_ATTEMPTS, CODE_LENGTH,
  normalizeJordanPhone, generateOtpCode, hashOtp, canSendOtp, checkOtp,
};
```

- [ ] **Step 4: green** — `npx vitest run functions/whatsappOtp.test.js` → PASS.
- [ ] **Step 5: commit** — `git add functions/whatsappOtp.js functions/whatsappOtp.test.js && git commit -m "feat(auth): pure WhatsApp-OTP helpers"`

---

### Task A2: the two callables + config + rules
**Files:** Modify `functions/index.js` (require `./whatsappOtp` + `crypto`; add `exports.requestWhatsappOtp`, `exports.verifyWhatsappOtp`); `firestore.rules` (deny `whatsappOtps`).
**Interfaces:** Consumes A1 helpers, `db`, `admin.auth()`, `N8N_OTP_WEBHOOK_URL`.

- [ ] **Step 1: config** — the send reads `process.env.N8N_OTP_WEBHOOK_URL` (set in functions env to `https://mazadjo.app.n8n.cloud/webhook/send-otp`). Add a small `postOtpToRelay(phone, code)` near `postToN8n` — POST `{phone, code}` JSON, 5s timeout, never throws (mirror `postToN8n`). No-op + warn if the env var is unset.

- [ ] **Step 2: `requestWhatsappOtp`** (https.onCall, unauthenticated):
  - `const e164 = normalizeJordanPhone(data.phone)`; if null → `HttpsError('invalid-argument','bad phone')`.
  - Doc `whatsappOtps/{e164digits}` (use the digits, no `+`). Read it. `canSendOtp(record, Date.now(), {cooldownMs:SEND_COOLDOWN_MS, windowMs:3600000, maxPerWindow:MAX_SENDS_PER_HOUR})` → if `!ok` return `{ ok:false, retryAfterSec }` (do NOT throw — UX).
  - `const code = generateOtpCode(); const salt = crypto.randomBytes(16).toString('hex');`
  - Window bookkeeping: if no record or window elapsed (`now - windowStartAt >= 3600000`), reset `windowStartAt=now, sendCount=1`; else `sendCount = (record.sendCount||0)+1`.
  - `set` the doc: `{ codeHash: hashOtp(code, salt), salt, expiresAt: now+OTP_TTL_MS, attempts:0, lastSentAt:now, windowStartAt, sendCount }` (merge:false — a fresh code invalidates the old).
  - `await postOtpToRelay(e164, code)` (never throws).
  - Return `{ ok:true, retryAfterSec: Math.ceil(SEND_COOLDOWN_MS/1000) }`.

- [ ] **Step 3: `verifyWhatsappOtp`** (https.onCall, unauthenticated):
  - `const e164 = normalizeJordanPhone(data.phone)`; null → `invalid-argument`.
  - Read `whatsappOtps/{e164digits}`. `const res = checkOtp(record, data.code, Date.now())`.
  - If `!res.ok`: if the record exists, `update({ attempts: (record.attempts||0)+1 })` (best-effort). Return `{ ok:false }`. (Generic — no reason leak beyond ok:false; optionally pass `reason` for UX copy but never account existence.)
  - On `ok`: delete the doc (single-use). Resolve uid:
    ```js
    let uid;
    try { uid = (await admin.auth().getUserByPhoneNumber(e164)).uid; }
    catch (e) {
      if (e.code === 'auth/user-not-found') uid = (await admin.auth().createUser({ phoneNumber: e164 })).uid;
      else throw e;
    }
    const token = await admin.auth().createCustomToken(uid);
    return { ok: true, token };
    ```
  - ZERO wallet/ledger writes anywhere in this callable.

- [ ] **Step 4: rules** — in `firestore.rules`, add a `match /whatsappOtps/{id} { allow read, write: if false; }` (only the admin SDK touches it).

- [ ] **Step 5: verify** — `node -c functions/index.js`; `npx vitest run` (existing suite still green). Grep the two callables' bodies: no `wallets`/`ledger`/`escrow` writes.
- [ ] **Step 6: commit** — `git add functions/index.js firestore.rules && git commit -m "feat(auth): requestWhatsappOtp + verifyWhatsappOtp callables (custom token, no money writes)"`

---

## Slice B — Login client

### Task B1: LoginView WhatsApp OTP path + SMS fallback
**Files:** Modify `src/context/AppContext.tsx` (add `requestWhatsappOtp`, `verifyWhatsappOtp`, `signInWithWhatsappToken` wrappers), `src/components/LoginView.tsx`.
**Interfaces:** callables via `getCallableFunction`; `signInWithCustomToken` from firebase/auth.

- [ ] **Step 1: AppContext wrappers**:
  - `requestWhatsappOtp(phone) -> Promise<{ok, retryAfterSec?}>` (httpsCallable).
  - `verifyWhatsappOtp(phone, code) -> Promise<{ok, token?}>` (httpsCallable).
  - `signInWhatsapp(token)`: `const { signInWithCustomToken } = await import('firebase/auth'); await signInWithCustomToken(auth, token);` + the same sessionId localStorage bookkeeping `loginWithPhone` does (generate sessionId, set mazad_session_id + last_login_time BEFORE sign-in). Expose all three on the context value + type.
- [ ] **Step 2: LoginView UI** — make WhatsApp OTP the **primary** phone method:
  - Phone entry → "Send code on WhatsApp" → `requestWhatsappOtp`; on `ok:false` show the cooldown (retryAfterSec). On ok → code-entry screen (reuse the existing 6-digit input + 60s resend cooldown UI already in the file).
  - Verify → `verifyWhatsappOtp` → on `{ok, token}` call `signInWhatsapp(token)` (onAuthStateChanged then flips the app). On `ok:false` show "wrong or expired code".
  - A **"No WhatsApp? Send SMS instead"** text link toggles to the EXISTING Firebase reCAPTCHA path (handleSendCode/handleVerifyCode) — leave that path intact as fallback.
  - Bilingual AR/EN; smooth ease-out; no new deps.
- [ ] **Step 3: verify** — `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npx vitest run` green.
- [ ] **Step 4: commit** — `git add -A && git commit -m "feat(auth): LoginView WhatsApp OTP (primary) + SMS fallback"`

---

## Slice C — Contact-completion modal

### Task C1: ContactCompletionModal WhatsApp path + updateUser
**Files:** Modify `functions/index.js` (extend `verifyWhatsappOtp` OR add a `verifyWhatsappOtpForLink` — see note), `src/components/ContactCompletionModal.tsx`, `src/context/AppContext.tsx`.
**Interfaces:** authenticated variant that attaches the phone to the CURRENT uid.

- [ ] **Step 1:** Add `exports.attachWhatsappPhone` (https.onCall, **authenticated** — `context.auth` required): verifies the code via `checkOtp` (same record), on success `await admin.auth().updateUser(context.auth.uid, { phoneNumber: e164 })` (handle `auth/phone-number-already-exists` → `HttpsError('already-exists', ...)`), then return `{ ok:true }` (the client writes phoneNumber/phone/normalizedPhone to the user doc, mirroring the existing saveEmail/link pattern). NO wallet writes. (Kept separate from `verifyWhatsappOtp` because this one attaches to an existing session instead of minting a token.)
- [ ] **Step 2:** ContactCompletionModal phone branch → use `requestWhatsappOtp` + `attachWhatsappPhone` instead of the reCAPTCHA `linkPhoneSendCode` flow; on `already-exists` show "this number is on another account" (existing copy). Keep the code-entry UX. Bilingual.
- [ ] **Step 3: verify** — tsc/lint/build/vitest green.
- [ ] **Step 4: commit** — `git add -A && git commit -m "feat(auth): contact-completion phone via WhatsApp OTP"`

---

### Task D1: full green + PR
- [ ] `node -c functions/index.js && npx tsc --noEmit && npm run lint && npm run build && npx vitest run` — green.
- [ ] Push; open DRAFT PR (base main). Body: the flow, delivery via the proven n8n relay, security posture, `N8N_OTP_WEBHOOK_URL` deploy note, SMS fallback, deferrals (ban risk, App Check).
- [ ] Cross-model **auth-path** review of the `functions/index.js` diff: custom token only after verify, ZERO wallet writes, no account-existence leak, single-use + attempts + rate-limit enforced, getUserByPhoneNumber preserves existing accounts.
- [ ] Report to MJ with the Vercel preview URL (test a real WhatsApp OTP round-trip on your number) + the reminder to set `N8N_OTP_WEBHOOK_URL` in functions env before deploy.

---

## Self-Review
- **Spec coverage:** helpers (A1), callables + config + rules (A2), login client + SMS fallback (B1), contact modal (C1). Deferrals (ban-risk number, App Check) noted. ✓
- **Type/interface consistency:** helper names match across A1→A2; wrappers (B1) call the A2 callables; `attachWhatsappPhone` (C1) reuses A1's `checkOtp`. ✓
- **Security:** custom token only post-verify; zero wallet writes; single-use + attempts + rate-limit; hashed at rest; no existence leak. ✓
