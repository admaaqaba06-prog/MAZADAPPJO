# Admin drop builder — UX redesign

Date: 2026-07-27
Surface: `src/components/AuctionDropBuilderView.tsx` (route `/auction-drop-builder`, admin-only)
Status: design approved, ready for planning

## Problem

The team launches 20–27 drops a day through this form and finds it confusing. Observed
live in production, signed in as an admin:

1. **No hierarchy.** Fifteen fields render at equal visual weight, but only about five
   change between drops. The other ten are set-and-forget ops defaults.
2. **Raw scaffold styling.** Inputs are bare `border rounded p-2`, visually unrelated to
   the rest of admin (`rounded-2xl` cards, `#FF6B00` accents). Media uses the native
   `Choose File / No file chosen` control.
3. **A read-only field leads the form.** `Auction number → Auto` is the first thing on
   screen and cannot be typed into.
4. **`Start mode` contradicts itself.** "Scheduled" with an empty start time silently
   means *immediately*. Someone who means to schedule and leaves the field blank opens
   the lot instantly.
5. **Deferred controls with no adjacent reason.** Copy caption / Copy image / Download
   media are greyed until creation; the explanation sits far below in another column.
6. **A dead link in the preview.** Pre-creation the caption renders
   `https://www.mazad-jo.com/auction/%7B%7Bauction-id%7D%7D`.
7. **No success moment and no way to restart.** After Create the form keeps every value,
   nothing clears, and the only confirmation is one small green line in the *other*
   column. There is no "create another", no edit, no cancel.
8. **Mobile is an afterthought.** Below `md` everything collapses to one column: fifteen
   fields, then the preview, then the full drops list.

## Decisions taken

| Question | Decision |
|---|---|
| Scope | The drop builder form only. The approve/reject queue (`LaunchSection`) is out of scope. |
| Structure | Essentials-first with a `More settings` drawer. Not a wizard — the team repeats this 25× a day and steps would tax the common path. |
| Restart | Create-another **and** fix-a-mistake. |
| Fixing a mistake | Edit freely while the lot has zero bids. Once it has bids, editing locks. |
| Primary device | Desktop primary, phone secondary but must genuinely work. |
| Language | Mixed team — Arabic and English equally polished. |
| Rules hardening | Yes: lock money/timing fields once `totalBids > 0`. Deletion rules left alone. |

## Design

### 1. Screen structure

Six essentials, always visible, ordered to match how the work happens:

1. **Media** — cover, up to 3 gallery photos, video. First: they are holding the item.
2. **Product name**
3. **Starting price** — retains the existing "seller receives ~95%" hint
4. **Opens** — `Now` · `At a set time` · `On first bid`
5. **Runs for** — duration
6. **Channel**

Everything else folds into one **More settings** drawer: condition, specs, market price,
reserve, viewing, vendor, payment window, anti-snipe, auto-relist. Each keeps its current
default. A live summary line renders under the collapsed drawer so nothing is invisible:

```
New · 30 min · pay within 24h · anti-snipe 30s · no reserve · viewing not stated
```

**A drop created without ever opening the drawer must behave exactly as it does today.**

#### `Auction number` leaves the form

It is not an input. The number assigned by `createListing` appears on the success screen,
where it is actually useful.

#### `Start mode` + `Start time` collapse into `Opens`

Three explicit states over the existing server semantics. No backend change.

| Button | Written | Behaviour |
|---|---|---|
| `Now` | `startMode:'scheduled'`, `scheduledStartAt: Date.now()` | unchanged from today's empty-time path |
| `At a set time` | `startMode:'scheduled'`, `scheduledStartAt: parsed` — the picker renders only in this state | unchanged |
| `On first bid` | `startMode:'first_bid'` | unchanged |

The existing future-time validation (`scheduledStartAtMs <= Date.now()` → error) applies
only in the `At a set time` state.

### 2. Media

Extract the pattern the seller wizard already uses (`ListingWizardView.tsx:290-349`) into
`src/components/ui/MediaPicker.tsx`:

- Large dashed cover zone; once set, a thumbnail with a Remove button
- 3-up gallery grid with a `+` tile, each filled tile removable
- Video zone with filename, size and Remove
- `capture="environment"` so a phone opens the camera directly
- Props only — no Firebase access. Upload stays in the parent's submit handler.

`ListingWizardView` is **not** migrated in this work. Swapping out working seller-facing
UI is outside what was asked; adopting `MediaPicker` there is a follow-up.

### 3. Validation and submit

- Inline per-field errors, shown on blur and on submit.
- Required set is unchanged: product name and starting price. It is only *marked* now.
- The Create button stays enabled when the form is incomplete. Clicking it scrolls to and
  focuses the first invalid field and reveals that field's error, instead of sitting
  greyed out with no explanation.
- Submit progress reports the slow part. Media upload currently shows only `Creating...`
  for its whole duration:
  `Uploading photo 2 of 4…` → `Uploading video…` → `Creating auction…`
- On failure the form is left fully intact with the error against the relevant field, or
  at the submit button for non-field errors.

### 4. Success state

The success panel **replaces the form in place** — not a line in an adjacent column.

