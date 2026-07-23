# Admin UX — Slice A: "Launch" Workspace

**Date:** 2026-07-23
**Status:** Approved (design), pending implementation plan
**Scope:** The auction drop / launch workflow (team Job 3). First slice of a larger admin reorganization.

## Context & Problem

The Mazad JO internal team runs the business through `AdminDashboardView.tsx` — a 2,955-line component with 10 tabs organized **by database entity** (`metrics · orders · payments · withdrawals · listings · users · subscriptions · sessions · health · simulator`). The team, however, works in **jobs**, not entities. Their four primary jobs each span multiple tabs, so no screen matches a single task, and the admin reads as busy and unintuitive.

The four team jobs:
1. Verify payment & approve members (spans `payments` + `subscriptions` + `users`)
2. Follow up with buyers/sellers to facilitate the transaction (spans `orders` + `withdrawals`)
3. **Launch auctions & copy to WhatsApp** (the drop builder is a *separate view*, plus `listings`)
4. Handle transaction issues (spans `orders` disputed/defaulted + `health`)

**North star:** reorganize the admin around the four jobs, with a role-based home and a per-job "needs attention" queue. Work context: team uses **both desktop and phone** (responsive), and work is **split by role** (each person owns a job).

This spec covers **only Slice A — the Launch job (Job 3)**, the highest-priority pain point and where the request originated. The north-star shell is built incrementally as slices land; it is NOT part of this slice.

## Current State (verified in code)

