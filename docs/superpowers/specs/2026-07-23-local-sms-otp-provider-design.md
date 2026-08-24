# Local SMS OTP Provider — Design Spec

**Date:** 2026-07-23
**Status:** Drafted (awaiting MJ: provider choice + account/API key). Build is gated on the key.

## Problem

Firebase Phone Auth routes OTP SMS through its own international aggregator to Jordanian
carriers (Zain/Orange/Umniah). Delivery is slow and variable (10s–60s+, occasional
drops) — the top sign-up friction point. We already shipped a UX band-aid (resend timer +
"may take a minute" copy, PR #58). This spec is the durable fix: issue + verify OTP via a
**local/MENA SMS provider** with direct carrier routing, keeping Firebase only for the
actual session/identity.

## Provider choice

**Recommended: Unifonic** (Riyadh-based, the de-facto SMS provider for Jordan/GCC —
direct local carrier routes, Arabic sender IDs, strong MENA deliverability). **Twilio
Verify** is the drop-in alternative (better docs/global tooling, but international routing
to JO is the exact problem we're leaving). The architecture below is **provider-agnostic**
— a single `SmsProvider` interface with one implementation; swapping Unifonic↔Twilio is
one file. MJ picks; default Unifonic.

## Principle — Firebase stays the identity system; we replace only the SMS transport

We do NOT leave Firebase Auth. We keep phone numbers as Firebase identities and keep the
session/token model exactly as today. We only stop using Firebase's *SMS delivery*. The
mechanism: a **custom-OTP flow backed by Firebase Custom Tokens**.

1. Client sends the phone number to our Cloud Function (not to Firebase Auth).
2. Function generates a 6-digit code, sends it via the local provider, stores a hashed
   record server-side (Firestore, short TTL).
3. Client submits the code to a verify Cloud Function.
4. On match, the function mints a **Firebase custom token** for that phone identity and
   returns it; the client calls `signInWithCustomToken` → a normal Firebase session,
   indistinguishable downstream (same `currentUser`, same rules, same `authReady` gate,
   same profile-completion flow).

This means everything already built (profile gate, admin gates, session persistence)
keeps working unchanged — only the "how the code reaches the phone" changes.

## Security constraints (hard)

- **The provider API key is a SERVER-ONLY secret.** MJ creates the Unifonic/Twilio
  account and sets the key as a Cloud Functions secret himself (`firebase functions:secrets:set`
  or the GitHub secret the CI already uses). Claude never sees, types, or handles the key.
  It is NEVER in client code, NEVER in the repo, NEVER in a client-readable config.
- Given the prior leaked-key runaway-bill incident: the key lives only in the Functions
  runtime secret store; the client calls our function, never the provider directly.
- OTP records are hashed (not plaintext codes) in Firestore, TTL ≤10 min, with rules
  denying all client read/write (server-only collection).

## Feature flag — ships OFF, zero risk until MJ flips it with a real key

- A `siteSettings` flag `otpProvider: 'firebase' | 'local'` (default `'firebase'`).
- When `'firebase'`: the existing Firebase Phone Auth path runs exactly as today (this
  spec's code is dormant). When `'local'`: LoginView routes to the custom-OTP functions.
- So the whole feature can merge and deploy with the flag OFF — no behavior change, no
  dependency on the key existing — then MJ sets the key and flips the flag to cut over,
  and can flip back instantly if delivery disappoints.

---

## Wave 1 — Server: provider abstraction + OTP functions (dormant behind flag)

**Files:** `functions/index.js` (or a new `functions/sms.js` module), `firestore.rules`,
`functions/package.json` (provider SDK dep)

- `SmsProvider` interface: `sendSms(toE164, message) → Promise<{ok, id?}>`. One impl:
  `unifonicProvider` (HTTP POST to Unifonic's send API with the secret key from
  `process.env` / functions secret). (Twilio impl is a sibling if chosen.)
- `requestOtp` callable: input `{ phoneE164 }`. Rate-limit per number (e.g. max 1/60s,
  5/hour — server-enforced, mirrors the client resend cooldown). Generate 6-digit code,
  store `{ phoneHash, codeHash, expiresAt, attempts: 0 }` in a server-only
  `otpRequests` collection, send via provider. Return `{ ok }` (never the code).
- `verifyOtp` callable: input `{ phoneE164, code }`. Look up record, check not expired,
  increment attempts (lock after 5), compare hash. On success: mint a Firebase custom
  token for uid = the phone-derived uid (match Firebase's phone-uid convention or a
  deterministic uid keyed to the number so the SAME user doc is reused across logins —
  CRITICAL: must map to the same `users/{uid}` a Firebase-phone login would, or existing
  accounts fork). Delete the OTP record. Return `{ token }`.
- **UID continuity (the riskiest detail):** Firebase phone-auth uids are Firebase-assigned
  and NOT reproducible by us. Options: (a) look up an existing Auth user by phone via the
  Admin SDK (`getUserByPhoneNumber`) and mint a token for THAT uid (reuses the account);
  (b) if none, create an Auth user with that phone via Admin SDK, then mint for it. This
  keeps one identity per number whether they came via old Firebase-SMS or new local-OTP.
  Spec the implementer to use `getUserByPhoneNumber` → create-if-missing → `createCustomToken(uid)`.
- `firestore.rules`: `otpRequests` — deny all client access (server-only).
- Secret wired via the existing CI secret mechanism; `requestOtp`/`verifyOtp` no-op with a
  clear error if the secret is unset (so a deploy without the key fails safe, not silently).

## Wave 2 — Client: flag-gated routing in LoginView

**Files:** `src/components/LoginView.tsx`, `src/context/AppContext.tsx`

- Read `otpProvider` from the siteSettings flag (already synced in AppContext).
- `'firebase'` → today's `loginWithPhone`/`confirmPhoneCode` (unchanged; reCAPTCHA etc.).
- `'local'` → new path: `requestOtpLocal(phoneE164)` (callable) then `verifyOtpLocal(code)`
  → `signInWithCustomToken(token)`. NO reCAPTCHA needed (server rate-limits instead) —
  which also removes the reCAPTCHA load delay for the local path.
- Reuse the existing OTP UI (input, resend cooldown, expectation copy) — only the two
  handler calls swap based on the flag. Keep `authReady`/profile-gate downstream identical.
- The resend timer already shipped works for both paths.

## Wave 3 — Cutover + validation (MJ-driven, needs the key + a real JO number)

- MJ sets the provider secret, flips `otpProvider: 'local'` in siteSettings.
- Live test from a real Jordanian number: measure delivery time vs Firebase; confirm the
  minted-token session lands on the SAME user doc (no account fork); profile gate + admin
  gate still work.
- Keep `'firebase'` as instant rollback.

## Testing

- Unit: OTP code gen/hash/expiry/attempt-lock logic (pure); the `SmsProvider` interface
  with a mock provider (no real send in tests); UID-continuity resolver with a mocked
  Admin SDK.
- Manual (MJ, post-key): delivery-time comparison, account-continuity, rollback.

## Risks

- **UID continuity** is the make-or-break — get `getUserByPhoneNumber`→create→customToken
  right or existing accounts fork. Highest-scrutiny item in review.
- **Key handling** — server-only, MJ-set, fail-safe if unset. Non-negotiable given history.
- **Provider deliverability** — the whole point; validate with a real JO number before
  trusting it. Flag makes rollback instant.
- **Cost** — local providers bill per SMS; MJ confirms pricing. (Firebase phone auth also
  bills per verification, so likely comparable or cheaper.)

## What MJ must provide before build

1. **Provider choice** (Unifonic recommended / Twilio Verify).
2. **Account + API key** — created by MJ, set as a Functions secret by MJ. Claude builds
   against `process.env.<SECRET>`, never sees the value.
3. Optionally an approved **sender ID / brand name** for the SMS ("Mazzado").
