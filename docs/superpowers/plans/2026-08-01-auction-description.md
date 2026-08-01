# Auction Description Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a seller actually write a description, stop the app inventing one, and show it on the desktop bidding screen.

**Architecture:** A pure `validateDescription` in `src/utils/`, a required textarea in the self-serve wizard, deletion of both fabrication paths, and a clamped Details section on `DesktopLiveAuctionLayout`. Mobile is untouched.

**Tech Stack:** React 19 + TypeScript, Vitest (`environment: 'node'`).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-01-auction-description-design.md`. Read it before Task 1.
- **Vitest is `environment: 'node'` — no jsdom, no `@testing-library`.** Components cannot be rendered. Put logic in `src/utils/*` and test that; use source-text assertions for wiring, the house idiom (`src/components/order/SecondChanceCard.wiring.test.ts`, `src/components/sellerReviewSeeding.test.ts`).
- **`npm run lint` is `tsc --noEmit`, currently exit 0 with no output.** It is WEAK here — `@types/react` is absent and `tsconfig` sets no `strict`, so anything from `useApp()` is `any` and JSX prop mistakes compile silently. Rely on wiring tests, not the compiler.
- **`DESCRIPTION_MIN = 20`** characters after trimming. One constant, one place.
- **No fabricated content.** `Premium Lot:` / `معروض مميز:` must not appear anywhere in `src/` when this is done, and `SellView` must not fall back to the product name.
- **Arabic-primary**, existing `isAr ? '…' : '…'` idiom. Western digits via `formatNumeral` if any number is rendered.
- **Never push to main.** Branch → PR → squash-merge. Merging to main IS the deploy.
- **Customer-facing:** the desktop bidding screen is the highest-traffic surface in the app. MJ previews before merge.
- Baseline: `npx vitest run` → **1851 passing / 133 files**.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/utils/listingDescription.ts` **(new)** | `DESCRIPTION_MIN`, `validateDescription`. Pure, no React. |
| `src/utils/listingDescription.test.ts` **(new)** | Every branch: boundary, whitespace, empty, emoji, both languages. |
| `src/components/ListingWizardView.tsx` | Add the textarea + the guard; delete the fabrication. |
| `src/components/SellView.tsx` | Delete the `|| cName.trim()` fallback. |
| `src/components/listingDescription.wiring.test.ts` **(new)** | Source-text pins for both capture paths. |
| `src/components/DesktopLiveAuctionLayout.tsx` | Add the clamped Details section below the product-info card. |
| `src/components/desktopDescription.wiring.test.ts` **(new)** | Pins the section is conditional and clamped. |

---

### Task 1: The validation rule

**Files:**
- Create: `src/utils/listingDescription.ts`
- Test: `src/utils/listingDescription.test.ts`

**Interfaces:**
- Produces: `DESCRIPTION_MIN`, `validateDescription(raw, isAr) => { ok: boolean; message?: string }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/utils/listingDescription.test.ts
import { describe, it, expect } from 'vitest';
import { validateDescription, DESCRIPTION_MIN } from './listingDescription';

describe('DESCRIPTION_MIN', () => {
  it('is 20 — low enough for one honest sentence, high enough to exclude a bare product name', () => {
    expect(DESCRIPTION_MIN).toBe(20);
  });
});

describe('validateDescription — the boundary', () => {
  it('rejects one character below the floor', () => {
    expect(validateDescription('x'.repeat(DESCRIPTION_MIN - 1), true).ok).toBe(false);
  });

  it('accepts exactly the floor', () => {
    expect(validateDescription('x'.repeat(DESCRIPTION_MIN), true).ok).toBe(true);
  });

  it('accepts above the floor', () => {
    expect(validateDescription('x'.repeat(DESCRIPTION_MIN + 50), true).ok).toBe(true);
  });
});

describe('validateDescription — trims before counting', () => {
  it('rejects whitespace padded out to the floor', () => {
    // 20 spaces is not a description.
    expect(validateDescription(' '.repeat(DESCRIPTION_MIN + 5), true).ok).toBe(false);
  });

  it('rejects a short body wrapped in whitespace', () => {
    expect(validateDescription('   short   ', true).ok).toBe(false);
  });

  it('accepts a valid body wrapped in whitespace', () => {
    expect(validateDescription('  ' + 'x'.repeat(DESCRIPTION_MIN) + '  ', true).ok).toBe(true);
  });

  it('rejects empty and nullish input without throwing', () => {
    for (const bad of ['', undefined as any, null as any]) {
      expect(() => validateDescription(bad, true)).not.toThrow();
      expect(validateDescription(bad, true).ok).toBe(false);
    }
  });
});

describe('validateDescription — the message the caller shows', () => {
  it('returns Arabic when isAr', () => {
    const r = validateDescription('short', true);
    expect(r.message).toBeTruthy();
    expect(r.message!).toMatch(/[؀-ۿ]/);
  });

  it('returns English when not isAr', () => {
    const r = validateDescription('short', false);
    expect(r.message).toBeTruthy();
    expect(r.message!).not.toMatch(/[؀-ۿ]/);
  });

  it('states the minimum in the message, so the seller knows the target', () => {
    expect(validateDescription('short', false).message).toContain(String(DESCRIPTION_MIN));
    expect(validateDescription('short', true).message).toContain(String(DESCRIPTION_MIN));
  });

  it('carries NO message when valid', () => {
    expect(validateDescription('x'.repeat(DESCRIPTION_MIN), true).message).toBeUndefined();
  });
});

describe('validateDescription — real content', () => {
  it('accepts a genuine Arabic description', () => {
    expect(validateDescription('آيفون 15 برو ماكس، مستعمل بحالة ممتازة، مع العلبة والشاحن الأصلي.', true).ok).toBe(true);
  });

  it('rejects a bare product name, which is what production is full of today', () => {
    // 115 real auctions and not one carries a real description — the field was
    // fabricated from the title. These are the actual strings in the database.
    for (const name of ['iPhone 17 pro max', 'Apple Watch Ultra']) {
      expect(validateDescription(name, false).ok, name).toBe(false);
    }
  });

  it('counts emoji as characters rather than throwing', () => {
    expect(() => validateDescription('🍽️'.repeat(30), true)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/listingDescription.test.ts`
Expected: FAIL — cannot resolve `./listingDescription`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/utils/listingDescription.ts
/**
 * The floor under a seller-written auction description.
 *
 * Measured 2026-08-01: of 115 real auctions, ZERO carried a real description.
 * 13 held the string `Premium Lot: {title}` that ListingWizardView invented
 * because it had no input field, and the other 102 held pasted product names.
 * Mobile's `التفاصيل` section was not broken — it was faithfully rendering a
 * duplicate of the title.
 *
 * MJ chose required-with-a-minimum over optional-but-prompted, with the risk
 * stated: a seller who does not want to write one will type filler to clear the
 * floor. The minimum guarantees SOMETHING, not quality. 20 characters is low
 * enough for one honest sentence and already excludes a bare product name —
 * `iPhone 17 pro max` is 17.
 */
