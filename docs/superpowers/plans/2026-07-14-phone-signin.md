# Phone Sign-In (SMS OTP) Implementation Plan (Phase 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let users sign in with their phone number via Firebase Phone Auth (SMS one-time code), as a NEW option alongside the existing email/password + Google sign-in — promoted as the primary path for WhatsApp users.

**Architecture:** Add `loginWithPhone(phoneE164, appVerifier)` and `confirmPhoneCode(confirmationResult, code)` to `AppContext`, mirroring the existing `loginWithGoogle` pattern (session-id localStorage set before sign-in; `firebase/auth` phone APIs lazy-imported like the Facebook handler). The `onAuthStateChanged` new-user doc-creation path becomes phone-aware so a phone-only user (no email) gets a valid `users/{uid}` doc. A security-scoped `firestore.rules` change adds a phone-identity branch to the user-doc create rule while keeping every existing anti-privilege-escalation guard. A pure Jordanian-number normalizer converts `07xxxxxxxx` → E.164 `+9627xxxxxxxx`. `LoginView` gets a "Continue with phone number" flow (enter number → reCAPTCHA → SMS code → verify).

**Tech Stack:** React 19 + TS + Vite + Firebase Auth (Phone provider). Vitest for the pure normalizer.

## Global Constraints

- **Additive, non-destructive:** do NOT remove or alter the existing `login`, `loginWithGoogle` (the colleague's popup+redirect at `AppContext.tsx:1835-1855`), `logout`, or `registerUser`. Phone auth is a new, parallel path.
- **SMS-first:** use Firebase's built-in `signInWithPhoneNumber` + `RecaptchaVerifier`. No WhatsApp-OTP, no magic-link this phase.
- **Security (critical):** the `firestore.rules` user-create change MUST keep the existing guards verbatim — `request.auth.uid == userId`, the `!hasAny(['isAdmin','isBlocked','isVerified','subscriptionStatus','subscriptionExpiry','wonCount'])` block, and `role == 'user'` for non-admins. Only ADD a phone-identity alternative to the email-identity check. A phone user (no email token) must NEVER be able to reach the admin-role branch.
- **Session pattern:** set `localStorage['mazad_session_id']` and `localStorage['mazad_last_login_time']` BEFORE the sign-in completes (mirror `AppContext.tsx:1838-1840`), or the 10s session-grace logic at `AppContext.tsx:674-680` misfires.
- **E.164:** Firebase requires E.164 (`+962...`). Convert the Jordanian `07xxxxxxxx` UI input before calling `signInWithPhoneNumber`. The written `phoneNumber` field must equal the token's `phone_number` (E.164) so the rule matches.
- **Lazy import** the phone `firebase/auth` symbols (`RecaptchaVerifier`, `signInWithPhoneNumber`) like the Facebook handler at `LoginView.tsx:79-80`, to keep bundle behavior consistent.
- **i18n/RTL:** inline `isAr ? ... : ...`; brand accent `#FF6B00`; inputs `h-11 rounded-xl border-gray-200 focus:border-[#FF6B00]`.
- **Verification limits:** the live OTP flow can't be exercised without enabling Phone Auth in the Firebase Console (a human step) + a real/test number. Code tasks verify via `npm run lint` + `npm run build` + the normalizer's unit tests; the end-to-end OTP flow is a documented human test.

## Human setup (NOT a code task — flag in final summary)
In the Firebase Console for project `mazadjoapp`: Authentication → Sign-in method → enable **Phone**; add the Vercel domain(s) + `localhost` to **Authorized domains**; optionally add **test phone numbers** for QA without real SMS.

---

### Task 1: Jordanian phone → E.164 normalizer (pure, TDD)

**Files:**
- Create: `src/utils/phoneNumber.ts`
- Test: `src/utils/phoneNumber.test.ts`

**Interfaces:**
- Produces: `export function toE164Jordan(input: string): string | null` — normalizes a Jordanian mobile number to `+962XXXXXXXXX`; returns `null` if it can't be made into a valid Jordanian mobile.

- [ ] **Step 1: Write the failing test**

Create `src/utils/phoneNumber.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { toE164Jordan } from './phoneNumber';

describe('toE164Jordan', () => {
  it('converts local 07xxxxxxxx to E.164', () => {
    expect(toE164Jordan('0791234567')).toBe('+962791234567');
    expect(toE164Jordan('079 123 4567')).toBe('+962791234567');
  });
  it('accepts already-E.164 and 00962 forms', () => {
    expect(toE164Jordan('+962791234567')).toBe('+962791234567');
    expect(toE164Jordan('00962791234567')).toBe('+962791234567');
    expect(toE164Jordan('962791234567')).toBe('+962791234567');
  });
  it('accepts local without leading zero (7xxxxxxxx)', () => {
    expect(toE164Jordan('791234567')).toBe('+962791234567');
  });
  it('rejects invalid input', () => {
    expect(toE164Jordan('')).toBeNull();
    expect(toE164Jordan('12345')).toBeNull();
    expect(toE164Jordan('06123456')).toBeNull(); // landline, not a 7x mobile
    expect(toE164Jordan('notaphone')).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`npx vitest run src/utils/phoneNumber.test.ts`).

- [ ] **Step 3: Implement**

Create `src/utils/phoneNumber.ts`:
```ts
// Jordanian mobile numbers are 9 digits national, starting with 7 (07XXXXXXXX locally).
// Normalize common input shapes to E.164: +9627XXXXXXXX.
export function toE164Jordan(input: string): string | null {
  if (!input) return null;
  let d = input.replace(/[^\d]/g, ''); // strip spaces, +, dashes
  // strip international prefixes down to the national number
  if (d.startsWith('00962')) d = d.slice(5);
  else if (d.startsWith('962')) d = d.slice(3);
  else if (d.startsWith('0')) d = d.slice(1); // local 0-prefix
  // national mobile must now be 9 digits starting with 7
  if (!/^7\d{8}$/.test(d)) return null;
  return `+962${d}`;
}
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Typecheck** (`npm run lint`) — clean.
- [ ] **Step 6: Commit**
```bash
cd /Users/mj/code/mazadjo
git add src/utils/phoneNumber.ts src/utils/phoneNumber.test.ts
git commit -m "feat(phone-auth): add Jordanian phone -> E.164 normalizer"
```

---

### Task 2: Firestore rule — allow phone-auth users to create their profile (SECURITY-SCOPED)

**Files:**
- Modify: `firestore.rules` (the `users/{userId}` `allow create` rule at ~:32-37)

**Interfaces:** none (security rule).

- [ ] **Step 1: Read the current rule**

Read `firestore.rules:32-37`. It currently gates create on `'email' in request.auth.token && request.resource.data.email == request.auth.token.email`, which blocks phone-only users (no email claim).

- [ ] **Step 2: Replace the identity check with email-OR-phone (keeping all other guards)**

Replace the `allow create` block for `users/{userId}` with:
```
      allow create: if request.auth != null && request.auth.uid == userId &&
        !request.resource.data.keys().hasAny(['isAdmin','isBlocked','isVerified','subscriptionStatus','subscriptionExpiry','wonCount']) &&
        request.auth.token != null &&
        (
          ('email' in request.auth.token && request.resource.data.email == request.auth.token.email) ||
          ('phone_number' in request.auth.token && request.resource.data.phoneNumber == request.auth.token.phone_number)
        ) &&
        (
          request.resource.data.role == 'user' ||
          (request.resource.data.role == 'admin' && 'email' in request.auth.token && request.auth.token.email.matches('(?i)admaaqaba06@gmail\\.com'))
        );
```
Key security points to preserve/verify:
- `request.auth.uid == userId` — unchanged (self only).
- `!...hasAny([...])` — unchanged; still blocks self-granting `isAdmin`/`isBlocked`/`isVerified`/subscription/`wonCount`.
- The admin-role branch now REQUIRES `'email' in request.auth.token` before matching the admin email — so a phone-only user (no email claim) can NEVER create an `admin` doc.
- A phone user can only create a doc whose `phoneNumber` equals their verified token `phone_number` (E.164), and only with `role == 'user'`.

- [ ] **Step 3: Sanity-check the rules file parses**

Run: `cd /Users/mj/code/mazadjo && npx firebase --version >/dev/null 2>&1 && npx firebase deploy --only firestore:rules --dry-run 2>&1 | tail -5 || echo "firebase CLI not available locally — rules validated by review + deploy-time"`
(If the CLI isn't available, this is verified by review + at deploy time; note it in the report.)

- [ ] **Step 4: Commit**
```bash
cd /Users/mj/code/mazadjo
git add firestore.rules
git commit -m "feat(phone-auth): allow phone-verified users to create their user doc"
```

---

### Task 3: AppContext — phone sign-in methods + phone-aware new-user doc

**Files:**
- Modify: `src/context/AppContext.tsx` — add `loginWithPhone` + `confirmPhoneCode` (near `loginWithGoogle` ~:1835); add both to the context interface (~:145-148) and provider value (~:3894-3897); make the `onAuthStateChanged` new-user doc write (~:640-663) phone-aware.

**Interfaces:**
- Consumes: `toE164Jordan` is applied in the UI (Task 4) — this task receives an already-E.164 string.
- Produces (add to the context type + value):
  - `loginWithPhone: (phoneE164: string, appVerifier: import('firebase/auth').ApplicationVerifier) => Promise<import('firebase/auth').ConfirmationResult>`
  - `confirmPhoneCode: (confirmation: import('firebase/auth').ConfirmationResult, code: string) => Promise<{ success: boolean; message: string }>`

- [ ] **Step 1: Add the two methods (mirror loginWithGoogle)**

After `loginWithGoogle` (~`:1855`), add:
```ts
  const loginWithPhone = useCallback(async (phoneE164: string, appVerifier: any) => {
    const { signInWithPhoneNumber } = await import('firebase/auth');
    const newSessionId = generateSessionId();
    localStorage.setItem('mazad_session_id', newSessionId);
    localStorage.setItem('mazad_last_login_time', String(Date.now()));
    // Returns a ConfirmationResult; the UI then calls confirmPhoneCode with the SMS code.
    return signInWithPhoneNumber(auth, phoneE164, appVerifier);
  }, []);

  const confirmPhoneCode = useCallback(async (confirmation: any, code: string) => {
    try {
      await confirmation.confirm(code); // signs the user in -> onAuthStateChanged creates the doc
      return { success: true, message: '' };
    } catch (e: any) {
      const msg = e?.code === 'auth/invalid-verification-code'
        ? 'Invalid code'
        : (e?.message || 'Verification failed');
      return { success: false, message: msg };
    }
  }, []);
```
(Use `generateSessionId()` — the same helper `loginWithGoogle` uses. Type the params `any` to avoid importing types eagerly; the UI passes a real `RecaptchaVerifier`/`ConfirmationResult`.)

- [ ] **Step 2: Expose them on the context**

In the context interface (near `:145-148`), add:
```ts
  loginWithPhone: (phoneE164: string, appVerifier: any) => Promise<any>;
  confirmPhoneCode: (confirmation: any, code: string) => Promise<{ success: boolean; message: string }>;
```
In the provider value object (near `:3894-3897`), add `loginWithPhone, confirmPhoneCode,`.

- [ ] **Step 3: Make the new-user doc write phone-aware**

In the `onAuthStateChanged` handler's new-user creation block (~`:640-663`), where `freshUserDoc` is built with `email: firebaseUser.email || ''` and `phoneNumber/phone: firebaseUser.phoneNumber || ''`, ensure a phone-only user gets a rule-passing doc:
- Set `phoneNumber: firebaseUser.phoneNumber || ''` and `phone: firebaseUser.phoneNumber || ''` (already present — confirm).
- ADD `normalizedPhone: (firebaseUser.phoneNumber || '').replace(/\D/g, '')` to the doc (the duplicate-check + other code expect it; `registerUser` writes it at `:1933`).
- Keep `email: firebaseUser.email || ''` — the relaxed rule's phone branch matches on `phoneNumber == token.phone_number`, so an empty email is fine for phone users.
- Derive `name`: if no email, prefer the phone number as the display name fallback instead of `'User'` (e.g. `firebaseUser.displayName || firebaseUser.email?.split('@')[0] || firebaseUser.phoneNumber || 'User'`).
Confirm `role: 'user'` is set (required by the rule).

- [ ] **Step 4: Typecheck + tests**

Run: `cd /Users/mj/code/mazadjo && npm run lint && npx vitest run`
Expected: clean; all pure tests pass.

- [ ] **Step 5: Commit**
```bash
cd /Users/mj/code/mazadjo
git add src/context/AppContext.tsx
git commit -m "feat(phone-auth): add loginWithPhone/confirmPhoneCode + phone-aware user doc"
```

---

### Task 4: LoginView — "Continue with phone number" flow

**Files:**
- Modify: `src/components/LoginView.tsx`

**Interfaces:**
- Consumes: `loginWithPhone`, `confirmPhoneCode` (Task 3); `toE164Jordan` (Task 1).

- [ ] **Step 1: Read the current LoginView layout**

Read `src/components/LoginView.tsx` — the social block (~:203-228, Google button at :206-214, Facebook lazy-import handler at :63-92 as the template), the styling conventions, and how it pulls from `useApp()` (~:36-44).

- [ ] **Step 2: Add phone-auth state + handlers**

Add to the component (following the Facebook handler's lazy-import + session pattern):
```tsx
import { toE164Jordan } from '../utils/phoneNumber';
// ...
const { loginWithPhone, confirmPhoneCode /* plus existing */ } = useApp();
const [phoneMode, setPhoneMode] = useState(false);
const [phoneInput, setPhoneInput] = useState('');
const [smsCode, setSmsCode] = useState('');
const [confirmation, setConfirmation] = useState<any>(null);
const [phoneBusy, setPhoneBusy] = useState(false);
const [phoneErr, setPhoneErr] = useState('');
const recaptchaRef = useRef<any>(null);

const sendCode = async () => {
  setPhoneErr('');
  const e164 = toE164Jordan(phoneInput);
  if (!e164) { setPhoneErr(isAr ? 'رقم هاتف أردني غير صالح' : 'Enter a valid Jordanian mobile number'); return; }
  setPhoneBusy(true);
  try {
    const { RecaptchaVerifier } = await import('firebase/auth');
    const { auth } = await import('../services/firebase');
    if (!recaptchaRef.current) {
      recaptchaRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible' });
    }
    const result = await loginWithPhone(e164, recaptchaRef.current);
    setConfirmation(result);
  } catch (e: any) {
    setPhoneErr(e?.message || (isAr ? 'تعذّر إرسال الرمز' : 'Could not send code'));
    try { recaptchaRef.current?.clear?.(); recaptchaRef.current = null; } catch {}
  } finally {
    setPhoneBusy(false);
  }
};

const verifyCode = async () => {
  setPhoneErr('');
  if (!confirmation || smsCode.trim().length < 4) { setPhoneErr(isAr ? 'أدخل الرمز' : 'Enter the code'); return; }
  setPhoneBusy(true);
  const res = await confirmPhoneCode(confirmation, smsCode.trim());
  setPhoneBusy(false);
  if (!res.success) setPhoneErr(res.message === 'Invalid code' ? (isAr ? 'رمز غير صحيح' : 'Invalid code') : res.message);
  // on success, onAuthStateChanged flips isAuthenticated and the app renders the main shell
};
```
Ensure `useState`, `useRef` are imported from react.

- [ ] **Step 3: Add the UI (promoted, above the Google/Facebook buttons)**

In the social block (~:203), add — as the FIRST/most-prominent option — a phone entry point, plus the reCAPTCHA container and the code-entry step:
```tsx
<div id="recaptcha-container" />
{!phoneMode ? (
  <button
    type="button"
    onClick={() => setPhoneMode(true)}
    className="w-full h-11 rounded-full bg-[#FF6B00] text-white font-bold flex items-center justify-center gap-2"
  >
    📱 {isAr ? 'المتابعة برقم الهاتف' : 'Continue with phone number'}
  </button>
) : (
  <div className="space-y-2">
    {!confirmation ? (
      <>
        <input
          type="tel" inputMode="tel" dir="ltr"
          className="w-full h-11 rounded-xl border border-gray-200 focus:border-[#FF6B00] px-3"
          placeholder="07xxxxxxxx"
          value={phoneInput}
          onChange={(e) => setPhoneInput(e.target.value)}
        />
        <button type="button" disabled={phoneBusy} onClick={sendCode}
          className="w-full h-11 rounded-full bg-[#FF6B00] text-white font-bold disabled:opacity-50">
          {phoneBusy ? (isAr ? 'جارٍ الإرسال...' : 'Sending...') : (isAr ? 'إرسال الرمز' : 'Send code')}
        </button>
      </>
    ) : (
      <>
        <input
          type="tel" inputMode="numeric" dir="ltr"
          className="w-full h-11 rounded-xl border border-gray-200 focus:border-[#FF6B00] px-3 tracking-widest text-center"
          placeholder={isAr ? 'رمز التحقق' : 'Verification code'}
          value={smsCode}
          onChange={(e) => setSmsCode(e.target.value)}
        />
        <button type="button" disabled={phoneBusy} onClick={verifyCode}
          className="w-full h-11 rounded-full bg-[#FF6B00] text-white font-bold disabled:opacity-50">
          {phoneBusy ? (isAr ? 'جارٍ التحقق...' : 'Verifying...') : (isAr ? 'تأكيد' : 'Verify')}
        </button>
      </>
    )}
    {phoneErr && <p className="text-red-600 text-xs">{phoneErr}</p>}
    <button type="button" onClick={() => { setPhoneMode(false); setConfirmation(null); setSmsCode(''); setPhoneErr(''); }}
      className="w-full text-xs text-gray-500">{isAr ? 'رجوع' : 'Back'}</button>
  </div>
)}
```
Keep the existing Google/Facebook buttons + email form below, unchanged.

- [ ] **Step 4: Typecheck + build**

Run: `cd /Users/mj/code/mazadjo && npm run lint && npm run build`
Expected: both clean/succeed.

- [ ] **Step 5: Verify in the running app (as far as possible)**

Run `npm run dev`; confirm the login screen shows "Continue with phone number", clicking it reveals the phone input, and the layout/RTL looks right. NOTE: actually sending an SMS requires Phone Auth enabled in the Firebase Console + authorized domain — flag the full OTP round-trip as a human test.

- [ ] **Step 6: Commit**
```bash
cd /Users/mj/code/mazadjo
git add src/components/LoginView.tsx
git commit -m "feat(phone-auth): phone sign-in UI (send + verify SMS code)"
```

---

## Notes for the executor
- **Do not touch** `loginWithGoogle`/`login`/`registerUser` logic — phone auth is parallel.
- **Line numbers are approximate** — read each region and match real names (`freshUserDoc`, `generateSessionId`, the provider value object).
- **reCAPTCHA**: `RecaptchaVerifier` needs a DOM container (`#recaptcha-container`) present when instantiated; invisible size avoids a visible widget. Clearing it on error (`.clear()`) prevents "reCAPTCHA already rendered" on retry.
- **Human steps before this works live** (final summary): enable Phone provider + authorized domains in the Firebase Console; test with a real or Console test number.
- **createListing / room / opener are untouched** by this phase.
