# Scheduled Auto-Open Implementation Plan (Phase 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let the team schedule an auction's start time; a 1-minute Cloud Function opens it automatically at that time. Also add the pre-open room state so a scheduled-but-not-yet-open auction shows "opens in X" instead of a live bid button + running end-countdown.

**Architecture:** Mirror the existing `scheduledAuctionCloser` with a new `scheduledAuctionOpener` (v1 pubsub cron, 1 min) that flips `upcoming` auctions whose `scheduledStartAt` has arrived to `live`, resetting the authoritative timer at open. The drop-builder gets a real `datetime-local` picker (interpreted as Amman/UTC+3) that populates `scheduledStartAt`. Two pure, unit-tested helpers (`isAuctionOpen`, Amman time parse/format) back the UI guard that gates the bid controls + countdown on open state. Manual "open now" (the existing `approveListing`) keeps working — the opener only touches auctions that have a `scheduledStartAt` set.

**Tech Stack:** React 19 + TS + Vite (client, vitest), Node 20 + firebase-functions v1 (Cloud Functions — no test runner there).

## Global Constraints

- **Runtime deps:** add NO new dependencies (client or functions).
- **Additive/mirroring:** do not modify `scheduledAuctionCloser`, bid logic, escrow, or existing money paths. The opener is a NEW export mirroring the closer's pattern.
- **Opener gate:** the opener acts ONLY on docs with `status === 'upcoming'` AND a non-null `scheduledStartAt` that is `<= now`. Auctions with `scheduledStartAt == null` are left for manual `approveListing` (manual/auto coexistence).
- **Timer reset at open:** at open, recompute `endTime`/`endsAt` from `duration` (seconds) exactly like `approveListing` does (`AppContext.tsx:2738-2752`) — the countdown starts at real open time, not creation time.
- **Timezone:** Jordan is permanently **UTC+3, no DST**. Parse the `datetime-local` wall-clock as `+03:00`; format displays in Amman time. No timezone library.
- **`isAuctionOpen(status)` = `status === 'live' || status === 'active'`** — the single definition of "open," used by every UI guard.
- **Client typecheck gate:** `npm run lint` (= `tsc --noEmit`) must pass after every client task. Functions are plain JS (no tsc); verify by review + the documented manual Firestore test.
- **Follow existing patterns:** inline `isAr ? ... : ...` i18n + inline-RTL; the `'ar-JO' : 'en-US'` locale pair convention.

---

### Task 1: `isAuctionOpen` helper (pure, TDD)

**Files:**
- Create: `src/utils/auctionPhase.ts`
- Test: `src/utils/auctionPhase.test.ts`

**Interfaces:**
- Produces: `export function isAuctionOpen(status: string | null | undefined): boolean`

- [ ] **Step 1: Write the failing test**

Create `src/utils/auctionPhase.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { isAuctionOpen } from './auctionPhase';

describe('isAuctionOpen', () => {
  it('is true only for live/active', () => {
    expect(isAuctionOpen('live')).toBe(true);
    expect(isAuctionOpen('active')).toBe(true);
  });
  it('is false for upcoming, completed, and missing', () => {
    expect(isAuctionOpen('upcoming')).toBe(false);
    expect(isAuctionOpen('completed')).toBe(false);
    expect(isAuctionOpen(undefined)).toBe(false);
    expect(isAuctionOpen(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`npx vitest run src/utils/auctionPhase.test.ts`; cannot resolve module).

- [ ] **Step 3: Implement**

Create `src/utils/auctionPhase.ts`:
```ts
// "Open" = accepting bids. Mirrors the server's placeBid gate
// (functions/index.js: status must be 'live' or 'active').
export function isAuctionOpen(status: string | null | undefined): boolean {
  return status === 'live' || status === 'active';
}
```

- [ ] **Step 4: Run — expect PASS** (2 tests).
- [ ] **Step 5: Typecheck** (`npm run lint`) — clean.
- [ ] **Step 6: Commit**
```bash
cd /Users/mj/code/mazzado
git add src/utils/auctionPhase.ts src/utils/auctionPhase.test.ts
git commit -m "feat(auto-open): add isAuctionOpen helper"
```

---

### Task 2: Amman time helpers (pure, TDD)

**Files:**
- Create: `src/utils/ammanTime.ts`
- Test: `src/utils/ammanTime.test.ts`

**Interfaces:**
- Produces:
  - `export function parseAmmanLocalToMs(value: string): number | null` — a `datetime-local` string `"YYYY-MM-DDTHH:mm"` interpreted as Amman (+03:00) wall-clock → epoch ms; `null` on empty/invalid.
  - `export function formatAmmanClock(ms: number): string` — epoch ms → `"H:MM"` 24-hour Amman time.

- [ ] **Step 1: Write the failing test**

Create `src/utils/ammanTime.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseAmmanLocalToMs, formatAmmanClock } from './ammanTime';