```
✅  Auction #147 created
    Opens at 8:00 PM · runs 30 min

    [cover]  iPhone 15 Pro
             Starting at 250 JOD

    [ Copy link ]  [ Copy caption ]
    [ Copy image ] [ Download media ]

    ── caption preview, real link ──

    [ Create another ]  [ Edit ]  [ Cancel drop ]
```

Pre-creation the caption preview no longer renders a dead placeholder URL. It shows a
plain "link added when you create" line in place of the link.

`Copy image` and `Download media` remain disabled when the lot has no cover and no video,
since there is nothing to copy — but on this panel the reason renders beside the button
rather than in a distant column.

**Create another** clears the item — name, specs, media, market price, reserve — and keeps
the ops settings just chosen: channel, duration, payment window, anti-snipe, condition,
vendor, opens-mode.

**`viewing` always clears and never carries.** This preserves the existing rule at
`AuctionDropBuilderView.tsx:241-247`: a stale viewing value publishes a physical-location
claim about a *different* item, which is the fabrication `utils/viewing.ts` exists to
prevent.

### 5. Edit and cancel

**Edit** reopens the form pre-filled from the created lot; Save writes an update to the
auction doc. `firestore.rules:150` already grants admins update rights, so no new callable
is needed. Offered only while `totalBids === 0`.

Reserve price is **not** rehydrated on edit — it lives in the admin-only `auctionSecrets`
doc and is not on the auction. An edit that leaves the reserve field blank must therefore
leave the existing secret untouched rather than clearing it.

Media on edit: existing photos and video are shown as already-attached and are left alone
unless removed or replaced. Only newly added files upload on Save, reusing the submit
progress states.

**Once bids exist** Edit is withdrawn and replaced by a plain line stating the lot is live
with N bids. Cancel remains, behind an explicit confirm naming the damage — *"3 people
have bid on this. Cancelling removes the auction and their bids."* — and routes through the
same `deleteAuction` path Admin → Launch already uses.

### 6. Rules hardening

Admins can presently edit any auction field from the client at any time, including
mid-bidding. Add to the `isAdmin()` branch of the `auctions` update rule: once
`resource.data.totalBids > 0`, reject changes to

`startingPrice`, `currentPrice`, `duration`, `endTime`, `endsAt`, `scheduledStartAt`,
`paymentWindowHours`, `antiSnipeWindowSec`, `antiSnipeExtendSec`

`title`, media fields, `viewing` and `viewingPlace` stay editable, because Admin → Launch's
existing "Edit viewing" acts on live lots (`LaunchSection.tsx:602-669`) and must keep
working.

Cloud Functions bypass rules entirely, so `placeBid`, the closer and `settleAuctionTxn` are
unaffected. Deletion rules are unchanged in this work.

`firestore.rules:166` lets an admin delete any auction, bids and escrows included, with no
guard. That predates this work and stays as-is by decision — recorded here because this
design places a Cancel button nearer to it.

### 7. Mobile

- Single column below `md`, as today.
- Sticky Create button with `env(safe-area-inset-bottom)` clearance.
- Success panel replaces the form in place, so on a phone it lands where the thumb already
  is rather than below a preview column.
- Media zones sized for touch, camera capture enabled.
- The drops list collapses to a closed-by-default accordion **below `md` only**; on desktop
  it stays the open side panel it is today.
- Keeps `h-full overflow-y-auto`, no `min-h-screen` — the view owns its own scroll because
  `DesktopFrame` is `overflow-hidden`.

### 8. Bilingual

Every new string ships in Arabic and English. The container already flips via
`style={{ direction: isAr ? 'rtl' : 'ltr' }}`; the drawer, success panel and MediaPicker
must each be checked in RTL. Neither language is the fallback.

## Modules

Logic comes out of the component so it is testable in isolation:

| Module | Responsibility |
|---|---|
| `src/utils/opensMode.ts` | 3-state ↔ `{startMode, scheduledStartAt}` mapping; past-time rejection |
| `src/utils/dropFormState.ts` | Field defaults; what Create-another keeps vs clears; validation |
| `src/utils/dropEditability.ts` | `canEdit` / `canCancel` from `totalBids` + `status` |
| `src/components/ui/MediaPicker.tsx` | Cover + gallery + video selection, presentational only |

`AuctionDropBuilderView.tsx` keeps submit orchestration and layout.

## Testing

- `opensMode` — all three states map to the documented payload; a past time is rejected in
  `At a set time` and irrelevant in the other two.
- `dropFormState` — Create-another keeps exactly the ops set and clears exactly the item
  set; `viewing` clears in every path.
- `dropEditability` — Edit offered at 0 bids, withdrawn at ≥1; Cancel offered in both with
  the confirm required only when bids exist.
- `MediaPicker` — add, replace and remove for cover, each gallery slot and video; the
  3-photo cap holds.
- Rules tests — an admin update to `startingPrice` is rejected at `totalBids > 0` and
  allowed at 0; a `viewing` update is allowed at both.
- **Regression, the important one:** a drop created without opening the More-settings
  drawer produces a `createListing` payload byte-identical to the current form's. This is
  the guarantee that reorganising the UI did not change what goes live.

## Out of scope

- The approve/reject queue (`LaunchSection`).
- Migrating `ListingWizardView` onto `MediaPicker`.
- Deletion-rule hardening.
- The 15 `TEST — …` lots currently live in production. Unrelated cleanup, flagged
  separately.
