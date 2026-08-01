# Auction Description (Design Spec)

**Date:** 2026-08-01 · **Status:** LOCKED with MJ.

## Why

MJ: *"i dont see any place for descriptions on mobile and desktop view in the auction room, also i dont think theres a place to put a description in the auction creation. In the admin panel, we have, but not in the regular customer auction creation flow. this is a huge gap."*

Correct on both counts, and the capture half is the cause of the display half.

### What production actually contains

115 real (non-simulated) auctions, measured 2026-08-01:

| | count |
|---|---|
| carrying the fabricated `Premium Lot: {title}` string | **13** |
| empty | **0** |
| "seller-written" | **102** |

The 102 do not survive inspection. Samples: `iPhone 17 pro max`, `🍽️ * ميكرويف *Sona* مع شواية`, `⌚ *Apple Watch Ultra* – مستعملة`. Those are **titles**, pasted from the WhatsApp intake — not descriptions. **There is no real description content in the database.**

So mobile's `التفاصيل` section is not missing; it is faithfully rendering a duplicate of the title, which reads as nothing.

### The root cause

`src/components/ListingWizardView.tsx:131` — the self-serve seller path — has **no description input at all** and fabricates one:

```js
description: isAr ? `معروض مميز: ${title}` : `Premium Lot: ${title}`,
```

`src/components/SellView.tsx:162` — the concierge path — *does* have a "Short description" field, but falls back to the product name when it is blank:

```js
description: cDesc.trim() || cName.trim(),
```

Both paths manufacture a description rather than leaving the field honest. This is the same pattern as the fabricated seller reviews removed in PR #198 (`0808ef1`): the app inventing content to fill a gap instead of asking the user or showing nothing.

## Decisions taken with MJ (2026-08-01)

1. **The description is REQUIRED with a minimum length** on the self-serve wizard. MJ chose this over "optional but prompted" after the friction risk was stated plainly: a seller who does not want to write one will type filler to clear the floor, so the minimum guarantees *something*, not quality. Worth revisiting once real submissions are visible.
2. **Minimum 20 characters** after trimming. Arabic is information-dense, so 20 already excludes a bare product name while staying under one short sentence. Tunable in one constant.
3. **No fabrication anywhere.** Both `Premium Lot: {title}` and the concierge's `|| cName.trim()` fallback are deleted. An absent description stays absent.
4. **Desktop gets its own section** under the product-info card, mirroring mobile's structure — not a block inside the info row, which is built for short fixed-shape values and would clamp prose to one line.
5. **Clamped to ~3 lines with a show-more**, so a 2,000-character description cannot push the bid controls off screen.
6. **Mobile is unchanged.** Its `التفاصيل` section is already correct; it was starved of content, not broken.
7. **The 13 existing fabricated descriptions are left alone.** They belong to live lots, and rewriting seller-facing copy under them is the owner's call, not this change's. They are listable on request.

## Architecture

### Capture — `ListingWizardView`

A `<textarea>` beside the existing title/price fields, Arabic-primary, with a placeholder that asks for what a bidder actually needs: condition detail, what is included, and any flaw. Validation joins the existing chain at `ListingWizardView.tsx:83-95`, which is a sequence of `if (!x) { alert(...); return; }` guards — the new check follows that idiom exactly rather than introducing a second validation style.

`createListing` already accepts `description`; nothing downstream changes.

### Capture — `SellView` (concierge)

The field already exists. Only the fallback changes: `cDesc.trim() || cName.trim()` becomes `cDesc.trim()`. The concierge path is where Mazad does the work on the seller's behalf, so it stays **optional** here — a blank description is an honest blank, and the team fills it before approval.

### Validation rule — shared and pure

`src/utils/listingDescription.ts` **(new)**

```
DESCRIPTION_MIN = 20
validateDescription(raw: string, isAr: boolean): { ok: boolean; message?: string }
```

Pure, no React. Trims first, counts after. Returns the Arabic or English message the caller alerts. Extracted rather than inlined because vitest here is `environment: 'node'` with no jsdom — a rule inside a component cannot be tested, and this is the piece with the branching.

### Display — desktop

`DesktopLiveAuctionLayout.tsx` gains a section below the existing product-info card, using the same conditional-render discipline that card already applies: **when there is no description, nothing renders — no heading, no empty bordered box.** That rule is already stated in that file's comments ("an empty bordered card claims there is information when there is none") and this follows it.

Clamping uses CSS line-clamp with a toggle. The expanded state is local to the component; it does not persist across lots.

### Display — mobile

No change.

## Error handling

- A description of only whitespace fails the minimum — trimming happens before counting.
- The wizard's alert is bilingual, matching its sibling guards.
- Emoji and Arabic diacritics count as characters; no attempt is made to be clever about grapheme clusters, because the floor is a nudge and not a security boundary.

## Testing

Vitest is `environment: 'node'` — no jsdom, no `@testing-library`. Components cannot be rendered.

- `listingDescription.test.ts`: at/above/below the boundary, whitespace-only, empty, emoji, both languages, and that the returned message is the one the caller shows.
- Source-text wiring assertions, the house idiom (`SecondChanceCard.wiring.test.ts`): the wizard calls `validateDescription` **before** `createListing`; `Premium Lot:` and `معروض مميز:` appear **nowhere** in `src/`; `SellView` no longer falls back to `cName`.
- A desktop wiring assertion that the description section is conditional on a non-empty value.

## Explicitly NOT in scope

- Rewriting the 13 existing fabricated descriptions.
- Any change to mobile's rendering.
- A rich-text or markdown description.
- Translating descriptions between Arabic and English — that belongs to the language project, not here.
- The admin drop builder's description field, which already works.

## Risk to name plainly

Requiring a description adds a hurdle to the self-serve sell flow at a moment when the goal is getting more sellers through it. The 20-character floor is low enough to clear in one honest sentence and low enough to clear with filler. If submissions drop or fill with junk, the floor is the first thing to reconsider — not the field itself, which should exist either way.
