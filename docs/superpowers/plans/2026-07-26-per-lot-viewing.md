# Per-lot Viewing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "where can I view this item before bidding?" a fact each lot carries, instead of a global claim that is false for some lots.

**Architecture:** Two optional fields on the auction doc (`viewing`, `viewingPlace`), written by the admin at the existing mandatory approval gate and at admin drop-create. One pure resolver (`src/utils/viewing.ts`) turns them into a display label or `null`. Mobile and desktop auction pages render the chip only when the resolver returns non-null. Unset renders nothing, so no migration and no existing lot changes behaviour.

**Tech Stack:** React 18 + TypeScript, Vite, Vitest, Firebase Firestore (client SDK), Tailwind, lucide-react icons.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-26-per-lot-viewing-design.md`.
- **Never fabricate a claim.** Unknown, missing, or garbage values must resolve to "render nothing", never to a default label.
- **`private` renders nothing** — identical to unset. This is deliberate, not an oversight.
- Firestore `setDoc`/`updateDoc` reject explicit `undefined` (the project does not enable `ignoreUndefinedProperties`). Writers MUST omit keys via conditional spread, e.g. `...(x ? { key: x } : {})`.
- All user-facing strings are bilingual, gated on `isAr` (Arabic) / else English. Arabic strings are copied verbatim from this plan — do not retype or "improve" them.
- Run commands from the repo root `/Users/mj/code/mazadjo`.
- Branch is already created: `feat/per-lot-viewing`. Do not create another.
- Test command is `npx vitest run <path>`. Typecheck is `npm run lint` (it runs `tsc --noEmit`, it is not eslint). Build is `npm run build`.

---

### Task 1: The `resolveViewing` resolver

The pure core. Everything else consumes this.

**Files:**
- Create: `src/utils/viewing.ts`
- Test: `src/utils/viewing.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export type ViewingMode = 'office' | 'store' | 'private'`
  - `export function resolveViewing(auction: ViewingSource | null | undefined, isAr: boolean): { label: string } | null`
  - `export interface ViewingSource { viewing?: string | null; viewingPlace?: string | null }`

- [ ] **Step 1: Write the failing test**

Create `src/utils/viewing.test.ts`:

```ts
// Per-lot viewing resolver — the ONLY place that decides what a lot says about
// physical viewing. Fails closed to null (render nothing) for anything unknown,
// because a fabricated viewing claim is exactly the bug this feature exists to
// kill (see docs/superpowers/specs/2026-07-26-per-lot-viewing-design.md).
import { describe, it, expect } from 'vitest';
import { resolveViewing } from './viewing';