describe('parseAmmanLocalToMs', () => {
  it('interprets the wall-clock as Amman +03:00', () => {
    // 19:30 Amman == 16:30 UTC
    expect(parseAmmanLocalToMs('2026-07-14T19:30')).toBe(Date.parse('2026-07-14T16:30:00Z'));
  });
  it('returns null for empty or invalid input', () => {
    expect(parseAmmanLocalToMs('')).toBeNull();
    expect(parseAmmanLocalToMs('not-a-date')).toBeNull();
  });
});

describe('formatAmmanClock', () => {
  it('formats epoch ms as H:MM in Amman time', () => {
    expect(formatAmmanClock(Date.parse('2026-07-14T16:30:00Z'))).toBe('19:30');
    expect(formatAmmanClock(Date.parse('2026-07-14T05:05:00Z'))).toBe('8:05');
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement**

Create `src/utils/ammanTime.ts`:
```ts
// Jordan is permanently UTC+3 (no DST since 2022).
const AMMAN_OFFSET_MS = 3 * 60 * 60 * 1000;

// datetime-local "YYYY-MM-DDTHH:mm" (Amman wall-clock) -> epoch ms.
export function parseAmmanLocalToMs(value: string): number | null {
  if (!value) return null;
  const ms = Date.parse(`${value}:00+03:00`);
  return Number.isNaN(ms) ? null : ms;
}

// epoch ms -> "H:MM" 24-hour Amman time (offset math avoids ICU dependence).
export function formatAmmanClock(ms: number): string {
  const d = new Date(ms + AMMAN_OFFSET_MS);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  return `${h}:${m.toString().padStart(2, '0')}`;
}
```

- [ ] **Step 4: Run — expect PASS** (4 tests).
- [ ] **Step 5: Typecheck** — clean.
- [ ] **Step 6: Commit**
```bash
cd /Users/mj/code/mazzado
git add src/utils/ammanTime.ts src/utils/ammanTime.test.ts
git commit -m "feat(auto-open): add Amman time parse/format helpers"
```

---

### Task 3: `scheduledAuctionOpener` Cloud Function

**Files:**
- Modify: `functions/index.js` (add a new export, mirroring `scheduledAuctionCloser` at :13)

**Interfaces:**
- Produces: a new scheduled function `scheduledAuctionOpener`. No client-visible interface.

- [ ] **Step 1: Read the closer for the exact pattern**

Read `functions/index.js:13-181` (`scheduledAuctionCloser`) and the admin go-live clock reset in the app (`src/context/AppContext.tsx:2738-2752`). The opener reuses the same v1 pubsub syntax, per-doc `map` + `Promise.all`, and a `runTransaction` re-check.

- [ ] **Step 2: Add the opener export**

Add this new export in `functions/index.js` (place it immediately after `scheduledAuctionCloser` ends, before the next export):
```js
/**
 * scheduledAuctionOpener
 * Runs every minute; flips `upcoming` auctions whose scheduledStartAt has
 * arrived to `live`, resetting the countdown from `duration` at open time.
 * Only touches auctions that HAVE a scheduledStartAt (null = manual open).
 */
exports.scheduledAuctionOpener = functions.pubsub
  .schedule('every 1 minutes')
  .onRun(async (context) => {
    const nowMs = admin.firestore.Timestamp.now().toMillis();
    try {
      const snap = await db.collection('auctions').where('status', '==', 'upcoming').get();
      if (snap.empty) return null;

      const promises = snap.docs.map(async (docSnap) => {
        const data = docSnap.data();
        let startMs = data.scheduledStartAt;
        if (startMs === null || startMs === undefined) return; // manual-open drop; skip
        if (typeof startMs === 'object' && typeof startMs.toMillis === 'function') {
          startMs = startMs.toMillis();
        } else if (typeof startMs !== 'number') {
          startMs = new Date(startMs).getTime();
        }
        if (!(startMs > 0) || startMs > nowMs) return; // not due yet

        const durationSec = Number(data.duration) > 0 ? Number(data.duration) : 600;

        return db.runTransaction(async (tx) => {
          const fresh = await tx.get(docSnap.ref);
          const fd = fresh.data();
          if (!fd || fd.status !== 'upcoming') return; // already opened / changed
          const openMs = admin.firestore.Timestamp.now().toMillis();
          const endMs = openMs + durationSec * 1000;
          tx.update(docSnap.ref, {
            status: 'live',
            // Mirror approveListing's go-live fields so an auto-opened auction is
            // NOT left counted as a pending approval (AdminDashboardView badge,
            // SellerCenterView bucket) and sorts correctly (LiveStreamView uses approvedAt).
            approvalStatus: 'approved',
            isApproved: true,
            approvedAt: admin.firestore.FieldValue.serverTimestamp(),
            openedAt: admin.firestore.FieldValue.serverTimestamp(),
            endTime: endMs,
            endsAt: admin.firestore.Timestamp.fromMillis(endMs),
          });
        }).catch((err) => console.error(`[scheduledAuctionOpener] open failed for ${docSnap.id}`, err));
      });

      await Promise.all(promises);
    } catch (err) {
      console.error('[scheduledAuctionOpener]', err);
    }
    return null;
  });
```

- [ ] **Step 3: Sanity-check the file parses**

Run: `cd /Users/mj/code/mazzado/functions && node --check index.js`
Expected: no output (syntax OK).

- [ ] **Step 4: Document the manual verification (no CF test runner exists)**

In the report, record the manual test for a human to run after deploy: create an auction with `status:'upcoming'` and `scheduledStartAt` a few minutes in the past → within ~1 min the doc flips to `status:'live'` with a fresh `endTime`/`endsAt` (~`duration` from now) and an `openedAt`; an `upcoming` doc with `scheduledStartAt:null` is left untouched.

- [ ] **Step 5: Commit**
```bash
cd /Users/mj/code/mazzado
git add functions/index.js
git commit -m "feat(auto-open): add scheduledAuctionOpener cloud function"
```

---

### Task 4: Drop-builder date/time picker → real `scheduledStartAt`

**Files:**
- Modify: `src/components/DropBuilderView.tsx`

**Interfaces:**
- Consumes: `parseAmmanLocalToMs`, `formatAmmanClock` (Task 2).

- [ ] **Step 1: Read the current component**

Read `src/components/DropBuilderView.tsx` — the `startTime` state (~:21), its `<input placeholder="7:30">` (~:142-144), the `buildAuctionCaption({..., startTime})` call (~:52), and the `createListing({..., endTime, scheduledStartAt: null}, ..., 'upcoming')` call (~:86-106). Line numbers are approximate; confirm by reading.

- [ ] **Step 2: Replace the free-text start with a datetime picker**

Replace the `startTime` string state with a `datetime-local` value, and derive the epoch ms + the caption's display time from it:
```tsx
// state: replace `const [startTime, setStartTime] = useState('');`
const [scheduledLocal, setScheduledLocal] = useState(''); // "YYYY-MM-DDTHH:mm" (Amman)

// derived (near the other useMemo/derived values):
const scheduledStartAtMs = useMemo(() => parseAmmanLocalToMs(scheduledLocal), [scheduledLocal]);
const startTimeDisplay = useMemo(
  () => (scheduledStartAtMs != null ? formatAmmanClock(scheduledStartAtMs) : '—'),
  [scheduledStartAtMs],
);
```
Add the imports at the top:
```tsx
import { parseAmmanLocalToMs, formatAmmanClock } from '../utils/ammanTime';
```

- [ ] **Step 3: Feed the caption from the derived display time**

In the `buildAuctionCaption({ ... })` call, change `startTime: startTime.trim() || '—'` to:
```tsx
        startTime: startTimeDisplay,
```

- [ ] **Step 4: Replace the input control**

Replace the free-text start-time `<label>...<input placeholder="7:30" .../></label>` block with:
```tsx
        <label className="block text-sm">{isAr ? 'وقت البدء (توقيت عمّان)' : 'Start time (Amman)'}
          <input
            type="datetime-local"
            className="mt-1 w-full border rounded p-2"
            value={scheduledLocal}
            onChange={(e) => setScheduledLocal(e.target.value)}
          />
        </label>
```

- [ ] **Step 5: Pass `scheduledStartAt` + a start-anchored `endTime` to createListing**

In the `createListing({ ... })` payload, change:
```tsx
      endTime: Date.now() + durationSeconds * 1000,
      ...
      scheduledStartAt: null,
```
to:
```tsx
      endTime: (scheduledStartAtMs ?? Date.now()) + durationSeconds * 1000,
      ...
      scheduledStartAt: scheduledStartAtMs,
```
(`scheduledStartAtMs` is `number | null`; `null` means no schedule → manual open, and the opener skips it. Keep `initialStatus` `'upcoming'`.)

- [ ] **Step 5b: Reject a past start time**

A `datetime-local` accepts past values; a past `scheduledStartAt` would make the creation-time `endTime` already expired, flashing "Auction Ended" until the opener flips it. In `handleCreate`, alongside the existing product-name/price validation, add a guard BEFORE calling `createListing`:
```tsx
    if (scheduledStartAtMs != null && scheduledStartAtMs <= Date.now()) {
      setError(isAr ? 'وقت البدء يجب أن يكون في المستقبل' : 'Start time must be in the future');
      return;
    }
```
(Blank/`null` is allowed — that means manual open.)

- [ ] **Step 6: Typecheck + tests**

Run: `cd /Users/mj/code/mazzado && npm run lint && npx vitest run`
Expected: clean; all pure tests pass.

- [ ] **Step 7: Verify in the running app**

Run: `npm run dev`, open the drop-builder as admin. Pick a start time → confirm the caption preview's "يبدأ الساعة" shows the matching Amman time. Create a drop → confirm no error. (Firestore field check happens in Task 6's end-to-end.) Stop the server.

- [ ] **Step 8: Commit**
```bash
cd /Users/mj/code/mazzado
git add src/components/DropBuilderView.tsx
git commit -m "feat(auto-open): drop-builder datetime picker sets scheduledStartAt"
```

---

### Task 5: Pre-open room guard (bid controls + countdown gated on open)

**Files:**
- Modify: `src/components/LiveStreamView.tsx` (countdown logic ~:211-235)
- Modify: `src/components/MobileLiveAuctionLayout.tsx` (bid card ~:722-791, `isEnded` ~:260) — mobile
- Modify: `src/components/DesktopLiveAuctionLayout.tsx` (SwipeToBid ~:553-556, `isEnded` ~:107) — **the primary desktop room surface** (rendered by `LiveStreamView.tsx:628`)
- Modify: `src/components/ReelsDesktopRightPanel.tsx` (SwipeToBid ~:117-126, own countdown ~:24-47) — the reels/`DesktopFrame` surface

**Interfaces:**
- Consumes: `isAuctionOpen` (Task 1), `formatAmmanClock` (Task 2).

**CRITICAL — the auction variable name differs per file:** `activeAuction` in `LiveStreamView`, `auction` in `MobileLiveAuctionLayout` and `DesktopLiveAuctionLayout`, and **`currentItem`** in `ReelsDesktopRightPanel`. Read each file and use the correct name — a wrong name won't compile.

- [ ] **Step 1: Read all four components** at the cited lines to confirm the exact prop/variable names (`activeAuction` / `auction` / `currentItem`, `status`, `scheduledStartAt`, `endTime`, `nextBidAmount`). Line numbers approximate — match the real code.

- [ ] **Step 2: LiveStreamView — countdown to *start* when not open**

In the countdown effect (`~:211-235`), the current code computes `timeLeftStr` from `activeAuction.endTime - Date.now()` regardless of status. Change it so that when the auction is not open AND has a `scheduledStartAt`, the countdown targets the start; otherwise the end. Concretely, compute the target once:
```tsx
import { isAuctionOpen } from '../utils/auctionPhase';
// ...
const open = isAuctionOpen(activeAuction?.status);
const target = !open && activeAuction?.scheduledStartAt
  ? activeAuction.scheduledStartAt
  : activeAuction?.endTime;
const remainingMs = (target ?? 0) - Date.now();
```
Use `remainingMs` where `activeAuction.endTime - Date.now()` was used to build `timeLeftStr`. Keep `secondsRemaining` (the final-10s overlay/sfx) gated on `status === 'live'` as it already is — do NOT trigger the closing sfx for a pre-open countdown. Preserve the existing formatting of `timeLeftStr`.

**Also handle the T-0 dead zone:** when NOT open and `remainingMs <= 0` (the scheduled start has passed but the 1-minute cron hasn't flipped it yet — up to ~60s), do NOT fall into the existing `remainingSecs <= 0` "next 4-hour boundary" fake-clock branch (`~:227-235`). Instead show a "starting…" state:
```tsx
if (!open && (activeAuction?.scheduledStartAt ?? 0) > 0 && remainingMs <= 0) {
  setTimeLeftStr(isAr ? 'يبدأ الآن…' : 'Starting…');
  return; // skip the 4-hour-boundary fallback
}
```
(Match `setTimeLeftStr`/the actual state setter name in the file.)

- [ ] **Step 3: MobileLiveAuctionLayout — replace bid button with a "starts at" panel when not open**

Import the helpers:
```tsx
import { isAuctionOpen } from '../utils/auctionPhase';
import { formatAmmanClock } from '../utils/ammanTime';
```
In the bidding card (`~:722-791`), gate the live bid button on open state. Where the bid button is rendered (the `if (isEnded) {...} else {...}` region at ~:779), add a not-open branch BEFORE the bid button so that when `!isAuctionOpen(auction?.status)` and not ended, it shows:
```tsx
{!isAuctionOpen(auction?.status) ? (
  <div className="w-full rounded-xl bg-neutral-800 text-white text-center p-4">
    <div className="text-sm opacity-80">{isAr ? 'يبدأ المزاد' : 'Auction starts'}</div>
    <div className="text-lg font-bold">
      {auction?.scheduledStartAt ? formatAmmanClock(auction.scheduledStartAt) : (isAr ? 'قريباً' : 'Soon')}
    </div>
  </div>
) : (
  /* existing bid button JSX unchanged */
)}
```
(Keep the existing `isEnded` ended-panel branch as the outermost condition; the not-open branch applies only when not ended.)

- [ ] **Step 4a: DesktopLiveAuctionLayout — gate the primary desktop bid slider (the surface `LiveStreamView` actually renders)**

This is the main desktop room (`LiveStreamView.tsx:628` renders it). Import the helpers:
```tsx
import { isAuctionOpen } from '../utils/auctionPhase';
import { formatAmmanClock } from '../utils/ammanTime';
```
The auction variable here is `auction`. Around the `SwipeToBid` (`~:553-556`, `disabled={currentUser?.isBlocked || wallet.availableBalance < nextBidAmount}`), gate on open state exactly like the mobile layout: when `!isAuctionOpen(auction?.status)` and not ended, render a "starts at" panel instead of the slider:
```tsx
{!isAuctionOpen(auction?.status) ? (
  <div className="w-full rounded-xl bg-neutral-800 text-white text-center p-4">
    <div className="text-sm opacity-80">{isAr ? 'يبدأ المزاد' : 'Auction starts'}</div>
    <div className="text-lg font-bold">
      {auction?.scheduledStartAt ? formatAmmanClock(auction.scheduledStartAt) : (isAr ? 'قريباً' : 'Soon')}
    </div>
  </div>
) : (
  /* existing <SwipeToBid ... /> JSX unchanged */
)}
```
Keep the existing `isEnded` (`~:107`) ended-panel as the outer condition; the not-open branch applies only when not ended.

- [ ] **Step 4b: ReelsDesktopRightPanel — disable swipe + retarget its own countdown**

The auction variable here is **`currentItem`** (not `auction`). Import `isAuctionOpen` + `formatAmmanClock`. Two changes:
1. At the `<SwipeToBid ... disabled={...} />` (`~:117-126`), add `|| !isAuctionOpen(currentItem?.status)` to the existing `disabled` expression, and render a small "starts at {formatAmmanClock(currentItem.scheduledStartAt)}" label near it when `!isAuctionOpen(currentItem?.status)`.
2. This panel has its OWN "TIME LEFT" countdown to `endTime` (`~:24-47`). When `!isAuctionOpen(currentItem?.status)` and `currentItem?.scheduledStartAt`, target that countdown at `scheduledStartAt` and relabel it (isAr ? 'يبدأ خلال' : 'Starts in'); otherwise leave it as the end-countdown.

- [ ] **Step 5: Typecheck + tests**

Run: `cd /Users/mj/code/mazzado && npm run lint && npx vitest run`
Expected: clean; pure tests pass.

- [ ] **Step 6: Verify in the running app**

Run: `npm run dev`. With an `upcoming` auction whose `scheduledStartAt` is in the future: open its room → confirm NO live bid button/swipe (a "starts at HH:MM" panel instead) and the countdown reads time-to-start, with no closing sfx. (Full open transition is verified in Task 6.) Stop the server.

- [ ] **Step 7: Commit**
```bash
cd /Users/mj/code/mazzado
git add src/components/LiveStreamView.tsx src/components/MobileLiveAuctionLayout.tsx src/components/DesktopLiveAuctionLayout.tsx src/components/ReelsDesktopRightPanel.tsx
git commit -m "feat(auto-open): gate bid controls + countdown on open state"
```

---

## Notes for the executor

- **Line numbers are approximate** across `DropBuilderView`, `LiveStreamView`, `MobileLiveAuctionLayout`, `ReelsDesktopRightPanel`, and `functions/index.js` — always read the region first and match the real variable names (`activeAuction` vs `auction` differs between LiveStreamView and the layout components).
- **Cloud Functions have no test runner and can't be exercised locally without the emulator** — Task 3 is verified by `node --check` + code review + the documented post-deploy manual test. Do NOT fabricate a passing functional test.
- **Manual open still works:** `approveListing` is untouched; the opener skips `scheduledStartAt == null`. An operator can still open early.
- **Deploy is separate:** `scheduledAuctionOpener` goes live only on `firebase deploy --only functions` — call that out in the final summary as a required deploy step (not done by this plan).
