# Per-lot viewing — design

**Date:** 2026-07-26
**Status:** approved (MJ)

## Problem

Inspectability is a **per-lot** property, but the app states it **globally**.

Not every item is at the Mazad office. Some sellers are physical stores a buyer can
visit; others are private sellers with no walk-in viewing at all. Any single global
sentence is therefore false for some subset of lots:

- "we inspect everything" — false (removed in PR #139)
- "visit our office to see it" — false for store-held and private-seller lots
- even "you can always view before bidding" — false for private sellers

PR #139 stopped the landing page from lying by leading with escrow (true for 100% of
lots) and saying viewing "varies by seller". This spec makes that a **fact the lot
actually carries**, rather than a claim.

It also closes the matching defect on the auction page itself: the desktop
product-info row hardcodes `"NEW"`, `"Free Delivery"` and `"Amman, Jordan"` as
literals for every lot (`docs/BACKLOG.md`; `DesktopLiveAuctionLayout.tsx:506/519/532`).

## Why per-lot, set at approval

An earlier draft modelled this on the **seller** (`store | private`) with a per-lot
override, since seller type is stable and office custody is the exception. Exploring
the codebase killed that:

1. There is no seller "type" field and no admin seller-management UI. Seller-level
   would require building seller onboarding first.
2. `MobileAuctionView` reads seller data **denormalized off the auction doc**
   (`sellerName`, `sellerLogo`, `sellerId`) and never joins `sellerProfiles`; only
   `DesktopLiveAuctionLayout` does the join. Seller-level would need a new join on
   mobile.
3. **Every listing already passes a mandatory admin approval gate**
   (`LaunchSection` → `approveListing` in `AppContext`). At approval time the admin
   genuinely knows where the item is.

So the value is set per-lot at a chokepoint that already exists, and denormalized onto
the auction doc so both views read the same fields with no join.

## Data model

```ts
// src/types.ts — AuctionItem
/** Where a buyer may physically view this lot before bidding. Unset = not stated. */
viewing?: 'office' | 'store' | 'private';
/** Human-readable place, shown only for 'store' — e.g. "محل الأمين للموبايلات، وسط البلد". */
viewingPlace?: string;
```

Both optional. **Unset renders nothing** — no migration, no backfill, and every
existing lot stays correct by default. This is the same "degrade gracefully, never
fabricate" rule the mobile trust chips already follow.

`viewingPlace` is only meaningful when `viewing === 'store'`; it is ignored otherwise.

### Firestore

No index or rules change. These are two optional scalar fields on documents in
`auctions`, written through the existing `createListing` / `approveListing` paths.
`setDoc` rejects explicit `undefined` (the project does not enable
`ignoreUndefinedProperties`), so writers MUST omit the keys rather than pass
`undefined` — the same conditional-spread pattern `AuctionDropBuilderView` already
uses for `mediaUrls` / `marketPrice`.

## Resolver

One pure function, no React, unit-tested — matching the repo's utils+vitest
convention (`bidMath.ts`, `discoverQuery.ts`).

```ts
// src/utils/viewing.ts
export type ViewingMode = 'office' | 'store' | 'private';

/** Label for the viewing chip, or null when nothing should render. */
export function resolveViewing(
  auction: { viewing?: string; viewingPlace?: string } | null | undefined,
  isAr: boolean,
): { label: string } | null
```

| `viewing` | `viewingPlace` | Arabic | English |
|---|---|---|---|
| `office` | — | معاينة بمكاتبنا | Viewable at our office |
| `store` | set | معاينة عند البائع · ‹place› | Viewable at the seller: ‹place› |
| `store` | blank | معاينة عند البائع | Viewable at the seller |
| `private` | — | *null* | *null* |
| unset / unknown | — | *null* | *null* |

`private` renders **nothing** rather than a "no viewing" badge: the negative adds no
information a buyer can act on, and escrow already carries that case. This makes
`private` and unset visually identical, which is intended — both mean "no viewing
offered".

Unknown/garbage values resolve to `null` (fail closed to silence, never to a
fabricated claim).

## Where it is set

**1. `LaunchSection` approval card** — the primary path. A three-way selector
(office / store / private) plus an optional place text input shown only when `store`
is picked. The verdict flows through the existing handler:

```ts
approveListing(id)  →  approveListing(id, viewing?, viewingPlace?)
```

Both new params optional, so the existing call sites in `AdminPanel.tsx` and
`AdminDashboardView.tsx` keep compiling unchanged and simply set nothing.

**2. `AuctionDropBuilderView`** — the same selector at create time, for lots Mazad
builds directly. Written via the conditional-spread pattern noted above.

**Not exposed** in `ListingWizardView` (self-serve) or the `SellView` concierge form.
Sellers should not self-declare that buyers may visit them; the admin sets it at
approval, which every listing passes through regardless.

## Where it renders

**Mobile — `MobileAuctionView`.** A chip in the existing trust-chip row, beside
`conditionChip` / `categoryChip`, in the slot the removed "Inspected by Mazad" badge
occupied. Renders only when `resolveViewing` returns non-null.

**Desktop — `DesktopLiveAuctionLayout` product-info row.** The row currently
hardcodes three literals for every lot. All three are fixed here:

| Block | Now | After |
|---|---|---|
| Condition | always `"جديد ممتاز"` / `"NEW"` | reads `activeAuction.condition`, exactly as `MobileAuctionView` already does; hidden when unset |
| Shipping | always `"توصيل مجاني"` / `"Free Delivery"` | **removed** — no shipping data backs it, so it is a delivery promise that may not be kept |
| Location | always `"عمان، الأردن"` / `"Amman, Jordan"` | replaced by the viewing chip; hidden when `resolveViewing` returns null |

The row must lay out correctly at one, two, or zero blocks — its dividers are
per-child borders, so blocks are rendered from a filtered array rather than as three
fixed siblings.

## Landing page

No copy change. PR #139 already says viewing varies by seller and is shown per lot;
once this ships that sentence is literally true.

## Testing

`src/utils/viewing.test.ts` — the resolver is pure, so it carries the coverage:

- each of `office` / `store`+place / `store` blank / `private` / unset / unknown
- both languages
- `viewingPlace` present but `viewing !== 'store'` → place ignored
- whitespace-only `viewingPlace` treated as blank
- null / undefined auction → null (never throws)

Component rendering is covered by the existing type checks and build; no new
component tests — the repo has no component-test harness and this spec does not
introduce one.

## Out of scope

- Seller-level viewing defaults and seller onboarding (see "Why per-lot" above).
- Surfacing `sellerProfile.storeName` / `location` automatically. MJ approved showing
  store identity to buyers, but with no seller-type field to drive it, `viewingPlace`
  is entered by the admin at approval. Auto-filling it from the seller profile is a
  natural follow-up once seller onboarding exists.
- `t.marketplace.verified` ("✓ موثّقة") on real listing cards — a separate claim on a
  separate surface, still open.
- Buyer-facing scheduling of a viewing. The landing CTA points at WhatsApp.

## Risks

- **Admin data entry.** A lot approved without setting `viewing` shows nothing. That
  is the safe default (silence, not a false claim), but it means the feature is only
  as good as the habit. Mitigated by putting the selector directly on the approval
  card that must be used anyway.
- **Stale place text.** `viewingPlace` is free text captured at approval; if a shop
  moves, live lots keep the old address. Acceptable — lots live hours to days.
