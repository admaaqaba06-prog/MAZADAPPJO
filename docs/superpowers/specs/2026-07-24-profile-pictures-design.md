# Profile Pictures — Design (owner-approved)

Date: 2026-07-24
Branch: `feat/profile-pictures`

Adds real profile photos to Mazad JO. Four parts, plus the key product decisions.

## Key decisions (owner-approved)

- **Geometric placeholder, not stock photos.** Every avatar fallback becomes a
  deterministic, on-brand geometric SVG (identicon vibe) seeded from the user's
  id. No image assets, no more shared Unsplash stock faces.
- **A real, custom-uploaded photo is required to bid or sell** — enforced
  **client-side** at the two action points, plus a gentle Profile nudge. The
  server `placeBid` / bid transaction is **NOT** touched.
- **Not forced at onboarding.** `ProfileCompletionModal` (name + city) stays as
  is. Browsing/watching stays frictionless. The photo ask happens the moment a
  user tries to bid or sell, and as a soft card on Profile.

## Part 1 — Generative geometric placeholder avatar

- Pure util `src/utils/avatarPlaceholder.ts`:
  - `placeholderAvatarDataUri(seed: string): string` → inline
    `data:image/svg+xml,...` data URI. Deterministic: an FNV-1a hash of the seed
    feeds a mulberry32 PRNG that picks a warm on-brand gradient + a few colored
    geometric shapes (circles / triangles / rounded rects) placed from the seed.
    Same seed → identical output; different seeds → different. On-brand palette
    (oranges `#FF6B00` / `#E85D04` + warm accents amber/red-orange).
  - `isRealPhotoUrl(url)` core predicate; `hasRealPhoto(user)` wraps it.
  - `resolveAvatarUrl(url, seed)` and `resolveAvatar(user)` — return the real
    photo if present, else the seeded placeholder.
  - TDD'd for determinism + valid data URI (`avatarPlaceholder.test.ts`).
- Replaces the hardcoded Unsplash avatar fallbacks at the customer-facing sites:
  ProfileView (big avatar), DesktopFrame header avatars (top bar + drawer),
  MobileLiveAuctionLayout (reel seller chip + chat), DesktopLiveAuctionLayout,
  ReelsDesktopRightPanel (seller logo, chat, bids), SellerProfileModal (store
  logo + review buyers), SellerCenterView review buyers, OrderDetailsView seller
  logo. Product-image fallbacks (auction thumbnails) are left unchanged.

## Part 2 — Upload own photo (on Profile)

- ProfileView avatar becomes a tap-to-change control (camera overlay + a11y
  label). Flow: `<input type="file" accept="image/*" capture>` → center-crop to
  square + resize/compress to ~512px via the existing `src/utils/resizeImage.ts`
  → upload to Firebase Storage `avatars/{uid}/avatar_{ts}.jpg` (same
  `getFirebaseStorage()` + `uploadBytesResumable` + `getDownloadURL` pattern the
  listing media uses) → `updateDoc(users/{uid}, { avatar: url })`. Live preview,
  upload progress, and error handling (wrong type, too large, network).
- Shared `useAvatarUpload` hook so ProfileView and the PhotoGate use one flow.
- **Rules:** `firestore.rules` self-update already allows a user to write their
  own `users/{uid}.avatar` (avatar is not in any denylisted field set) — no
  change needed. `storage.rules` had **no** `avatars/` path (default deny), so a
  tight rule is added: `match /avatars/{userId}/{fileName}` — public read, owner
  write, image-only, ≤10MB. This is the one approved rules change.

## Part 3 — Trust gate (client-side) to bid or sell

- Pure `hasRealPhoto(user)`: true iff `user.avatar` is a genuine http(s) URL,
  not empty, not a `data:` URI (the generated placeholder is never stored), and
  not one of the old hardcoded Unsplash placeholder URLs (excluded explicitly).
  Google-signin photos count as real.
- Pure `resolveBidGate({ isAuthenticated, isMember, hasPhoto })` →
  `'signin' | 'membership' | 'photo' | 'proceed'`. **Order:** sign-in (guest) →
  membership (non-member) → photo (member without a real photo) → proceed. Lives
  in `guestGate.ts` next to `resolveBidTap`; TDD'd in `guestGate.test.ts`.
- **Bid:** `useBidFlow.startBid` consults `resolveBidGate`. A member with no
  photo triggers `setShowPhotoGate(true)` instead of staging the confirm. The
  server bid path is untouched.
- **Sell:** SellView, on mount, if an authed user lacks a real photo, triggers
  the same photo gate before any listing action.
- **PhotoGatePrompt** component (mirrors `SubscriptionPromptModal`): a friendly
  sheet with the trust "why" + an inline "Add photo" uploader (reuses
  `useAvatarUpload`). On successful upload it dismisses so the user can retry
  their action.
- `showPhotoGate` / `setShowPhotoGate` added to AppContext (mirrors the
  subscription-prompt plumbing); `<PhotoGatePrompt>` rendered in the app shell
  beside `<SubscriptionPromptModal>`.

## Part 4 — Profile nudge + "why" copy

- On ProfileView, when `!hasRealPhoto(currentUser)`, a gentle card near the
  avatar shows the trust why + "Add your photo" CTA (opens the uploader).
- Copy (EN + AR — AR flagged for owner QA), warm + honest:
  - EN: "Real photos keep Mazad's auctions trustworthy — buyers and sellers deal
    with real people. Add yours to bid or sell."
  - AR: "الصور الحقيقية تحافظ على ثقة مزادات مزاد — المشترون والبائعون يتعاملون مع
    أشخاص حقيقيين. أضِف صورتك لتزايد أو تبيع."

## Hard rules honored

- No change to server `placeBid`, the bid transaction, or any money/settlement
  logic. The photo gate is client-side UX only.
- App design language: `border-gray-200` cards, `rounded-2xl/3xl`, `#FF6B00`
  accents, `#F7F6F3` page bg, smooth ease-out. RTL-correct, a11y labels + alt.
- Pure helpers TDD'd; `npm test`, `npx tsc --noEmit`, `npm run build` green.
