# Multi-Country Phone Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let anyone sign up / add a phone with a valid number from any country (was Jordan-only), via a country selector + libphonenumber-js validation on client and server.

**Architecture:** Client owns country selection + normalizes to E.164 and sends it; server validates any-country E.164. `libphonenumber-js` on both sides. Custom `PhoneInput` selector wired into the 3 auth inputs. The OTP callables swap their Jordan-only gate for a general E.164 gate; everything downstream is already country-agnostic.

**Tech Stack:** React 19 + Vite + TS + Firebase Functions + `libphonenumber-js` + Vitest.

## Global Constraints
- Keep `toE164Jordan` (client) + `normalizeJordanPhone` (server) intact — `deliveryAddress.ts`/`AppContext.tsx:2539` still use the Jordan one; only the AUTH paths generalize.
- Server callables validate E.164 robustly (invalid → `invalid-argument`); no Jordan assumption left in the OTP flow; no other change to the OTP security (rate-limit, single-use, custom-token all unchanged + still country-agnostic).
- `functions/whatsappOtp.js` may now import `libphonenumber-js` (a plain npm lib, NOT firebase) — root Vitest still loads it fine.
- Test globs: `src/**/*.test.ts(x)`, `functions/**/*.test.js`.
- Worktree `/tmp/mazzado-intl`, branch `feat/multi-country-phone` (spec committed).

---

## Slice A — Shared parsing

### Task A1: add libphonenumber-js + client phone helpers
**Files:** `package.json` (add dep), `src/utils/phoneNumber.ts` (append), `src/utils/phoneNumber.test.ts` (new/append), `src/utils/countryData.ts` (new) + its test.
**Interfaces:** `parsePhoneToE164(input, country) -> string|null`, `DEFAULT_COUNTRY='JO'`, `getCountryList() -> {iso2, dialCode, name, flag}[]`.

