# WhatsApp OTP Auth Design

Date: 2026-07-27
Status: Approved (design + delivery proven). Replaces Firebase SMS as the primary phone-auth; Firebase SMS kept as a fallback.

## Why

Firebase phone auth stacks three fragile things for the Jordan market: invisible
reCAPTCHA (intermittent — separate `render()` fix in flight), reCAPTCHA/Auth domain
allowlists, and Firebase SMS deliverability (slow + costly). Mazad already runs WhatsApp
via WaSenderAPI. So: deliver the OTP over WhatsApp and authenticate via a Firebase
**custom token** — no reCAPTCHA, no Firebase SMS on the primary path.

## Delivery (already built + proven)

`requestWhatsappOtp` does NOT need a WaSender key: it POSTs `{phone, code}` to the n8n
**OTP relay** (workflow `hTVBPL7BqJVIV37e`, active), prod webhook
`https://mazadjo.app.n8n.cloud/webhook/send-otp`, which sends via WaSender using the
credential n8n already holds. Verified end-to-end (test send → WaSender success). The
Function reads the webhook URL from `N8N_OTP_WEBHOOK_URL`.

## Flow

1. User enters phone → callable **`requestWhatsappOtp({ phone })`**:
   - Normalize to E.164 Jordan (server port of `toE164Jordan`); reject invalid.
   - Rate-limit (per phone): 60s cooldown between sends + max 5 sends/hour.
   - Generate a **crypto-random 6-digit** code; store a **hash** (sha256 + per-record salt)
     in `whatsappOtps/{normalizedPhone}` with `expiresAt` (10 min), `attempts:0`,
     `sendCount`, `lastSentAt`.
   - POST `{phone: e164, code}` to `N8N_OTP_WEBHOOK_URL`. Never throw from the send.
   - Return `{ ok:true, retryAfterSec }` (generic; a cooldown just returns `ok:false,
     retryAfterSec` — no account-existence leak).
2. User enters code → callable **`verifyWhatsappOtp({ phone, code })`**:
   - Load record; validate: not expired, `attempts < 5`, hash matches (constant-time).
     On mismatch: increment attempts, return `{ ok:false }`. On too many/expired:
     invalidate + `{ ok:false }`.
   - On success: delete/invalidate the record (single-use). Resolve the uid via
     **`admin.auth().getUserByPhoneNumber(e164)`** → if found reuse that uid (existing
     account, wallet/history preserved); on `auth/user-not-found`,
     `admin.auth().createUser({ phoneNumber: e164 })`. Mint
     `admin.auth().createCustomToken(uid)`. Return `{ ok:true, token }`.
3. Client `signInWithCustomToken(auth, token)` → authenticated. `onAuthStateChanged`
   fires; existing new-user path writes the Firestore user doc for first-timers (same
   shape as today).

## Security

- Codes: crypto-random 6 digits, hashed at rest (sha256 + per-record salt), single-use,
  constant-time compare, ≤5 verify attempts, 10-min TTL.
- Send rate-limit: 60s cooldown + 5/hour per phone (callables are unauthenticated — this
  is the primary abuse defense; App Check can be layered later).
- No account-existence leak (verify returns generic failure; request returns generic ok).
- The custom-token mint happens ONLY after a verified code.
- `verifyWhatsappOtp` makes ZERO wallet/ledger writes — it only authenticates.

## Pure helpers (`functions/whatsappOtp.js`, no firebase — unit-tested)

- `normalizeJordanPhone(input) -> e164 | null` (server port of toE164Jordan).
- `generateOtpCode() -> '######'` (crypto.randomInt; node builtin, not firebase).
- `hashOtp(code, salt) -> hex` (sha256).
- `canSendOtp(record, nowMs, cfg) -> { ok, retryAfterSec }` (cooldown + hourly cap).
- `checkOtp(record, code, nowMs) -> { ok, reason }` (expiry + attempts + hash match).
- Constants: `OTP_TTL_MS=600000`, `SEND_COOLDOWN_MS=60000`, `MAX_SENDS_PER_HOUR=5`,
  `MAX_ATTEMPTS=5`, `CODE_LENGTH=6`.

## Client

- **LoginView** (primary): phone entry → `requestWhatsappOtp` → 6-digit code entry (reuse
  the existing 60s resend-cooldown UI) → `verifyWhatsappOtp` → `signInWithCustomToken`.
  A **"No WhatsApp? Send SMS instead"** link switches to the existing Firebase reCAPTCHA
  path (unchanged, now render()-fixed). Bilingual AR/EN.
- **ContactCompletionModal** (E5, add phone to the CURRENT account): same WhatsApp code
  flow, but on verify the server also `admin.auth().updateUser(uid, { phoneNumber:e164 })`
  so the phone stays indexed to the account (keeps getUserByPhoneNumber consistent), plus
  writes phoneNumber/phone/normalizedPhone to the user doc. Handle
  `auth/phone-number-already-exists` → "this number is on another account" (mirrors the
  current linkWithCredential error copy).

## firestore.rules

`whatsappOtps/**` is written/read only by the callables (admin SDK) — **deny all client
access** (client never touches it). Add an explicit deny rule.

## Slices

- **A — Server:** pure helpers + `requestWhatsappOtp` + `verifyWhatsappOtp` + `N8N_OTP_
  WEBHOOK_URL` config + firestore.rules deny. Auth/security-critical → cross-model review.
- **B — Login client:** LoginView WhatsApp path (primary) + SMS-fallback link + custom-token
  sign-in. Customer-facing → Vercel preview.
- **C — Contact modal:** ContactCompletionModal WhatsApp path + `updateUser` on the callable.

## Deferred / noted
- **WaSender ban risk:** automated OTP over an unofficial WhatsApp gateway can get the
  number flagged. Mitigation (not built): a dedicated OTP WhatsApp number to isolate from
  the CS bot. Official path (later): WhatsApp Business API auth templates. Accepted for now.
- App Check on the callables (later hardening).

## Testing / rollout
- Pure helpers unit-tested. Callables (custom-token, getUserByPhoneNumber, rate-limit,
  single-use) → cross-model auth-path review; confirm ZERO wallet writes + no
  account-existence leak + custom token only after verify.
- Client → Vercel preview (real WhatsApp OTP round-trip on your number).
- `N8N_OTP_WEBHOOK_URL` set in functions env before deploy.
