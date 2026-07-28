# Multi-Country Phone Auth Design

Date: 2026-07-27
Status: Approved. Opens phone signup to any country (was Jordan-only). Motivation: users whose WhatsApp is tied to a non-Jordanian number (e.g. a US number) currently can't sign up at all — both the WhatsApp-OTP and SMS-fallback paths are Jordan-locked in the UI and backend.

## Current state (verified)
- **Client** `src/utils/phoneNumber.ts` `toE164Jordan(input)` — hard-rejects non-`+962` (national mobile must be `7\d{8}`). Used by the AUTH inputs: `LoginView.tsx` (3 sites: WhatsApp send, SMS send, SMS verify), `ContactCompletionModal.tsx` (1 site). ALSO used by `deliveryAddress.ts` + `AppContext.tsx:2539` — **those stay Jordan-specific** (physical delivery; out of scope).
- **Server** `functions/whatsappOtp.js` `normalizeJordanPhone(input)` — same Jordan-only rule. Used by the 3 OTP callables (`requestWhatsappOtp` `:4679`, `verifyWhatsappOtp` `:4747`, `attachWhatsappPhone` `:4812`).
- **Firebase SMS fallback** `signInWithPhoneNumber(auth, e164, verifier)` already accepts ANY E.164 — so once the UI emits a correct international E.164, the SMS path works internationally with no Firebase change.
- **WaSender** sends to any international number (the `to` field is E.164 digits) — delivery already country-agnostic.
- `libphonenumber-js` is NOT yet a dependency.

## Approach
Use **`libphonenumber-js`** (Google libphonenumber port; runs in browser + node) for correct per-country parse/validation on BOTH client and server. A custom country-selector matches the app's design. Country names via built-in `Intl.DisplayNames` (localized AR/EN, no data file); flag emoji derived from the ISO2 code.

**Division of responsibility:** the **client** owns country selection + normalizes to E.164 and sends the full E.164 to the server; the **server** validates that it's a valid E.164 for some country (country-agnostic) — so server callables need no country param, just robust E.164 validation.

## Design

### Shared parsing (`libphonenumber-js`)
- **Client** `src/utils/phoneNumber.ts` — add:
  - `parsePhoneToE164(nationalOrIntl: string, country: CountryCode): string | null` — `parsePhoneNumber(input, country)`; return `.number` (E.164) when `.isValid()`, else null. Accepts both a national number (with the selected country) and a pasted `+…` intl number.
  - `DEFAULT_COUNTRY = 'JO'`.
  - KEEP `toE164Jordan` unchanged (deliveryAddress + AppContext:2539 still use it).
- **Server** `functions/whatsappOtp.js` — add `normalizePhone(input): string | null` = `parsePhoneNumber(String(input||'')).number` when valid, else null (input is already E.164 from the client; validate + canonicalize). KEEP `normalizeJordanPhone` (in case anything else references it) but the callables switch to `normalizePhone`.

### Country selector
- `src/components/ui/PhoneInput.tsx` — a controlled input: a country button (flag + `+dial`) that opens a searchable list (`getCountries()` from libphonenumber-js → `{iso2, dialCode: getCountryCallingCode(iso2), name: Intl.DisplayNames(lang).of(iso2), flag}`), plus the national-number text field. Emits `{ country: CountryCode, national: string, e164: string|null }` via onChange (e164 computed with `parsePhoneToE164`). Default country 🇯🇴 JO. Search filters by name/dialcode/iso. Bilingual; app-styled (no third-party UI CSS); smooth ease-out.
- Flag emoji: ISO2 → regional-indicator code points.

### Wire-in
Replace the raw `type="tel"` inputs + `toE164Jordan(...)` calls in **LoginView** (WhatsApp + SMS-fallback paths) and **ContactCompletionModal** with `<PhoneInput>`; use its emitted `e164` for `requestWhatsappOtp`/`loginWithPhone`/`attachWhatsappPhone`. Update the "Jordanian mobile" validation copy to a generic "enter a valid phone number". Persist the selected country in component state; default JO.

### Server callables
`requestWhatsappOtp` / `verifyWhatsappOtp` / `attachWhatsappPhone`: swap `normalizeJordanPhone(data.phone)` → `normalizePhone(data.phone)`. Everything downstream (doc-id = E.164 digits, hash, rate-limit, custom token, updateUser) is already country-agnostic — only the normalization gate changes. Invalid E.164 → `invalid-argument` as today.

## Product note
This **opens signup globally** — anyone with a valid phone (any country) can create an account via WhatsApp OTP or SMS. Intended.

## Slices
- **A — Shared parsing:** add `libphonenumber-js` to client + functions package.json; `parsePhoneToE164` (client) + `normalizePhone` (server) + country-list helper; unit-tested (JO local + intl, US, UK, invalid, paste-with-+).
- **B — Server callables:** the 3 OTP callables switch to `normalizePhone`. Auth-path review (E.164 validation is solid, no bypass, no Jordan assumption left).
- **C — Client selector + wire-in:** `PhoneInput` component + LoginView (WhatsApp + SMS) + ContactCompletionModal. Customer-facing → Vercel preview.

## Testing / rollout
- Pure parsing unit-tested (client + server). Server callable change → auth-path cross-model review. UI → Vercel preview (test a JO number AND an intl number end-to-end).
- Bundle: `libphonenumber-js` default (min metadata) is sufficient for isValid + E.164; acceptable size on the auth surface.

## Deferred / out of scope
- `deliveryAddress.ts` + `AppContext.tsx:2539` stay Jordan-specific (physical delivery).
- Per-country SMS/WhatsApp cost or number-type restrictions (e.g. block VoIP) — not now.
- Country allow-list / geo-restrictions — all countries allowed for v1.