- Entry point: `AdminDashboardView.tsx:1073` has an "Auction Drop (واتساب)" button → `setActiveView('auction-drop-builder')`, a **separate full-page view** (`AuctionDropBuilderView.tsx`).
- The builder is a single ~10-field vertical form + a live caption preview + Copy-caption / Copy-link buttons. On create it calls `createListing(...)` with `initialStatus: 'upcoming'` and shows the final deep link.
- **Media:** builder passes a single `thumbnailFile`. The seller wizard (`ListingWizardView.tsx`) *already* supports cover + up to 3 gallery photos → `mediaUrls` (`types.ts:98`), and the display layer renders them (media gallery restored in PR #56). Video is supported by `createListing` (`videoFile` param) but the builder never passes one.
- **Auction number:** the "Auction number" field is free-text `title` state, doing double duty as both the caption's auction number AND the listing title fallback (`title: title.trim() || productName.trim()`). No counter exists anywhere in `src/` or `functions/`.
- **Reserve price:** does not exist in the form, `types.ts`, or the settle engine.

## Goals

Turn the drop builder from a fire-and-forget form into the **Launcher's workspace**, and close the three capability gaps (media, auto-number, reserve).

### 1. Drops list beside the form
Add a panel listing the launcher's drops grouped **Upcoming / Live / Recently-ended**, sourced from existing auctions data (no new backend). Each row shows auction number, product, status, start time, current price/bids, and quick Copy-caption / Copy-link / Copy-image actions so a launcher can re-post or check status without re-opening the form. This gives the workflow memory: what's scheduled, what's live, what still needs posting.

### 2. Auto auction number (simple incrementing integer)
- A server-authoritative atomic counter at Firestore doc `counters/auctionNumber` (field `value`).
- Incremented **inside the listing-create transaction** so concurrent launches never collide or skip. The assigned number is written to the new auction doc as `auctionNumber` (number).
- Seeded once at deploy to continue the team's real WhatsApp sequence. **Seed value TBD — the team will provide the current highest number** (screenshot showed ~1706). Until seeded, default seed is a config constant; document the one-time seed step in the deploy notes.
- The builder's "Auction number" field becomes **read-only / auto-assigned** (shows "auto" placeholder pre-create, the real number post-create). The listing **title** now derives from the product name, no longer from this field.
- The caption (`dropCaption.ts`, already accepts `auctionNumber`) uses the assigned number.

### 3. Multi-media (cover + gallery photos + video)
- Port the seller wizard's media UI into the builder: 1 cover image (required-ish), up to 3 gallery photos → `mediaUrls`, **plus** an optional product video → `videoFile`.
- Reuse `createListing`'s existing upload path (it already uploads video, thumbnail, and the wizard already uploads gallery photos to `mediaUrls`). No new storage plumbing.
- Renders in the auction reel/room via the already-restored media gallery.

### 4. Reserve price (hidden reserve)
- New **optional** numeric field `reservePrice` on the auction (add to `types.ts`; conditional-spread on create like `marketPrice` to avoid Firestore `undefined` rejection).
- **Engine change** (`functions/index.js`, settle path — the shared `settleAuctionTxn` helper): at close, if a reserve is set AND the top bid is **below** it → **do NOT declare a winner or create an order**. Mark the auction `reserve_not_met` (new terminal-ish status), leaving it relist-able. If no reserve, or top bid ≥ reserve, settle exactly as today.
- **Hidden from bidders:** the reserve number is never sent to the client for display. The live room shows a subtle **"reserve not yet met"** label while the top bid is under reserve, flipping to **"reserve met"** once cleared. This requires exposing only a boolean (`reserveMet`) or deriving it server-side — NOT the reserve amount — to the client. (Deriving client-side from the amount would leak it; must be a server-provided boolean or omitted field.)
- Relist path: minimal for this slice — a `reserve_not_met` auction can be recreated via the builder (it appears in Recently-ended with a "relist" prefill action). Full automated relist is out of scope.

### 5. Copy-to-WhatsApp (keep two buttons + add image copy)
- Keep **Copy caption** and **Copy link** as they are.
- Add **Copy image** → writes the **cover image** to the clipboard as a PNG/JPEG blob (Clipboard API `ClipboardItem`), so it pastes directly into WhatsApp Web on desktop. Graceful fallback if the browser blocks image clipboard writes (show the image with a "save manually" hint).
- Add **Download media** → downloads cover + gallery photos + video to the device, so on phone the launcher attaches them from the gallery (the clipboard holds only one image at a time, so multi-image needs download).

### 6. Group the fields
Reorganize the form's flat ~10 fields into labeled sections: **Item** (product name, condition, specs), **Pricing** (starting, market, reserve), **Timing** (start time, duration, channel), **Media** (cover, gallery, video). Responsive: two-column on desktop, single-column stacked on phone.

## Non-Goals (YAGNI)

- Role-based admin shell / per-job "needs attention" queue (north-star; later slices).
- Any change to Jobs 1/2/4 (payments, approvals, fulfillment, disputes).
- Public or semi-public reserve display.
- WhatsApp API auto-posting (channels are assisted-post only — no official API).
- Automated relist beyond a prefill action.
- Editable/override auction numbers or date-prefixed formats (rejected during brainstorming — reintroduces collision risk).

## Architecture & Components

- **`src/components/AuctionDropBuilderView.tsx`** — grow into the workspace: sectioned form + drops-list panel. Keep it focused; if it grows too large, extract the drops list to a sibling component (`DropsListPanel.tsx`) and the media picker to a shared component reused with the wizard.
- **`src/context/AppContext.tsx` (`createListing`)** — accept `reservePrice`, `mediaUrls`/gallery files, `videoFile` from the builder; obtain the auto auction number transactionally.
- **`functions/index.js`** — (a) counter allocation in the create/settle transaction; (b) `settleAuctionTxn` reserve check; (c) expose `reserveMet` boolean, never the amount.
- **`src/types.ts`** — add `auctionNumber: number`, `reservePrice?: number`, `reserveMet?: boolean`, status `'reserve_not_met'`.
- **`src/utils/dropCaption.ts`** — already accepts `auctionNumber`; feed the assigned number.
- **Live room** (`DesktopLiveAuctionLayout` / `MobileLiveAuctionLayout`) — render the reserve-met/not-met label from the boolean only.

## Data Flow

1. Launcher fills sectioned form (number shown as "auto").
2. On Create → `createListing` runs a transaction: increment `counters/auctionNumber`, assign `auctionNumber`, upload cover/gallery/video, write auction doc with `reservePrice` (if set), status `upcoming`.
3. Caption/link/image copy actions become available; drop appears in the Upcoming list.
4. Opener cron flips it to live at `scheduledStartAt`.
5. Bidders bid; server computes `reserveMet`; room shows the label.
6. Closer settles via `settleAuctionTxn`: if `reserveMet === false` → status `reserve_not_met`, no winner/order; else settle as today.
7. `reserve_not_met` drops surface in Recently-ended with a relist-prefill action.

## Error Handling

- Counter transaction retries on contention (Firestore transactions handle this); the number is only consumed on successful create.
- Media upload reuses existing `uploadWithFallback` (primary → fallback bucket) — no new failure modes.
- Reserve leak guard: automated test asserting the reserve **amount** is never present in client-readable auction fields (only `reserveMet`).
- Clipboard image write can be blocked by browser/permissions — must degrade gracefully, never throw.

## Testing

- **Counter:** unit/emulator test — concurrent creates yield distinct, gapless, monotonic numbers; number consumed only on commit.
- **Reserve engine:** settle with top bid < reserve → no winner/order, status `reserve_not_met`; top bid ≥ reserve → normal settle; no reserve → normal settle. (Mirror the simulator's `settleAuctionTxn` tests.)
- **Reserve privacy:** assert client-readable auction shape excludes the reserve amount.
- **Caption:** existing `dropCaption.test.ts` extended for the assigned number.
- **Media:** builder passes cover + gallery + video through `createListing` (reuse wizard patterns).
- Manual smoke (needs a live/simulated drop, per Mazad convention): create a drop end-to-end, verify auto-number increments across two drops, reserve label in room, reserve-not-met produces no order, copy-image pastes into WhatsApp Web.

## Open Item

- **Auction-number seed value** — the team's current highest WhatsApp auction number. Needed once before deploy; captured as a config constant with a documented one-time seed step. Does not block implementation.
