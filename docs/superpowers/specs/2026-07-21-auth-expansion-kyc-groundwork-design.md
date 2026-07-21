# Auth Expansion + Seller-KYC Groundwork — Design Spec

**Date:** 2026-07-21
**Status:** Approved (MJ + independent Fable review)
**Depends on:** the shipped app-simplification + activation pass (`2026-07-21-app-simplification-activation-design.md`)

## Goal

Expand sign-in beyond the phone-only screen so Mazad captures a real identity for
every user (name + city required, email optional/progressive), keep phone as the
identity anchor, add Google as a second path, and lay cheap, non-gating groundwork
for future seller KYC/compliance.

## Why

- **The login screen is actively broken.** `LoginView.tsx` still renders a "Sign up /
  Log in" tab switcher (`:257-277`) and the title "Join MAZAD JO!" (`:253`), but the
  email/password + Google + Facebook block was commented out (`:385-387`). Both tabs
  are dead — switching `mode` shows the same lone phone button. First impression on a
  pay-to-enter product reads as broken.
- **Phone signups are anonymous blanks.** Phone-created users get `name: 'User'`,
  `email: ''`, `city: ''` (`AppContext.tsx` ~`:659-712`). For a business that ships
  physical goods, a blank city is an operational gap; a blank name kills trust.
- **Compliance is coming.** Mazad will need seller KYC eventually (stolen goods, items
  forbidden in Jordan). The manual approval gate is today's control; we add cheap
  groundwork now so identity isn't retrofitted onto an anonymous seller base later.

## Non-goals / explicitly deferred

- **No formal KYC enforcement.** No ID upload, no selfie match, no seller gating in this
  pass. We only add the *data model* + *attestation* + *policy*. Enforcement triggers
  (self-serve volume beyond human review, high-value categories, incidents, tax
  thresholds) are documented for later, and a Jordanian lawyer must confirm regulatory
  triggers before enforcement ships.
- **No Facebook login.** The dead Facebook path is removed, not restored.
- **No email/password path.** Phone + Google only. The `handleSubmit`/email-password
  handlers and `mode` state are removed as dead code.
- **No CliQ payment-flow rework** (IBAN→alias/QR, copy-amount button, premium-math
  centralization). Those are separate Fable-flagged items on the backlog, not this pass.

## Global constraints

- Bilingual, **Arabic-default, RTL**. Every new string ships in both `ar` and `en` in
  `src/utils/translations.ts`. Arabic copy uses the warm Jordanian register already in
  the app ("يا هلا", 🌹). New Arabic numerals follow the app's existing convention on
  the surface they appear (do NOT introduce a new digit system — out of scope).
- No new dependencies. React 19 + Vite + TS + Tailwind v4 + Firebase only.
- `useApp()` returns `any` (known circular-import debt) — do not "fix" it here.
- Firestore-rule changes must not break existing writers. The rule change is deploy-gated
  by the CI "Deploy Firebase" workflow on merge to main.
- Verify each wave: `npx tsc --noEmit` (0 errors) · `npm run build` · `npx vitest run`
  (all green). Add unit tests for pure logic (governorate list, profile-completeness
  predicate, canonical constant).

---

## Wave 1 — Login screen repair (phone + Google, kill dead tabs)

**Files:** `src/components/LoginView.tsx`, `src/utils/translations.ts`

- Remove the `mode` state and the Sign up / Log in tab switcher (`:257-277`).
- Remove `handleSubmit`, `handleFacebookClick`, and the `FacebookIcon`, and all
  email/password + Facebook state/UI. Keep only phone + Google.
- Retitle to a single phone-first screen (e.g. AR "يا هلا فيك — سجّل دخولك" / EN
  "Welcome — sign in"), not a tab bar.
- Render **"المتابعة بـ Google" / "Continue with Google"** button wired to the existing
  `handleGoogleClick` → `loginWithGoogle()` (already in AppContext; unchanged).
- Keep the invisible reCAPTCHA anchor and the phone OTP panel exactly as-is (working).
- Fix the deep-link banner margin hack (`mt-16 -mb-12`, `:242`) so it can't collide with
  the card on small screens.

**Deliverable:** a login screen with two working paths (phone primary, Google secondary),
no dead controls.