describe('resolveViewing', () => {
  it('office: says the item is at our office, both languages', () => {
    expect(resolveViewing({ viewing: 'office' }, true)).toEqual({ label: 'معاينة بمكاتبنا' });
    expect(resolveViewing({ viewing: 'office' }, false)).toEqual({ label: 'Viewable at our office' });
  });

  it('store with a place: names the place, both languages', () => {
    const lot = { viewing: 'store', viewingPlace: 'محل الأمين، وسط البلد' };
    expect(resolveViewing(lot, true)).toEqual({ label: 'معاينة عند البائع · محل الأمين، وسط البلد' });
    expect(resolveViewing(lot, false)).toEqual({ label: 'Viewable at the seller: محل الأمين، وسط البلد' });
  });

  it('store without a place: still offers viewing, just unnamed', () => {
    expect(resolveViewing({ viewing: 'store' }, true)).toEqual({ label: 'معاينة عند البائع' });
    expect(resolveViewing({ viewing: 'store' }, false)).toEqual({ label: 'Viewable at the seller' });
  });

  it('store with a whitespace-only place is treated as no place', () => {
    expect(resolveViewing({ viewing: 'store', viewingPlace: '   ' }, true)).toEqual({ label: 'معاينة عند البائع' });
  });

  it('store trims surrounding whitespace from the place', () => {
    expect(resolveViewing({ viewing: 'store', viewingPlace: '  محل الأمين  ' }, false))
      .toEqual({ label: 'Viewable at the seller: محل الأمين' });
  });

  it('private renders nothing — a "no viewing" badge tells the buyer nothing actionable', () => {
    expect(resolveViewing({ viewing: 'private' }, true)).toBeNull();
    expect(resolveViewing({ viewing: 'private' }, false)).toBeNull();
  });

  it('unset renders nothing (every pre-existing lot)', () => {
    expect(resolveViewing({}, true)).toBeNull();
    expect(resolveViewing({ viewing: undefined }, false)).toBeNull();
    expect(resolveViewing({ viewing: null }, false)).toBeNull();
  });

  it('fails closed on unknown/garbage values rather than inventing a label', () => {
    expect(resolveViewing({ viewing: 'OFFICE' }, true)).toBeNull(); // case-sensitive by design
    expect(resolveViewing({ viewing: 'warehouse' }, false)).toBeNull();
    expect(resolveViewing({ viewing: '' }, false)).toBeNull();
  });

  it('ignores viewingPlace when the mode is not store', () => {
    expect(resolveViewing({ viewing: 'office', viewingPlace: 'محل الأمين' }, false))
      .toEqual({ label: 'Viewable at our office' });
    expect(resolveViewing({ viewing: 'private', viewingPlace: 'محل الأمين' }, false)).toBeNull();
  });

  it('never throws on a null/undefined auction', () => {
    expect(resolveViewing(null, true)).toBeNull();
    expect(resolveViewing(undefined, false)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/viewing.test.ts`
Expected: FAIL — `Failed to resolve import "./viewing"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/utils/viewing.ts`:

```ts
/**
 * Per-lot viewing: where (if anywhere) a buyer may physically view a lot before
 * bidding.
 *
 * Inspectability is a PER-LOT property. Not every item is at the Mazad office —
 * some sellers are physical stores a buyer can visit, others are private sellers
 * with no walk-in viewing at all. Any global claim ("we inspect everything",
 * "visit our office to see it") is therefore false for some subset of lots, which
 * is the bug this module exists to prevent.
 *
 * The rule: fail CLOSED. Unknown, missing, or malformed values render nothing.
 * Silence is always safe; a fabricated viewing claim is not.
 */

export type ViewingMode = 'office' | 'store' | 'private';

export interface ViewingSource {
  viewing?: string | null;
  viewingPlace?: string | null;
}

export function resolveViewing(
  auction: ViewingSource | null | undefined,
  isAr: boolean,
): { label: string } | null {
  const mode = auction?.viewing;

  if (mode === 'office') {
    return { label: isAr ? 'معاينة بمكاتبنا' : 'Viewable at our office' };
  }

  if (mode === 'store') {
    const place = typeof auction?.viewingPlace === 'string' ? auction.viewingPlace.trim() : '';
    if (!place) {
      return { label: isAr ? 'معاينة عند البائع' : 'Viewable at the seller' };
    }
    return {
      label: isAr ? `معاينة عند البائع · ${place}` : `Viewable at the seller: ${place}`,
    };
  }

  // 'private' and everything else (unset, unknown, garbage) render nothing.
  // 'private' deliberately matches unset: telling a buyer "no viewing" gives them
  // nothing to act on, and escrow already covers that case.
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/viewing.test.ts`
Expected: PASS — 10 passed.

- [ ] **Step 5: Commit**

```bash
git add src/utils/viewing.ts src/utils/viewing.test.ts
git commit -m "feat(viewing): pure per-lot viewing resolver

Fails closed to null for unset/unknown/private so a lot never shows a
viewing claim that was not explicitly set.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Type the fields on `AuctionItem`

**Files:**
- Modify: `src/types.ts` (inside `export interface AuctionItem`, after the `rejectionReason` field)

**Interfaces:**
- Consumes: `ViewingMode` from Task 1.
- Produces: `AuctionItem.viewing?: ViewingMode`, `AuctionItem.viewingPlace?: string` — read by Tasks 5 and 6, written by Tasks 3 and 4.

- [ ] **Step 1: Add the import**

At the top of `src/types.ts`, add:

```ts
import type { ViewingMode } from './utils/viewing';
```

- [ ] **Step 2: Add the fields**

In `src/types.ts`, find these two lines inside `export interface AuctionItem`:

```ts
  /** Admin-entered reason shown to the seller when a listing is rejected. */
  rejectionReason?: string;
```

Insert immediately after them:

```ts
  /**
   * Where a buyer may physically view this lot before bidding. Set by an admin at
   * the approval gate (or at admin drop-create). UNSET MEANS NOT STATED — the UI
   * renders nothing rather than assuming a location. See utils/viewing.ts.
   */
  viewing?: ViewingMode;
  /** Human-readable place, shown only when viewing === 'store'. Admin-entered. */
  viewingPlace?: string;
```

- [ ] **Step 3: Verify it typechecks**

Run: `npm run lint`
Expected: exits 0 with no output after the `> tsc --noEmit` banner.

- [ ] **Step 4: Commit**

```bash
git add src/types.ts
git commit -m "feat(viewing): type viewing/viewingPlace on AuctionItem

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Accept viewing in `approveListing`

**Files:**
- Modify: `src/context/AppContext.tsx` — the `approveListing` type declaration (~line 176) and the `useCallback` implementation (~line 3696) and its `updateDoc` payload (~line 3722).

**Interfaces:**
- Consumes: `ViewingMode` from Task 1.
- Produces: `approveListing(id: string, viewing?: ViewingMode, viewingPlace?: string): Promise<void>` — called by Task 4.

Both new params are optional, so the existing call sites in `src/components/AdminPanel.tsx:138` and `src/components/AdminDashboardView.tsx:788` keep compiling untouched.

- [ ] **Step 1: Widen the interface declaration**

In `src/context/AppContext.tsx`, find:

```ts
  approveListing: (id: string) => Promise<void>;
```

Replace with:

```ts
  approveListing: (id: string, viewing?: ViewingMode, viewingPlace?: string) => Promise<void>;
```

- [ ] **Step 2: Add the import**

Add to the imports at the top of `src/context/AppContext.tsx`:

```ts
import type { ViewingMode } from '../utils/viewing';
```

- [ ] **Step 3: Widen the implementation signature**

Find:

```ts
  const approveListing = useCallback(async (id: string) => {
```

Replace with:

```ts
  const approveListing = useCallback(async (id: string, viewing?: ViewingMode, viewingPlace?: string) => {
```

- [ ] **Step 4: Write the fields in the update payload**

Find this block (inside `approveListing`):

```ts
    const docRef = doc(db, 'auctions', id);
    updateDoc(docRef, {
      status: 'live',
      approvalStatus: 'approved',
      isApproved: true,
```

Replace with:

```ts
    const docRef = doc(db, 'auctions', id);
    updateDoc(docRef, {
      // Per-lot viewing, set by the admin on the approval card. Conditional spread:
      // Firestore rejects explicit `undefined`, and an approval that does not set
      // viewing must LEAVE IT UNSET (renders nothing) rather than write a value.
      ...(viewing ? { viewing } : {}),
      ...(viewing === 'store' && viewingPlace && viewingPlace.trim()
        ? { viewingPlace: viewingPlace.trim() }
        : {}),
      status: 'live',
      approvalStatus: 'approved',
      isApproved: true,
```

- [ ] **Step 5: Verify it typechecks**

Run: `npm run lint`
Expected: exits 0 with no errors. In particular no error at `AdminPanel.tsx:138` or `AdminDashboardView.tsx:788` — the extra params are optional.

- [ ] **Step 6: Commit**

```bash
git add src/context/AppContext.tsx
git commit -m "feat(viewing): approveListing accepts optional viewing + place

Optional params so the existing AdminPanel/AdminDashboardView call sites are
untouched. Conditional spread so an approval that sets nothing leaves the
fields unset (renders nothing) instead of writing undefined.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Viewing selector on the admin approval card

**Files:**
- Create: `src/components/admin/ViewingSelector.tsx`
- Modify: `src/components/admin/LaunchSection.tsx` — add local state near `repairResults` (~line 147), and replace the approve button block (~lines 276-283).

**Interfaces:**
- Consumes: `approveListing(id, viewing?, viewingPlace?)` from Task 3; `ViewingMode` from Task 1.
- Produces: `<ViewingSelector value onChange place onPlaceChange isAr accentClass />` from `src/components/admin/ViewingSelector.tsx` — **reused verbatim by Task 7**, which must import it rather than re-inline the markup.

Note: `rejectingId` / `setRejectingId` arrive as props from the shell, but the new viewing state is per-card UI state nothing else needs, so it is **local** — matching `repairResults`, which is already local in this component.

- [ ] **Step 1: Create the shared selector component**

Both admin surfaces that set viewing (this approval card and the drop-builder in
Task 7) need the same control, so it lives in one place. Create
`src/components/admin/ViewingSelector.tsx`:

```tsx
import React from 'react';
import type { ViewingMode } from '../../utils/viewing';

/**
 * Admin control for per-lot viewing. Shared by the approval card
 * (LaunchSection) and the drop-builder so the two cannot drift.
 *
 * Deliberately OPTIONAL: `value === ''` means "not stated", and a lot approved
 * that way renders no viewing claim at all. Tapping the selected chip clears
 * back to that state — an admin who mis-clicks must be able to un-state it.
 */

const OPTIONS: { id: ViewingMode; ar: string; en: string }[] = [
  { id: 'office', ar: 'بمكاتبنا', en: 'Our office' },
  { id: 'store', ar: 'عند البائع', en: 'Seller store' },
  { id: 'private', ar: 'بدون معاينة', en: 'No viewing' },
];

export interface ViewingSelectorProps {
  value: ViewingMode | '';
  onChange: (next: ViewingMode | '') => void;
  place: string;
  onPlaceChange: (next: string) => void;
  isAr: boolean;
  /** Selected-chip classes — the two admin surfaces use different accents. */
  accentClass?: string;
}

export const ViewingSelector: React.FC<ViewingSelectorProps> = ({
  value,
  onChange,
  place,
  onPlaceChange,
  isAr,
  accentClass = 'bg-emerald-600 text-white border-emerald-600',
}) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-[10px] font-bold text-gray-400 uppercase">
      {isAr ? 'المعاينة (اختياري)' : 'Viewing (optional)'}
    </span>
    <div className="flex gap-1.5">
      {OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(value === opt.id ? '' : opt.id)}
          className={`flex-1 text-[10px] font-bold py-1.5 rounded-lg border transition-all ${
            value === opt.id
              ? accentClass
              : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
          }`}
        >
          {isAr ? opt.ar : opt.en}
        </button>
      ))}
    </div>
    {value === 'store' && (
      <input
        type="text"
        value={place}
        onChange={(e) => onPlaceChange(e.target.value)}
        placeholder={isAr ? 'اسم المحل والموقع' : 'Store name and location'}
        className="w-full text-[11px] px-2.5 py-1.5 rounded-lg border border-gray-200 outline-none focus:border-emerald-500"
      />
    )}
  </div>
);
```

- [ ] **Step 2: Add the import**

At the top of `src/components/admin/LaunchSection.tsx`, add:

```ts
import type { ViewingMode } from '../../utils/viewing';
import { ViewingSelector } from './ViewingSelector';
```

- [ ] **Step 3: Add local state**

Find:

```ts
  const [repairResults, setRepairResults] = useState<Record<string, string>>({});
```

Insert immediately after:

```ts
  // Per-lot viewing, chosen per pending card before approving. Local because no
  // other surface needs it. Keyed by auction id so several cards can be staged
  // independently. Unset = approve without stating viewing (renders nothing).
  const [viewingById, setViewingById] = useState<Record<string, ViewingMode>>({});
  const [viewingPlaceById, setViewingPlaceById] = useState<Record<string, string>>({});
```

- [ ] **Step 4: Replace the approve button with selector + button**

Find this block:

```tsx
                      <div className="flex gap-2">
                        <button
                          onClick={() => approveListing(item.id)}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs py-2 rounded-xl transition-all shadow-xs"
                        >
                          {isAr ? 'الموافقة وإطلاق البث فوراً' : 'APPROVE & GO LIVE'}
                        </button>
```

Replace with:

```tsx
                      <div className="flex flex-col gap-2">
                        {/* Per-lot viewing. Optional: approving without a choice
                            leaves it unset, and the lot simply says nothing about
                            viewing rather than claiming a location. */}
                        <ViewingSelector
                          value={viewingById[item.id] || ''}
                          onChange={(next) =>
                            setViewingById((prev) => {
                              const updated = { ...prev };
                              if (next) updated[item.id] = next;
                              else delete updated[item.id];
                              return updated;
                            })
                          }
                          place={viewingPlaceById[item.id] || ''}
                          onPlaceChange={(next) =>
                            setViewingPlaceById((prev) => ({ ...prev, [item.id]: next }))
                          }
                          isAr={isAr}
                        />

                        <div className="flex gap-2">
                        <button
                          onClick={() =>
                            approveListing(item.id, viewingById[item.id], viewingPlaceById[item.id])
                          }
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs py-2 rounded-xl transition-all shadow-xs"
                        >
                          {isAr ? 'الموافقة وإطلاق البث فوراً' : 'APPROVE & GO LIVE'}
                        </button>
```

- [ ] **Step 5: Close the extra wrapper**

The block above opened one extra `<div className="flex gap-2">`. Find the reject button that follows the approve button, and the `</div>` that closed the original `flex gap-2` wrapper. Add one more `</div>` after it so the new outer `flex flex-col gap-2` is closed too.

Verify by typecheck rather than by eye — Step 5 catches an unbalanced tag as a JSX parse error.

- [ ] **Step 6: Verify it typechecks and builds**

Run: `npm run lint && npm run build`
Expected: `tsc` exits 0; build ends with `✓ built in …`. A JSX imbalance from Step 4 surfaces here as a parse error naming `LaunchSection.tsx`.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/ViewingSelector.tsx src/components/admin/LaunchSection.tsx
git commit -m "feat(viewing): shared viewing selector + wire it into the approval card

Three-way chip selector + a place input shown only for 'store'. Optional by
design: approving without choosing leaves viewing unset, so the lot states
nothing rather than claiming a location. Tapping the selected chip clears it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Render the viewing chip on mobile

**Files:**
- Modify: `src/components/MobileAuctionView.tsx` — add the resolver call near `conditionChip` (~line 145), and add the chip to the trust-chip row (~lines 424-441).

**Interfaces:**
- Consumes: `resolveViewing` from Task 1; `AuctionItem.viewing`/`viewingPlace` from Task 2.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the import**

Add to the imports at the top of `src/components/MobileAuctionView.tsx`:

```ts
import { resolveViewing } from '../utils/viewing';
```

- [ ] **Step 2: Resolve the chip**

Find:

```ts
  const categoryChip = activeAuction?.category
    ? categoryLabel(activeAuction.category, isAr)
    : null;
```

Insert immediately after:

```ts
  // Per-lot viewing. Null for private/unset — the row simply omits the chip
  // rather than stating a location this lot never had.
  const viewingChip = resolveViewing(activeAuction, isAr);
```

- [ ] **Step 3: Render it**

Find, inside the trust-chip row:

```tsx
            {conditionChip && (
              <span className="text-[10.5px] font-bold px-2.5 py-1 rounded-full bg-[#F7F7F7] text-[#444]">
                {conditionChip}
              </span>
            )}
          </div>
```

Replace with:

```tsx
            {conditionChip && (
              <span className="text-[10.5px] font-bold px-2.5 py-1 rounded-full bg-[#F7F7F7] text-[#444]">
                {conditionChip}
              </span>
            )}
            {viewingChip && (
              <span className="inline-flex items-center gap-1 text-[10.5px] font-bold px-2.5 py-1 rounded-full bg-[#F7F7F7] text-[#444]">
                <MapPin className="w-3 h-3" />
                {viewingChip.label}
              </span>
            )}
          </div>
```

- [ ] **Step 4: Import the icon**

The file already imports from `lucide-react` on line 3:

```ts
import { ChevronLeft, ChevronRight, Share2, CheckCircle2, Bookmark } from 'lucide-react';
```

Replace that line with:

```ts
import { ChevronLeft, ChevronRight, Share2, CheckCircle2, Bookmark, MapPin } from 'lucide-react';
```

- [ ] **Step 5: Verify**

Run: `npm run lint && npx vitest run && npm run build`
Expected: `tsc` exits 0; all tests pass; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/MobileAuctionView.tsx
git commit -m "feat(viewing): show the viewing chip on the mobile auction page

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Fix the desktop product-info row

The row currently hardcodes condition, shipping and location for every lot. After this task it renders only true, per-lot facts.

**Files:**
- Modify: `src/components/DesktopLiveAuctionLayout.tsx` — the row at lines 510-573 (`id="desktop-product-info-row"`).

**Interfaces:**
- Consumes: `resolveViewing` from Task 1; `AuctionItem.viewing`/`viewingPlace` from Task 2.
- Produces: nothing consumed by later tasks.

The row's dividers are per-child borders (`border-l …` on every block except the first). Once blocks can hide, three fixed siblings would leave a stray leading border, so the blocks are built as a filtered array and the divider is applied by **index**, not hardcoded.

- [ ] **Step 1: Add the import**

Add to the imports at the top of `src/components/DesktopLiveAuctionLayout.tsx`:

```ts
import { resolveViewing } from '../utils/viewing';
```

- [ ] **Step 2: Replace the entire row**

Replace lines 509-573 — the comment `{/* Product information row underneath video card */}` through the `</div>` that closes the row (the one immediately after the Auction ID block) — with:

```tsx
        {/* Product information row underneath video card.
            Every block here is REAL per-lot data. This row used to hardcode
            "NEW" / "Free Delivery" / "Amman, Jordan" for every lot regardless of
            the item. The 2026-07-25 mobile redesign spec called for deleting
            exactly these literals, but that pass was mobile-only. Condition now
            reads the auction field the
            way MobileAuctionView already does, shipping is gone (no shipping data
            backs it), and location is replaced by per-lot viewing. Blocks that
            have no data are omitted, and the divider is applied by index so the
            first VISIBLE block never carries a leading border. */}
        {(() => {
          const conditionLabel =
            activeAuction?.condition === 'new'
              ? (isAr ? 'جديد' : 'New')
              : activeAuction?.condition === 'used'
                ? (isAr ? 'مستعمل' : 'Used')
                : null;
          const viewing = resolveViewing(activeAuction, isAr);

          const blocks: { key: string; icon: React.ReactNode; label: string; value: React.ReactNode }[] = [];

          if (conditionLabel) {
            blocks.push({
              key: 'condition',
              icon: (
                <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500">
                  <ShieldCheck className="w-4.5 h-4.5" />
                </div>
              ),
              label: isAr ? 'حالة المنتج' : 'Product Condition',
              value: (
                <span className="text-[11px] font-black text-gray-800 mt-1 flex items-center gap-1.5 leading-none">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {conditionLabel}
                </span>
              ),
            });
          }

          if (viewing) {
            blocks.push({
              key: 'viewing',
              icon: (
                <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center text-blue-500">
                  <MapPin className="w-4.5 h-4.5" />
                </div>
              ),
              label: isAr ? 'المعاينة' : 'Viewing',
              value: (
                <span className="text-[11px] font-black text-gray-800 mt-1 leading-none">
                  {viewing.label}
                </span>
              ),
            });
          }

          blocks.push({
            key: 'auctionId',
            icon: (
              <div className="w-9 h-9 rounded-full bg-zinc-50 flex items-center justify-center text-zinc-500">
                <Trophy className="w-4.5 h-4.5" />
              </div>
            ),
            label: isAr ? 'رقم المزاد' : 'Auction ID',
            value: (
              <span className="text-[11px] font-mono font-bold text-gray-800 mt-1 flex items-center gap-1.5 leading-none">
                <span>#{activeAuction.id?.slice(0, 8).toUpperCase() || 'AUC-78291'}</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(activeAuction.id || '');
                  }}
                  className="text-gray-400 hover:text-gray-600 cursor-pointer"
                  title="Copy"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </span>
            ),
          });

          return (
            <div
              className="bg-white border border-gray-200/80 rounded-2xl p-3.5 mt-3 flex items-center justify-between shadow-xs shrink-0 w-[calc((100vh-220px)*9/16)] max-w-full mx-auto"
              id="desktop-product-info-row"
              style={{ direction: isAr ? 'rtl' : 'ltr' }}
            >
              {blocks.map((block, i) => (
                <div
                  key={block.key}
                  className={`flex items-center gap-2.5 ${
                    i > 0 ? 'border-l rtl:border-r rtl:border-l-0 border-gray-100 pl-4 pr-4' : ''
                  }`}
                >
                  {block.icon}
                  <div className="text-left rtl:text-right">
                    <span className="text-[9px] text-gray-400 font-bold block uppercase leading-none">
                      {block.label}
                    </span>
                    {block.value}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
```

- [ ] **Step 3: Drop the now-unused Truck import**

The shipping block was the only consumer of `Truck`. Find `Truck,` in the `lucide-react` import block near the top of the file and delete that line.

If `tsc` in Step 4 reports `Truck` as still used elsewhere, restore the line — the file is large and this plan asserts only that the block removed here used it.

- [ ] **Step 4: Verify**

Run: `npm run lint && npx vitest run && npm run build`
Expected: `tsc` exits 0 with no unused-import or JSX errors; all tests pass; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/DesktopLiveAuctionLayout.tsx
git commit -m "fix(desktop): real per-lot data in the product-info row

The row hardcoded NEW / Free Delivery / Amman, Jordan for every lot. The
2026-07-25 mobile redesign spec called for deleting exactly these literals but
that pass was mobile-only. Condition now reads activeAuction.condition the way
MobileAuctionView already does; shipping is removed (no shipping data backs
it, so it promised a delivery we may not make); location is replaced by the
per-lot viewing chip. Blocks with no data are omitted and the divider is
applied by index, so the first visible block never carries a stray border.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Viewing selector in the admin drop-builder

For lots Mazad creates directly, which never pass a separate approval step.

**Files:**
- Modify: `src/components/AuctionDropBuilderView.tsx` — add state alongside the other field state, a selector in the form, and the fields in the `createListing` payload (~line 181-215).

**Interfaces:**
- Consumes: `ViewingMode` from Task 1; `AuctionItem.viewing`/`viewingPlace` from Task 2; `<ViewingSelector />` from Task 4 — **import it, do not re-inline the markup**.
- Produces: nothing.

- [ ] **Step 1: Add the import**

Add to the imports at the top of `src/components/AuctionDropBuilderView.tsx`:

```ts
import type { ViewingMode } from '../utils/viewing';
import { ViewingSelector } from './admin/ViewingSelector';
```

- [ ] **Step 2: Add state**

Find this line (line 52) in the component body:

```ts
  const [startingPrice, setStartingPrice] = useState('');
```

Add immediately after it:

```ts
  // Per-lot viewing for admin-created drops. Optional — unset means the lot
  // states nothing about viewing (renders nothing) rather than claiming a place.
  const [viewing, setViewing] = useState<ViewingMode | ''>('');
  const [viewingPlace, setViewingPlace] = useState('');
```

- [ ] **Step 3: Write the fields into the payload**

Find, inside the `createListing` call:

```ts
          // Conditional spread: Firestore setDoc rejects explicit `undefined` values
          // (ignoreUndefinedProperties is not enabled), so omit the key when blank.
          ...(extraPhotoUrls.length > 0 ? { mediaUrls: extraPhotoUrls } : {}),
```

Replace with:

```ts
          // Conditional spread: Firestore setDoc rejects explicit `undefined` values
          // (ignoreUndefinedProperties is not enabled), so omit the key when blank.
          ...(viewing ? { viewing } : {}),
          ...(viewing === 'store' && viewingPlace.trim() ? { viewingPlace: viewingPlace.trim() } : {}),
          ...(extraPhotoUrls.length > 0 ? { mediaUrls: extraPhotoUrls } : {}),
```

- [ ] **Step 4: Add the selector to the form**

The component defines `const isAr = language === 'ar';` at line 49, so `isAr` below is correct as written.

Find the JSX label/input group for the starting price field. Immediately after that group's closing tag, insert:

```tsx
              {/* Per-lot viewing — optional. Same control as the approval card. */}
              <ViewingSelector
                value={viewing}
                onChange={setViewing}
                place={viewingPlace}
                onPlaceChange={setViewingPlace}
                isAr={isAr}
                accentClass="bg-[#F05123] text-white border-[#F05123]"
              />
```

- [ ] **Step 5: Verify**

Run: `npm run lint && npx vitest run && npm run build`
Expected: `tsc` exits 0; all tests pass; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/AuctionDropBuilderView.tsx
git commit -m "feat(viewing): viewing selector in the admin drop-builder

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Close the backlog item and open the PR

**Files:**
- Modify: `docs/BACKLOG.md`

- [ ] **Step 1: Record the fix in the backlog**

The hardcoded desktop literals were never a numbered backlog item — they were flagged in `docs/superpowers/specs/2026-07-25-mobile-auction-redesign-design.md` ("read condition/location/shipping from the auction doc; delete the hardcoded literals … never show fake"), and that pass was mobile-only. So add a new entry rather than editing an existing one.

In `docs/BACKLOG.md`, find the last item in the `## 🟡 P2 — Polish` section (item 21, about mixed numerals) and add after it:

```markdown
22. ~~**Hardcoded lot details on the DESKTOP auction page** — condition "NEW", "Free Delivery" and "Amman, Jordan" were string literals shown for every lot. The 2026-07-25 mobile redesign fixed this on mobile only.~~ ✅ **Fixed 2026-07-26** — the desktop product-info row now renders real per-lot data: condition from `activeAuction.condition`, and location replaced by the new per-lot `viewing` field. "Free Delivery" is gone — no shipping data backed it. See `docs/superpowers/specs/2026-07-26-per-lot-viewing-design.md`.
```

Note the `## 🧰 Infra / runbook` section that follows renumbers from 22 — leave those numbers alone; the list is not strictly sequential across sections and renumbering would churn the diff.

- [ ] **Step 2: Full verification**

Run: `npm run lint && npx vitest run && npm run build`
Expected: `tsc` exits 0; all tests pass (the suite was 581 before this plan, plus 10 from Task 1); build succeeds.

- [ ] **Step 3: Commit and push**

```bash
git add docs/BACKLOG.md
git commit -m "docs: close the hardcoded auction-details backlog item

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push -u origin feat/per-lot-viewing
```

- [ ] **Step 4: Open the PR**

```bash
gh pr create --title "feat(viewing): per-lot viewing, and real data in the desktop product-info row" --body "Implements docs/superpowers/specs/2026-07-26-per-lot-viewing-design.md

## Why

Inspectability is a per-lot property, but the app stated it globally — so every phrasing was false for some subset of lots. PR #139 stopped the landing page lying by leading with escrow and saying viewing varies by seller. This makes that a fact each lot carries.

## What

- \`viewing?: 'office' | 'store' | 'private'\` and \`viewingPlace?: string\` on the auction doc. Both optional; **unset renders nothing**, so no migration and no existing lot changes behaviour.
- \`src/utils/viewing.ts\` — one pure resolver, 10 unit tests. Fails closed to null on unset/unknown/private, so a lot can never show a viewing claim that was not explicitly set.
- Set by the admin at the existing mandatory approval gate (\`LaunchSection\`) and in the admin drop-builder. Not exposed to self-serve sellers — they should not self-declare that buyers may visit them.
- Renders as a chip on the mobile auction page and in the desktop product-info row.

## Also fixes

The desktop product-info row hardcoded \`NEW\` / \`Free Delivery\` / \`Amman, Jordan\` for every lot — the 2026-07-25 mobile redesign called for deleting these but only covered mobile. Condition now reads the real field the way mobile already does, \`Free Delivery\` is removed (no shipping data backs it), and location becomes the per-lot viewing chip. Blocks with no data are omitted and dividers apply by index, so the first visible block never carries a stray border.

## Verification

\`tsc --noEmit\` clean · full vitest suite passes · \`vite build\` clean

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## Notes for the implementer

- **Do not** add a "no viewing available" badge for `private`. It renders nothing on purpose; the spec explains why.
- **Do not** default `viewing` to `'office'` for existing lots. Unset must stay unset.
- Arabic strings are copied verbatim in this plan. Paste them; do not retype.