- [ ] **Step 1: add dep** — `cd /tmp/mazzado-intl && npm install libphonenumber-js` (adds to root package.json; the symlinked node_modules is shared with the main repo — run install so it's actually present). Confirm it resolves: `node -e "require('libphonenumber-js')"`.
- [ ] **Step 2: failing test** — `src/utils/phoneNumber.test.ts` (append or create):
```ts
import { describe, it, expect } from 'vitest';
import { parsePhoneToE164 } from './phoneNumber';

describe('parsePhoneToE164', () => {
  it('Jordan local + intl', () => {
    expect(parsePhoneToE164('0791234567', 'JO')).toBe('+962791234567');
    expect(parsePhoneToE164('791234567', 'JO')).toBe('+962791234567');
    expect(parsePhoneToE164('+962791234567', 'JO')).toBe('+962791234567');
  });
  it('US number', () => {
    expect(parsePhoneToE164('9084058109', 'US')).toBe('+19084058109');
    expect(parsePhoneToE164('+19084058109', 'JO')).toBe('+19084058109'); // pasted intl wins
  });
  it('UK number', () => {
    expect(parsePhoneToE164('07400123456', 'GB')).toBe('+447400123456');
  });
  it('rejects invalid', () => {
    expect(parsePhoneToE164('123', 'JO')).toBeNull();
    expect(parsePhoneToE164('', 'US')).toBeNull();
    expect(parsePhoneToE164('notaphone', 'JO')).toBeNull();
  });
});
```
- [ ] **Step 3: run red** — `npx vitest run src/utils/phoneNumber.test.ts` → FAIL.
- [ ] **Step 4: implement** — append to `src/utils/phoneNumber.ts` (keep the existing `toE164Jordan`):
```ts
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

export const DEFAULT_COUNTRY: CountryCode = 'JO';

/** Parse a national number (with the selected country) OR a pasted +intl number
 *  to E.164, or null if not a valid phone number. */
export function parsePhoneToE164(input: string, country: CountryCode): string | null {
  if (!input || !input.trim()) return null;
  try {
    const p = parsePhoneNumberFromString(input.trim(), country);
    return p && p.isValid() ? p.number : null;
  } catch {
    return null;
  }
}
```
- [ ] **Step 5: run green** — `npx vitest run src/utils/phoneNumber.test.ts` → PASS.
- [ ] **Step 6: country list + test** — `src/utils/countryData.ts`:
```ts
import { getCountries, getCountryCallingCode, type CountryCode } from 'libphonenumber-js';

export interface CountryOption { iso2: CountryCode; dialCode: string; name: string; flag: string; }

/** ISO2 -> flag emoji via regional-indicator code points. */
export function flagFor(iso2: string): string {
  return iso2.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

/** All dialable countries, names localized to `lang` via Intl.DisplayNames. */
export function getCountryList(lang: 'en' | 'ar' = 'en'): CountryOption[] {
  const dn = new Intl.DisplayNames([lang], { type: 'region' });
  return getCountries()
    .map((iso2) => ({
      iso2,
      dialCode: `+${getCountryCallingCode(iso2)}`,
      name: dn.of(iso2) || iso2,
      flag: flagFor(iso2),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
```
Test `src/utils/countryData.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { getCountryList, flagFor } from './countryData';

describe('countryData', () => {
  it('flagFor JO', () => { expect(flagFor('JO')).toBe('🇯🇴'); });
  it('list includes JO/US/GB with dial codes', () => {
    const list = getCountryList('en');
    const jo = list.find((c) => c.iso2 === 'JO');
    const us = list.find((c) => c.iso2 === 'US');
    expect(jo?.dialCode).toBe('+962');
    expect(us?.dialCode).toBe('+1');
    expect(list.length).toBeGreaterThan(100);
  });
});
```
- [ ] **Step 7: green** — `npx vitest run src/utils/countryData.test.ts` → PASS.
- [ ] **Step 8: commit** — `git add package.json package-lock.json src/utils/phoneNumber.ts src/utils/phoneNumber.test.ts src/utils/countryData.ts src/utils/countryData.test.ts && git commit -m "feat(phone): libphonenumber-js parse + country list helpers"`

---

### Task A2: server normalizePhone
**Files:** `functions/package.json` (add dep), `functions/whatsappOtp.js` (add `normalizePhone` + export), `functions/whatsappOtp.test.js` (append).
**Interfaces:** `normalizePhone(input) -> e164 | null` (any-country).

- [ ] **Step 1: add dep** — `cd /tmp/mazzado-intl/functions && npm install libphonenumber-js` (functions has its own package.json/node_modules). Confirm `node -e "require('libphonenumber-js')"` in functions/.
- [ ] **Step 2: failing test** — append to `functions/whatsappOtp.test.js`:
```js
const { normalizePhone } = require('./whatsappOtp');
describe('normalizePhone (any country)', () => {
  it('validates + canonicalizes E.164', () => {
    expect(normalizePhone('+962791234567')).toBe('+962791234567');
    expect(normalizePhone('+19084058109')).toBe('+19084058109');
    expect(normalizePhone('962791234567')).toBe('+962791234567'); // missing + tolerated
  });
  it('rejects invalid', () => {
    expect(normalizePhone('123')).toBeNull();
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
});
```
- [ ] **Step 3: red** — `npx vitest run functions/whatsappOtp.test.js` → FAIL.
- [ ] **Step 4: implement** — in `functions/whatsappOtp.js` add (and export alongside the rest):
```js
const { parsePhoneNumberFromString } = require('libphonenumber-js');
// Any-country E.164 validator: the client sends a full E.164 (it owns country
// selection); we validate + canonicalize. Tolerates a missing leading '+'.
function normalizePhone(input) {
  if (!input) return null;
  let s = String(input).trim();
  if (!s.startsWith('+')) s = `+${s.replace(/[^\d]/g, '')}`;
  const p = parsePhoneNumberFromString(s);
  return p && p.isValid() ? p.number : null;
}
```
Add `normalizePhone` to `module.exports`.
- [ ] **Step 5: green** — `npx vitest run functions/whatsappOtp.test.js` → PASS.
- [ ] **Step 6: commit** — `git add functions/package.json functions/package-lock.json functions/whatsappOtp.js functions/whatsappOtp.test.js && git commit -m "feat(phone): server normalizePhone (any-country E.164)"`

---

## Slice B — Server callables

### Task B1: OTP callables use normalizePhone
**Files:** `functions/index.js`.
- [ ] **Step 1:** Add `normalizePhone` to the `require('./whatsappOtp')` destructure (line ~6, alongside `normalizeJordanPhone` — keep both imported).
- [ ] **Step 2:** In `requestWhatsappOtp` (~:4679), `verifyWhatsappOtp` (~:4747), `attachWhatsappPhone` (~:4812): change `const e164 = normalizeJordanPhone(data && data.phone);` → `const e164 = normalizePhone(data && data.phone);`. Nothing else in those callables changes (doc-id/hash/rate-limit/token/updateUser are all country-agnostic).
- [ ] **Step 3: verify** — `node -c functions/index.js`; `npx vitest run` (existing suite still green). Grep the 3 callables: they now use `normalizePhone`, and still ZERO wallet/ledger writes; the security invariants (transactional guards, single-use, token-only-after-verify) are untouched.
- [ ] **Step 4: commit** — `git add functions/index.js && git commit -m "feat(phone): OTP callables accept any-country E.164"`

---

## Slice C — Client selector + wire-in

### Task C1: PhoneInput component
**Files:** `src/components/ui/PhoneInput.tsx` (new).
**Interfaces:** `<PhoneInput value={{country,national}} onChange={(v:{country:CountryCode; national:string; e164:string|null})=>void} lang autoFocus? disabled? />`.
- [ ] **Step 1: build** — a controlled component: left = a country button showing `flag +dial` that toggles a searchable dropdown (list from `getCountryList(lang)`, filter by name/dialCode/iso2); right = a `type="tel" inputMode="tel"` national-number field. On any change, compute `e164 = parsePhoneToE164(national, country)` and call `onChange({country, national, e164})`. Default country `DEFAULT_COUNTRY` ('JO'). App-styled (match the existing input styling in LoginView), bilingual placeholder, smooth ease-out dropdown, closes on outside-click/Esc, keyboard accessible. No third-party UI CSS. Reasonable dropdown height + scroll.
- [ ] **Step 2: verify** — `npx tsc --noEmit`, `npm run build` clean. (No unit test for the component; covered by A1 helpers + preview.)
- [ ] **Step 3: commit** — `git add src/components/ui/PhoneInput.tsx && git commit -m "feat(phone): PhoneInput country selector component"`

### Task C2: wire PhoneInput into the auth inputs
**Files:** `src/components/LoginView.tsx`, `src/components/ContactCompletionModal.tsx`.
- [ ] **Step 1: LoginView** — replace the raw phone `type="tel"` input(s) with `<PhoneInput>`; keep the selected `{country, national, e164}` in state. In `handleWaSendCode`/`handleSendCode` (and the SMS verify path), use the state `e164` (from PhoneInput) instead of `toE164Jordan(phoneInput)`; if `e164` is null show a generic "enter a valid phone number" error (bilingual). The WhatsApp + SMS-fallback paths share the one PhoneInput/country state. Remove the now-unused `toE164Jordan` import if nothing else in the file uses it.
- [ ] **Step 2: ContactCompletionModal** — same: replace the phone `type="tel"` input with `<PhoneInput>`; use its `e164` for `requestWhatsappOtp`/`attachWhatsappPhone`; generic invalid-phone copy. Email path untouched.
- [ ] **Step 3: verify** — `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npx vitest run` all green.
- [ ] **Step 4: commit** — `git add -A && git commit -m "feat(phone): country selector in login + contact-completion inputs"`

---

### Task D1: full green + PR
- [ ] `node -c functions/index.js && npx tsc --noEmit && npm run lint && npm run build && npx vitest run` — green.
- [ ] Push; open DRAFT PR (base main). Body: opens signup to any country, libphonenumber-js on client+server, PhoneInput selector, the 3 auth inputs + 3 OTP callables generalized, deliveryAddress stays Jordan-only, product note (global signup).
- [ ] Cross-model auth-path review of the callable change: `normalizePhone` validation is solid (no bypass, rejects junk), the OTP security invariants are unchanged, no Jordan assumption remains.
- [ ] Report to MJ with the Vercel preview URL — test a JO number AND an international number (e.g. a US number) end-to-end (WhatsApp OTP + SMS fallback).

---

## Self-Review
- **Spec coverage:** client parse + country list (A1), server normalize (A2), callables (B1), selector (C1) + wire-in (C2). deliveryAddress/AppContext:2539 left Jordan-only. ✓
- **Interfaces:** `parsePhoneToE164`/`getCountryList` (A1) feed PhoneInput (C1); `normalizePhone` (A2) feeds the callables (B1); PhoneInput (C1) wired in C2. ✓
- **Security:** OTP invariants (transactions, single-use, token-only-after-verify, zero money writes) unchanged — only the normalization gate generalizes. ✓