export const DESCRIPTION_MIN = 20;

export interface DescriptionCheck {
  ok: boolean;
  /** Present only when `ok` is false; the exact string the caller shows. */
  message?: string;
}

export function validateDescription(raw: string, isAr: boolean): DescriptionCheck {
  const text = String(raw ?? '').trim();
  if (text.length >= DESCRIPTION_MIN) return { ok: true };
  return {
    ok: false,
    message: isAr
      ? `اكتب وصفاً للمنتج لا يقل عن ${DESCRIPTION_MIN} حرفاً — الحالة، ما يشمله البيع، وأي عيب.`
      : `Write a description of at least ${DESCRIPTION_MIN} characters — condition, what's included, and any flaw.`,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/listingDescription.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 5: Verify the tests are not vacuous**

Break each, confirm a test FAILS, restore. Report the table with real counts.

| mutant | expected |
|---|---|
| `DESCRIPTION_MIN` → 5 | FAIL |
| `>=` → `>` (off by one at the boundary) | FAIL |
| drop the `.trim()` | FAIL |
| return `{ok:true}` unconditionally | FAIL |
| always return the English message | FAIL |
| include a message when `ok` is true | FAIL |

- [ ] **Step 6: Commit**

```bash
git add src/utils/listingDescription.ts src/utils/listingDescription.test.ts
git commit -m "feat(listing): a real floor under seller descriptions"
```

---

### Task 2: Capture — the wizard field, and killing both fabrications

**Files:**
- Modify: `src/components/ListingWizardView.tsx`, `src/components/SellView.tsx`
- Test: `src/components/listingDescription.wiring.test.ts` **(new)**

**Interfaces:**
- Consumes: `validateDescription`, `DESCRIPTION_MIN` from Task 1.

- [ ] **Step 1: Write the failing wiring test**

```ts
// src/components/listingDescription.wiring.test.ts
// Both creation paths manufactured a description rather than asking for one.
// The self-serve wizard had NO input at all and wrote `Premium Lot: {title}`;
// the concierge form had a field but fell back to the product name when blank.
// Same shape as the fabricated seller reviews removed in PR #198.
//
// Source-text: vitest here is environment: 'node', so the forms cannot be
// rendered. House idiom — see sellerReviewSeeding.test.ts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const WIZ = readFileSync(new URL('./ListingWizardView.tsx', import.meta.url), 'utf8');
const SELL = readFileSync(new URL('./SellView.tsx', import.meta.url), 'utf8');

describe('nothing fabricates a description any more', () => {
  it('the wizard no longer invents one from the title', () => {
    expect(WIZ).not.toMatch(/Premium Lot/);
    expect(WIZ).not.toMatch(/معروض مميز/);
  });

  it('the concierge form no longer falls back to the product name', () => {
    expect(SELL).not.toMatch(/cDesc\.trim\(\)\s*\|\|\s*cName/);
  });

  it('neither string survives anywhere in the component tree', () => {
    // Guards against the fabrication being moved rather than deleted.
    expect(WIZ + SELL).not.toMatch(/Premium Lot|معروض مميز/);
  });
});

describe('the wizard captures a real description', () => {
  it('has a description textarea bound to state', () => {
    expect(WIZ).toMatch(/<textarea/);
    expect(WIZ).toMatch(/value=\{description\}/);
    expect(WIZ).toMatch(/setDescription\(/);
  });

  it('passes the seller-typed value to createListing', () => {
    expect(WIZ).toMatch(/description:\s*description\.trim\(\)/);
  });
});

describe('the guard runs BEFORE the listing is created', () => {
  it('calls validateDescription', () => {
    expect(WIZ).toMatch(/validateDescription\(/);
  });

  it('validates ahead of createListing, not after', () => {
    // Validating after the write would create the lot and then complain.
    const v = WIZ.indexOf('validateDescription(');
    const c = WIZ.indexOf('createListing(');
    expect(v).toBeGreaterThan(-1);
    expect(c).toBeGreaterThan(-1);
    expect(v).toBeLessThan(c);
  });

  it('returns early on failure, in the same idiom as the sibling guards', () => {
    // The existing chain is `if (!x) { alert(...); return; }` — a new style here
    // would be the second way this form reports a problem.
    const at = WIZ.indexOf('validateDescription(');
    const near = WIZ.slice(at, at + 320);
    expect(near).toMatch(/alert\(/);
    expect(near).toMatch(/return;/);
  });

  it('shows the message the rule produced, not a re-typed one', () => {
    const at = WIZ.indexOf('validateDescription(');
    expect(WIZ.slice(at, at + 320)).toMatch(/\.message/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/listingDescription.wiring.test.ts`
Expected: FAIL — `Premium Lot` still present, no textarea.

- [ ] **Step 3: Add the field to `ListingWizardView`**

Add the state beside the existing `title` / `startingPrice` state (around line 21):

```tsx
  const [description, setDescription] = useState('');
```

Add the input directly after the `{/* Input Name */}` block (which ends around line 388), matching its shape exactly:

```tsx
                  {/* Input Description */}
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold text-gray-500 block">
                      {isAr ? 'وصف المنتج' : 'Product Description'}
                    </span>
                    <textarea
                      rows={3}
                      placeholder={isAr
                        ? 'الحالة، ما يشمله البيع، وأي عيب أو خدش. كل ما يريد المشتري معرفته قبل المزايدة.'
                        : "Condition, what's included, and any flaw. Everything a bidder wants to know before bidding."}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-xs font-semibold text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#FF6B00] transition-colors resize-none leading-relaxed"
                    />
                  </div>
```

- [ ] **Step 4: Add the guard and delete the fabrication**

Import at the top:

```tsx
import { validateDescription } from '../utils/listingDescription';
```

Add to the validation chain, immediately after the existing title guard (around line 86, before the price guard):

```tsx
    const descCheck = validateDescription(description, isAr);
    if (!descCheck.ok) {
      alert(descCheck.message);
      return;
    }
```

Then replace the fabricated line at ~131:

```tsx
        description: isAr ? `معروض مميز: ${title}` : `Premium Lot: ${title}`,
```

with:

```tsx
        description: description.trim(),
```

- [ ] **Step 5: Remove the concierge fallback in `SellView`**

At ~162, replace:

```tsx
          description: cDesc.trim() || cName.trim(),
```

with:

```tsx
          // Concierge stays OPTIONAL — Mazad writes the copy before approval —
          // but a blank description is an honest blank, not the product name.
          description: cDesc.trim(),
```

- [ ] **Step 6: Run tests, build, lint**

Run: `npx vitest run && npm run build && npm run lint`
Expected: all pass, `tsc --noEmit` exit 0 with no output.

- [ ] **Step 7: Verify with mutants**

| mutant | expected |
|---|---|
| restore `Premium Lot: ${title}` | FAIL |
| restore `cDesc.trim() \|\| cName.trim()` | FAIL |
| move `validateDescription` after `createListing` | FAIL |
| guard logs but does not `return` | FAIL |
| alert a re-typed string instead of `descCheck.message` | FAIL |
| pass a literal to `createListing` instead of `description.trim()` | FAIL |

- [ ] **Step 8: Commit**

```bash
git add src/components/ListingWizardView.tsx src/components/SellView.tsx src/components/listingDescription.wiring.test.ts
git commit -m "feat(sell): sellers write their own description; nothing invents one"
```

---

### Task 3: Display — the desktop Details section

**Files:**
- Modify: `src/components/DesktopLiveAuctionLayout.tsx`
- Test: `src/components/desktopDescription.wiring.test.ts` **(new)**

**Interfaces:**
- Consumes: nothing from Tasks 1–2; reads `activeAuction.description`.

- [ ] **Step 1: Write the failing test**

```ts
// src/components/desktopDescription.wiring.test.ts
// The desktop bidding screen rendered NO description at all — the product-info
// row carries short fixed-shape facts (condition, viewing) and truncates, so
// prose needed its own section. Mobile's `التفاصيل` section is the model.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('./DesktopLiveAuctionLayout.tsx', import.meta.url), 'utf8');

describe('the desktop layout renders the description', () => {
  it('reads the field', () => {
    expect(SRC).toMatch(/activeAuction\??\.description/);
  });

  it('renders a bilingual Details heading', () => {
    expect(SRC).toMatch(/التفاصيل/);
    expect(SRC).toMatch(/'Details'/);
  });
});

describe('an absent description renders NOTHING', () => {
  it('is guarded on a non-empty trimmed value', () => {
    // The file's own rule: "an empty bordered card claims there is information
    // when there is none." A heading over a blank body is the same lie.
    expect(SRC).toMatch(/descriptionText/);
    expect(SRC).toMatch(/\.description\s*\|\|\s*''\)\.trim\(\)/);
  });

  it('the heading is inside the guard, not beside it', () => {
    const guard = SRC.indexOf('descriptionText &&');
    const heading = SRC.indexOf('التفاصيل');
    expect(guard).toBeGreaterThan(-1);
    expect(heading).toBeGreaterThan(guard);
  });
});

describe('long descriptions cannot push the bid controls off screen', () => {
  it('clamps by default', () => {
    expect(SRC).toMatch(/line-clamp-3/);
  });

  it('has a show-more toggle bound to state', () => {
    expect(SRC).toMatch(/descriptionExpanded/);
    expect(SRC).toMatch(/setDescriptionExpanded/);
  });

  it('the toggle label is bilingual', () => {
    expect(SRC).toMatch(/عرض المزيد|عرض أقل/);
  });

  it('preserves seller line breaks', () => {
    expect(SRC).toMatch(/whitespace-pre-line/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/desktopDescription.wiring.test.ts`
Expected: FAIL — no `descriptionText`, no `التفاصيل`.

- [ ] **Step 3: Add the state**

Beside the component's other `useState` calls, near the top of the component body:

```tsx
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
```

- [ ] **Step 4: Add the section**

Insert immediately after the product-info card's closing `})()}` at line ~625 (verify the line before editing — it is the IIFE that returns `null` when `blocks.length === 0`):

```tsx
        {/* Details — the seller's own words.
            Its own section rather than a block in the info row above: that row
            holds short fixed-shape values and truncates to one line, which would
            clamp a real description to nothing. Mirrors mobile's `التفاصيل`.
            Absent description renders NOTHING — no heading, no empty card —
            which is the same rule the info row above applies to itself. */}
        {(() => {
          const descriptionText = String(activeAuction?.description || '').trim();
          if (!descriptionText) return null;
          return (
            <div className="mt-4 bg-white border border-gray-100 rounded-2xl p-5">
              <h2 className="text-[12px] font-black text-gray-900 tracking-tight">
                {isAr ? 'التفاصيل' : 'Details'}
              </h2>
              <p
                className={`mt-2 text-[12px] leading-relaxed text-gray-600 whitespace-pre-line ${
                  descriptionExpanded ? '' : 'line-clamp-3'
                }`}
              >
                {descriptionText}
              </p>
              <button
                type="button"
                onClick={() => setDescriptionExpanded((v) => !v)}
                className="mt-2 text-[11px] font-bold text-[#FF6B00] hover:underline"
              >
                {descriptionExpanded
                  ? (isAr ? 'عرض أقل' : 'Show less')
                  : (isAr ? 'عرض المزيد' : 'Show more')}
              </button>
            </div>
          );
        })()}
```

- [ ] **Step 5: Run tests, build, lint**

Run: `npx vitest run && npm run build && npm run lint`
Expected: all pass.

- [ ] **Step 6: Verify with mutants**

| mutant | expected |
|---|---|
| drop the `if (!descriptionText) return null` guard | FAIL |
| guard on `!== undefined` instead of a trimmed non-empty string | FAIL |
| remove `line-clamp-3` | FAIL |
| remove `whitespace-pre-line` | FAIL |
| move the heading outside the guard | FAIL |

- [ ] **Step 7: Commit**

```bash
git add src/components/DesktopLiveAuctionLayout.tsx src/components/desktopDescription.wiring.test.ts
git commit -m "feat(auction): show the seller's description on the desktop bidding screen"
```

---

### Task 4: Docs, verification, PR

**Files:**
- Modify: `docs/BACKLOG.md`

- [ ] **Step 1: Record it in the backlog**

Match the file's existing structure. Note: descriptions are now required on the self-serve path with a 20-character floor; both fabrication paths are gone; desktop renders the field; the 13 pre-existing `Premium Lot:` lots were deliberately left alone.

- [ ] **Step 2: Full verification — paste the REAL output into the PR**

```bash
npx vitest run
npm run build
npm run lint
```

- [ ] **Step 3: Open the PR (do NOT merge)**

Body must carry the four outputs, the production measurement (115 auctions / 13 fabricated / 0 empty / 102 pasted titles), the mutant tables, and this note: **the desktop bidding screen is customer-facing — MJ previews before merge.**

- [ ] **Step 4: MJ's preview**

A lot with a real description, one without (section absent entirely), and one with a very long description (clamped, show-more works). Desktop and mobile side by side.

---

## Self-Review

**Spec coverage**

| Spec requirement | Task |
|---|---|
| `DESCRIPTION_MIN = 20`, trimmed | 1 |
| Required on the self-serve wizard | 2 |
| Textarea with a prompting placeholder | 2 |
| `Premium Lot:` fabrication deleted | 2 |
| Concierge `|| cName` fallback deleted, field stays optional | 2 |
| Guard uses the existing `alert` + `return` idiom | 2 |
| Desktop section under the info row | 3 |
| Clamp ~3 lines + show more | 3 |
| Empty description renders nothing | 3 |
| Mobile unchanged | — (no task touches it, asserted by omission) |
| 13 legacy lots untouched | — (explicitly out of scope) |

**Notes for the implementer**

- Task 1 is pure and independently reviewable. Task 3 touches no file Task 2 touches, so a failure in one does not block the other.
- The line numbers in Tasks 2 and 3 are from 2026-08-01 and WILL drift. Locate the anchors by content (`{/* Input Name */}`, the `blocks.length === 0` IIFE), not by number.
- Do not add a description field to the admin drop builder — it already has one.