---

## Wave 2 — Profile completion step (name / city required, email optional)

**Files:** new `src/components/ProfileCompletionModal.tsx`; `src/context/AppContext.tsx`;
new `src/utils/jordanCities.ts` (+ test); `src/utils/translations.ts`; `src/App.tsx`

- **`jordanCities.ts`** — the 12 Jordanian governorates as `{ id, ar, en }`
  (Amman/عمّان, Irbid/إربد, Zarqa/الزرقاء, Balqa/البلقاء, Mafraq/المفرق, Jerash/جرش,
  Ajloun/عجلون, Karak/الكرك, Tafilah/الطفيلة, Ma'an/معان, Aqaba/العقبة, Madaba/مادبا).
  Export a `CITY_IDS` union + a `isValidCityId(x)` guard. Unit-tested.
- **`isProfileComplete(user)`** predicate (export from `jordanCities.ts`): returns false
  when `!user || user.name === 'User' || !user.name || !user.city`. Email is NOT part of
  completeness. Unit-tested.
- **`ProfileCompletionModal`** — non-dismissable modal shown before Discovery when
  `!isProfileComplete(currentUser)`, for ALL auth paths (Google users still lack city).
  Renders only the missing fields:
  - **Name** (`الاسم`) — required; shown when name missing/'User'. (Google users skip.)
  - **City** (`المدينة`) — required, all paths; governorate dropdown.
  - **Email** (`الإيميل`) — optional; label "لإرسال الإيصالات — اختياري" / "for
    receipts — optional". Skippable. Only written when non-empty.
  - Warm header: "قبل ما تبلّش — عرّفنا عليك 🌹" / "Before you start — tell us about you".
- **AppContext:** add `updateOwnProfile({ name?, city?, email? })` that writes only the
  provided keys via `updateDoc` and mirrors into local `currentUser`/`users`. Email is
  written only if currently empty (client mirrors the rule). Route the modal from the
  authed shell (`App.tsx`) gated on `!isProfileComplete(currentUser)`.

**Deliverable:** every new/incomplete user is asked for name + city (email optional)
once, before they reach the marketplace.

---

## Wave 3 — Rules: one-time email claim + progressive email at win

**Files:** `firestore.rules`; `src/components/OrderDetailsView.tsx`;
`src/utils/translations.ts`

- **Rules change (load-bearing):** in the `/users/{userId}` update rule
  (`firestore.rules` ~`:45-55`), `email` is currently in the forbidden-`affectedKeys`
  list, freezing it forever. Relax so the **owner may claim email once, when currently
  empty**, still forbidding changes to a non-empty address and still blocking all other
  protected keys:
  ```
  allow update: if request.auth != null && (
    isAdmin() ||
    (<existing admin-email branch>) ||
    (request.auth.uid == userId &&
      !request.resource.data.diff(resource.data).affectedKeys().hasAny([
        'role','isAdmin','isBlocked','isVerified','isSeller',
        'subscriptionStatus','subscriptionExpiry','wonCount'   // 'email' removed here
      ]) &&
      // email may be set once when empty; never changed once set
      (request.resource.data.email == resource.data.email ||
       (resource.data.email == '' && request.resource.data.email is string))
    )
  );
  ```
  This must still let name/city updates through (they were never protected) and must not
  let a user change a non-empty email or forge any other protected field.
- **Progressive email:** in the win/receipt surface (`OrderDetailsView.tsx`), when the
  winner's `email` is empty, show a single inline prompt "وين نبعتلك الإيصال؟" / "Where
  should we send your receipt?" that calls `updateOwnProfile({ email })`. Highest-intent
  moment; supplements (never replaces) the required city captured in Wave 2.

**Deliverable:** email can be claimed once when empty (rules + client), and is asked for
at the receipt moment.

---

## Wave 4 — Seller-KYC groundwork (attestation, policy, data model, CliQ constant)

**Files:** `src/types.ts`; `src/components/ListingWizardView.tsx`;
`src/components/SellView.tsx` (concierge form); `src/context/AppContext.tsx`
(`createListing`); new `src/components/ProhibitedItemsView.tsx`;
new `src/constants/cliq.ts`; `src/components/OrderDetailsView.tsx`,
`src/components/WalletView.tsx`, `src/utils/translations.ts`

- **Attestation checkbox** — required in BOTH the self-serve wizard
  (`ListingWizardView.tsx`) and the concierge form (`SellView.tsx`): "أُقرّ بأن هذا
  الغرض ملكي وقانوني للبيع في الأردن" / "I confirm I own this item and it is legal to
  sell in Jordan." Submit is blocked until checked. `createListing` writes
  `ownershipAttested: true` + `attestedAt: <serverTimestamp>` onto the auction doc.
  These are extra keys — the auctions create rule has no `hasOnly`, so no rule change is
  needed (verify: they do not collide with any forbidden/forged-field guard).
- **`AuctionItem`** (`types.ts`): add `ownershipAttested?: boolean; attestedAt?: any`.
- **Prohibited-items policy page** — `ProhibitedItemsView`, routed via a new
  `activeView` case, linked from the Sell chooser (`SellView.tsx`) and How-It-Works.
  Enumerate JO-forbidden/regulated goods (weapons, antiquities/currency, medications,
  counterfeits, stolen goods, wildlife, etc.). Content only, bilingual.
- **Identity data model (unenforced):** add to `User` and `SellerProfile` in `types.ts`:
  `nationalNumber?: string` (الرقم الوطني), `legalName?: string`. No UI enforcement, no
  gating — schema only, so future KYC populates existing fields. (Do NOT add capture UI
  in this pass beyond what already exists.)
- **Canonical CliQ recipient** — `src/constants/cliq.ts` exports
  `CLIQ_RECIPIENT_NAME_AR` / `_EN` (single source for "مؤسسة مزاد الأردن م" / "MAZAD JO
  M"). Replace the scattered literals in `OrderDetailsView.tsx` + `WalletView.tsx` with
  the constant. Unit-test the constant is a non-empty string (guards against future
  accidental blanking on the money surface).

**Deliverable:** every listing carries a legality/ownership attestation; a prohibited-
items policy is published; the identity data model exists unenforced; the CliQ recipient
name has one source of truth.

---

## Future KYC triggers (documented, NOT built here)

Enforce formal seller KYC (ID capture + name/national-number verification, using the
existing `VerificationRequest` type in `types.ts`) when ANY trigger fires — Jordanian
lawyer to confirm the regulatory ones:

1. **Human review stops scaling** — self-serve listing volume exceeds what admins can
   eyeball per listing (primary trigger; the approval gate is no longer a real control).
2. **High-risk categories** — gate `channel: 'phones'` and `'cars'` behind verified
   sellers first (IMEI/stolen, ownership/registration transfer).
3. **Value/AML/tax thresholds** — single-lot or cumulative-payout lines (set with a
   lawyer/accountant) require national number on file for reporting.
4. **First incident / law-enforcement request** — reactive; the reason to build the data
   model early is to comply in hours, not weeks.

Sequencing: enforce on **sellers receiving payouts first** (money-out is the regulated
flow), keep buyers phone-only longest, pilot ID capture on already-known concierge
sellers before self-serve.

## Testing

- Unit: `jordanCities` (12 governorates, `isValidCityId`), `isProfileComplete` (blank
  name/'User'/blank city → false; email irrelevant), CliQ constant non-empty.
- Build/typecheck green each wave.
- Manual (post-deploy, MJ/colleague — Claude can't log into the authed app): phone
  signup → profile-completion asks name+city → lands on Discovery; Google signup →
  asks city only; win → receipt email prompt when email empty; list an item → attestation
  required; rules deploy → email-claim-once works, second change denied.

## Risk notes

- **Rules email-claim regex** is the highest-risk change — a mistake either strands email
  forever or opens spoofing. The `resource.data.email == '' && ... is string` guard plus
  the "unchanged OR was-empty" disjunction is the exact shape; the wave's reviewer must
  trace it against both a first-claim and a change-attempt.
- **Profile-completion modal must not trap Google users in a loop** — completeness must
  be satisfiable by the fields the modal actually shows (city for Google users).
- **Attestation fields must pass the hardened auctions create rule** — verify against the
  create guard that blocks forged fields; `ownershipAttested`/`attestedAt` are new
  buyer-neutral keys, not in any forbidden list.
