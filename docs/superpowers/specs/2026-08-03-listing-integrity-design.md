# Listing integrity: stop fabricating images, unify the taxonomy, tell the seller what to fix

**Date:** 2026-08-03
**Status:** Draft, awaiting approval
**Epic:** A of 5 (see [Related work](#related-work))

## Problem

A partner review of the live app reported two data defects:

1. Some lots show a photo of an unrelated product — a Skyworth TV rendering a
   Nike shoe image.
2. Some electronics are filed under **Fashion**.

Both were reported as database problems ("fix the image-product links"). Neither
is. They are one code path with two symptoms.

## Root cause

### The image is fabricated, not mislinked

`createListing` invents a thumbnail when none was uploaded
(`src/context/AppContext.tsx:3960`):

```js
if (!finalThumbnailUrl) {
  const cat = (listingData.category || '').toLowerCase();
  if (cat.includes('vehicle') || cat.includes('car') || …)        // → unsplash car
  else if (cat.includes('luxury') || cat.includes('watch') || …)  // → unsplash watch
  else if (cat.includes('electronic') || cat.includes('phone')…)  // → unsplash phone
  else finalThumbnailUrl =
    'https://images.unsplash.com/photo-1542291026-7eec264c27ff?…'; // → red Nike sneakers
}
```

No image-product link is broken. The app writes a stock photograph and the card
renders it faithfully.

A second fabrication compounds it: `DiscoveryFeedView.tsx:153` swaps in an
Unsplash wristwatch on any `<img>` `onError`, so a lot whose real image 404s also
shows someone else's product.

### The category funnels the TV into the shoe branch

The admin drop builder has three channels. `channelToCategory`
(`src/utils/dropChannel.ts:17`) maps them:

| Channel | Stored category |
|---|---|
| `cars` | `Vehicles` |
| `phones` | `Electronics` |
| `misc` (default) | `Fashion` |

A television is `misc` → stored `Fashion` → matches none of the three keyword
branches above → falls to the `else` → **Nike sneakers**. The two reported
defects are the same bug observed from two angles.

`categoryLabel.ts` already relabels stored `Fashion` as "Other / أخرى"
(commit `bbf65b6`), so the *display* half of defect 2 is fixed. The lot still has
nowhere correct to live.

### Only one publishing path is ungated

The seller path is gated correctly and needs no work:

| Stage | Location | Behaviour |
|---|---|---|
| Submit | `ListingWizardView.tsx:135` | writes `status: 'processing'` |
| Review | `admin/cards/ListingApprovalCard.tsx` | checklist: real product photo / category correct / name correct; `hasMedia` is a **hard** gate — "No photo/video — cannot approve" |
| Reject | same, `:94` | reason required, non-empty, stored as `rejectionReason` |
| Fix | `SellerCenterView.tsx:744` | `rejected` is editable → resubmit sets `status: 'processing'`, clears the reason |

The admin drop builder bypasses all of it. `AuctionDropBuilderView.tsx:366`
publishes directly as `'upcoming'`, and `validateDropForm`
(`src/utils/dropFormState.ts:79`) requires only `productName` and a positive
`startingPrice` — no media check. Mazad's own drops therefore reach the feed
image-less, and the fallback supplies a stock photo.

### Two taxonomies that disagree

The seller picker (`ListingWizardView.tsx:59`) and the Discover chips
(`DiscoveryFeedView.tsx:393`) were written independently and do not line up:

| Seller picker label | Stored value | Discover chip matching it |
|---|---|---|
| ساعات / Watches | `Luxury` | **none** — the Watches chip matches `['Watches']` |
| هواتف / Phones | `Electronics` | Phones *and* Electronics chips both match |
| أجهزة / Electronics | `Electronics` | (same value as above — two labels, one bucket) |
| — (absent from picker) | `Real Estate` | chip exists, nothing can populate it |

Consequences, neither reported and both live:

- **Every watch a seller has listed is invisible under every category filter**
  except "All". `Luxury` matches no chip.
- **Real Estate is unreachable.** It is in the `category` union and has a chip,
  but no seller can select it.

### The rejection reason is written and never shown

`rejectionReason` is stored on reject and cleared on resubmit
(`SellerCenterView.tsx:744`) but is **rendered nowhere**. The seller's card shows
`مرفوض / Rejected` (`:103`) and no reason. A seller rejected for a wrong category
is told only that they failed.

## Scope

In:

1. Remove both image fabrications; replace with a neutral in-app placeholder.
2. Media requirement on the admin drop-builder publish path.
3. One canonical category taxonomy, consumed by all four surfaces.
4. Backfill script for existing mis-bucketed lots.
5. Surface `rejectionReason` to the seller as a next-action instruction.

Out:

- The seller submission → review → approve/reject → resubmit **flow**. It is
  already correct and is not restructured. The wizard's category picker and the
  approval card's media predicate change; the gate's behaviour does not.
- Renaming the stored `Fashion` value. Legacy lots carry it; `categoryLabel`
  already renders it as "Other". Renaming orphans every existing doc.
- Buyer/seller navigation modes, notification splitting, Arabic sweep, sign-in
  intent, skeletons. Separate epics — see [Related work](#related-work).

## Design

### 1. A missing image looks missing

Delete the `if (!finalThumbnailUrl)` block (`AppContext.tsx:3960-3971`) and the
`onError` swap (`DiscoveryFeedView.tsx:152-155`).

Introduce `<ListingImage>` (`src/components/ui/ListingImage.tsx`): renders the
real image when present; otherwise a neutral placeholder — brand mark centred on
`surface-sunken`, no photograph, theme-aware via existing tokens. `onError` falls
back to the same placeholder rather than to a different product.

The rule: **the app never displays a photograph it did not receive for that
lot.** A blank frame is honest; a stock photo of another product is not.

### 2. Media is required to publish, on every path

The two paths hold media in different shapes: the approval card reads a saved
doc (`thumbnailUrl` / `videoUrl` / `mediaUrls`), while the drop builder holds
unsaved `File`s in component state (`thumbnailFile`, `extraPhotos`, `videoFile`
— `AuctionDropBuilderView.tsx:55-58`), which `DropFormValues` does not carry.
One predicate cannot take both shapes honestly, so `src/utils/listingMedia.ts`
exports two adapters over one rule:

```ts
/** The rule: a listing has media if it has any of cover / gallery / video. */
export function docHasMedia(a: {
  thumbnailUrl?: string | null; videoUrl?: string | null; mediaUrls?: unknown[] | null;
}): boolean

export function draftHasMedia(d: {
  thumbnailFile?: unknown; videoFile?: unknown; gallery?: unknown[] | null;
}): boolean
```

`docHasMedia` replaces the inline expression at `ListingApprovalCard.tsx:48`.
Keeping both in one module is what stops the two gates drifting apart; a shared
unit test asserts they agree on the same logical input.

`validateDropForm` cannot reach component state, so it takes the answer rather
than computing it:

```ts
validateDropForm(v: DropFormValues, now: number, hasMedia: boolean)
// → if (!hasMedia) errors.media = 'REQUIRED';
```

This keeps the validator pure and node-testable. **Both** call sites must pass
it — `AuctionDropBuilderView.tsx:302` (publish) and `:408` (the second guard) —
and a missed one silently reopens the hole, so the plan should treat this as one
change, not two.

Add `media` to `ERROR_FIELD_ORDER` so the form scrolls to the picker, consistent
with the existing per-field error mechanism.

This closes the hole that made the fallback necessary. Applies to the admin path
as well as the seller path, per decision: gating only sellers leaves the exact
path that produced the reported bug open.

### 3. One taxonomy

New `src/utils/categories.ts` — the single source of truth:

```ts
export interface Category {
  value: string;        // canonical stored value
  labelAr: string;
  labelEn: string;
  legacyMatch: string[]; // stored values this chip must also match
}
export const CATEGORIES: Category[]
export function categoryLabel(value, isAr): string   // moves here
export function matchValues(value): string[]
```

Canonical set — the union of what the two pickers offer today, deduplicated:
`Vehicles`, `Phones`, `Electronics`, `Watches`, `Appliances`,
`Home & Furniture`, `Real Estate`, `Fashion` (stored value; labelled "Other").

Then repoint all four consumers:

Then repoint all five consumers:

| Consumer | Change |
|---|---|
| `ListingWizardView.tsx:59` | `categoriesOpt` ← `CATEGORIES`; Watches stores `Watches` not `Luxury`; Real Estate appears; the duplicate Phones/Electronics pair collapses |
| `AuctionDropBuilderView` → `dropPayload.ts:74` | channel selector gains a category field; `category:` ← the picked value, not `channelToCategory(channel)` |
| `SellView.tsx:179` (concierge form) | same — the concierge path currently collapses every submission to three values |
| `DiscoveryFeedView.tsx:392` | `categoriesList` ← `CATEGORIES`, `match` ← `legacyMatch` |
| `categoryLabel.ts` | re-exports from `categories.ts`; file kept so no import churn |

`legacyMatch` carries `Luxury` on the Watches entry and `Cars` on Vehicles, so
existing docs keep filtering correctly whether or not the backfill has run.

`channelToCategory` is deleted from `dropChannel.ts`. `DropChannel`,
`DROP_CHANNELS` and `channelLabel` **stay** — the drop channel remains a real
concept for WhatsApp routing and drop grouping; it simply stops doubling as the
buyer-facing category. Channel and category become independent fields.

### 4. Backfill

`scripts/admin/backfill-categories.cjs`, two-phase by construction:

- **Phase 1 (default):** classify every lot whose stored category is `Fashion`
  or `Luxury` by title keyword (AR + EN — شاشة/TV/تلفزيون → `Electronics`,
  ساعة/watch → `Watches`, …). Print a full table: id, title, current → proposed.
  Write nothing.
- **Phase 2 (`--apply`):** re-run the classification and write it.

A title matching no keyword **stays where it is** rather than being guessed.
`Luxury` → `Watches` is a rename, not a guess, and is applied unconditionally.

Runs against prod via the `mazadjoapp` service account (see
`reference_mazadjo_prod_admin`).

### 5. Tell the seller what to fix

Render `rejectionReason` on the seller's listing card in `SellerCenterView`,
directly under the status chip, as an instruction rather than a verdict.

Relabel the non-terminal state: `مرفوض / Rejected` → **`يحتاج تعديل / Needs
editing`** (`SellerCenterView.tsx:103,150,227,269,346`). The stored status value
`rejected` is unchanged — this is copy only. The state is already editable and
resubmittable; the label was the only thing calling it final.

Reject reasons become structured in `ListingApprovalCard`: a preset chip row
(wrong category / wrong or missing photos / prohibited item / other) that
prefills the existing free-text box. Preset text is stored as the reason string,
so no schema change and the seller-side render works for historical free-text
reasons too.

### Data flow

```
admin drop builder ─┐
                    ├→ validateDropForm (name, price, MEDIA) ─→ 'upcoming' ─→ feed
seller wizard ──────┴→ 'processing' → ListingApprovalCard ────→ 'live'  ─→ feed
                                            │ reject(reason)
                                            ↓
                                     'rejected' + rejectionReason
                                            │  seller edits (reason shown)
                                            ↓
                                       'processing'
```

### Error handling

- A publish attempt with no media fails in the form, before any upload starts —
  no orphaned Storage objects.
- The backfill is idempotent: re-running phase 2 over already-corrected lots is a
  no-op, since the classifier is a pure function of the title.
- `<ListingImage>` never throws on a malformed URL; it renders the placeholder.

### Testing

Follow `reference_mazadjo_testing` — vitest is node-only, no jsdom.

Pure-function unit tests:

- `categories.ts` — every canonical value has AR + EN labels; `legacyMatch`
  covers `Luxury` and `Cars`; no chip matches zero stored values.
- `docHasMedia` / `draftHasMedia` — cover only / gallery only / video only /
  none, plus an agreement test that both return the same answer for the same
  logical input.
- `validateDropForm` — media error raised when `hasMedia` is false, and ordered
  correctly by `firstErrorField`.
- The backfill classifier — AR and EN titles, and the no-match case staying put.

Wiring tests (the established `*.wiring.test.ts` pattern):

- Every consumer imports from `categories.ts` — a grep-style assertion that no
  hardcoded category array survives, and that `channelToCategory` has no
  remaining callers.
- Both `validateDropForm` call sites in `AuctionDropBuilderView` pass a third
  argument. This is the drift-prone edge: a source-level assertion is cheap and
  the alternative is an untested silent hole.
- No Unsplash URL remains in a listing-image path.

Manual, on preview, before merge:

- Publish from the drop builder with no image → blocked.
- A `Fashion` lot renders the placeholder, not a photograph.
- Seller Center shows a rejection reason and reads "Needs editing".

Per `feedback_visual_changes_need_mj_eyes`, the card placeholder and the Seller
Center relabel are customer-facing composition changes: MJ previews before merge.

## Risks

- **The backfill writes to live auctions.** Mitigated by the two-phase default
  and by leaving unmatched titles alone. Lots with active bids are included —
  a category correction does not affect bidding, but the phase-1 table flags
  them so they can be excluded by hand if desired.
- **Removing the fallback makes existing image-less lots visibly blank.** That is
  the intent, and the backfill does not create images. If the blank count is
  high, the phase-1 report doubles as the work list for sourcing real photos.
- **`Luxury` may appear in Algolia records.** Check the index schema before the
  backfill; a stale facet value would silently drop watches from search.

## Related work

The partner feedback covered 17 items. Audited against the code, this epic
absorbs items 1, 2 and the live half of 17. The remainder:

| Epic | Items | Summary |
|---|---|---|
| B. Shell polish | 4, 11, 14 | Skeletons for the route-level Suspense fallback; de-duplicate the awaiting-first-bid badge; 2-line titles with symbol stripping |
| C. Arabic completion | 3 | ~18 leaked strings; `TermsModal` is entirely English |
| D. Intent-aware sign-in | 5, 6 | `LoginView.tsx:328` hardcodes bidding copy for every intent; overlaps `2026-08-03-signin-screen-design.md` |
| E. Seller notifications | 10 | `notifications.ts` allowlists six bidder types and no seller types |

Assessed as already shipped and requiring no work: 8, 12, 13, 15, 16.
Declined with reasoning: 7 (removes the Sell FAB, the supply funnel), 9 (mode
switching; Seller Center already serves this).
