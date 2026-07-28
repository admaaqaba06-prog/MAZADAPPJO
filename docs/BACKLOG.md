# Mazad JO — Backlog & Launch Punch-List

_Compiled 2026-07-18 after the end-to-end production dress rehearsal; **re-audited 2026-07-26 item-by-item against the code**. Verify before working an item — this list went ~85% stale in eight days, and two entries turned out to describe deliberate design, not defects._

---

## ✅ Verified fixed (re-audited 2026-07-26 against the code, not the doc)

Each of these was checked individually. The 2026-07-18 list had gone ~85% stale — working
top-down from it wasted time on problems that no longer existed.

1. ~~Accidental-bid buttons~~ — a quick-step chip now calls `onStage`, which renders the shared
   `BidConfirm` overlay. Both surfaces have a confirm step; there is one bid pattern.
2. ~~Stale-snapshot winner race~~ — `winnerId`/`finalPrice`/`totalBids` derive from `freshData`
   inside the transaction (`functions/index.js`).
3. ~~Immediate auctions never open~~ — the builder defaults `scheduledStartAt` to now.
4. ~~Live room dies without a video~~ — `getAuctionMedia` falls back to the thumbnail; video optional.
5. ~~Subscription submit is broken UX~~ — `isPendingReview` in `SubscriptionView` explicitly kills
   the silent-success → duplicate-click loop; no client-side write remains.
6. ~~Membership status needs a refresh~~ — the current user doc is live-subscribed (`AppContext.tsx`).
7. ~~Two navigation bars~~ — no sidebar remains in `DesktopFrame`.
8. ~~"SYSTEM CRITICAL" label~~ — gone from the codebase.
9. ~~Fake "2.1K" viewer count~~ — gone; no viewer count renders in the auction room.
10. ~~"No bidder / No bids yet" display bug~~ — explicitly guarded in `DesktopLiveAuctionLayout`.
11. ~~Raw Firebase errors~~ — `LoginView` maps them ("Never show raw Firebase strings").
13. ~~Landing says 7.5% seller fee / `#coming-soon`~~ — neither exists.
14. ~~Identical Sign up / Log in tabs~~ — removed with the phone-only auth pass.
16. ~~"by MAZAD JO Store"~~ — fixed at SAVE time: the drop-builder stamps `soldByMazad` and
    `createListing` stores the MazadJo store identity. See 2026-07-26 commits.
17. ~~Generic "User" name~~ — NOT a bug. `'User'` is a deliberate placeholder (never leak the phone
    number as a public bidder name) and `ProfileCompletionModal` gates on `isProfileComplete`.
18. ~~Timer counts past zero~~ — `useCountdownSeconds` unsubscribes at `<= 0`.
19. ~~FCM send inside the settlement txn~~ — fires post-commit; guarded by `functions/txnPurity.test.js`.
20. ~~Premium fils formula duplicated~~ — was 12 sites; extracted into `functions/settlement.js`.
    Cross-checked against the frontend copy by `src/utils/moneyParity.test.ts`.
21. ~~Mixed numerals~~ — NOT a bug. The house convention is amounts in Western digits
    (`toLocaleString('en-US')`) and percentages/small quantities in Arabic-Indic prose, applied
    consistently across 19 component files. Within `BidSheet` every amount is already Western.
    Changing it is an app-wide localization decision, not a fix.
22. ~~Hardcoded lot details on the DESKTOP auction page~~ — the product-info row renders real
    per-lot data only. See `docs/superpowers/specs/2026-07-26-per-lot-viewing-design.md`.
23. ~~"Verified Merchant" shown for every seller~~ — gated on the real `verificationStatus`.
24. ~~Bulk relist aborts on first failure~~ — NOT a bug. `handleDuplicate` catches internally and
    alerts rather than throwing, so the loop continues. Real (cosmetic) issue: N failures produce
    N blocking `alert()` dialogs.

## 🔴 Open — verified real

15. ~~**`misc` lots are unfindable and mislabelled**~~ ✅ **Fixed 2026-07-26.** Two halves:
    `channelToCategory` sends the `misc` drop channel to the stored value `Fashion`, and no
    discovery chip matched it (chips were All / Cars / Real Estate / Phones / Watches /
    Electronics) — so every misc lot was reachable only under "All", invisible to anyone using a
    category filter. Separately, `categoryLabel` rendered that bucket as "أزياء / Fashion" while
    the seller's own picker in `ListingWizardView` calls it "أخرى / Other", so a mixed bag of
    goods was presented to buyers as clothing. Added an "Other / أخرى" chip matching
    `['Fashion','Misc']` and relabelled the bucket. The stored value is unchanged — renaming it
    would orphan every existing lot.

12. **Bot ~33% failure rate** _(WhatsApp AI Reply Agent)_ — **cannot be verified from this repo**;
    it is Mohammad's bot and lives outside this codebase. Needs a dedicated dig there.

## 🧰 Infra / runbook

22. **Adding a domain = also authorize it in Firebase Auth** (authorized domains) — add to `docs/DEPLOY.md`; this broke signup on `mazad-jo.com` today.
23. **Consolidate account ownership** under MJ/team — Cloudflare (colleague's account holds the DNS), Vercel (mazadteam), WasenderAPI, Firebase. Partially done (MJ has Firebase console + Vercel + is now app admin).
24. **Empty-phone guard on n8n Webhook Receiver** — skip the WasenderAPI send when phone is empty (in progress 2026-07-18).

## 🚀 Queued projects (specced / scoped)

- ~~**Delivery is trust + paper**~~ ✅ **Shipped 2026-07-28 (Wave 3).** The handoff used to be: driver delivers, buyer signs a paper receipt, driver films it and WhatsApps CS. "There is no system." There is now — a three-photo evidence chain (seller prepares → seller dispatches with a `DC-XXXXX` code visible → buyer photographs receipt and types the code), where the buyer's confirmation releases escrow with no admin in the happy path. The paper receipt survives as an offline physical fallback; **the app is the system of record.** Design: `docs/superpowers/specs/2026-07-28-wave3-delivery-evidence-design.md`.

- **Ops rhythm (the real unlock):** mirror the daily WhatsApp auctions into the app via the drop-builder so shelves are never empty. Nothing else matters if there's no inventory to bid on.
- **Plan B — Ratings + vendor ladder** (spec: `docs/superpowers/specs/2026-07-18-core-happy-path-design.md`): two-sided reviews (buyer↔auction, review blocks next bid), internal vendor stats, graduation at 100 five-star auctions → public vendor page.
- **Plan C — Landing truth pass:** 5%+5% copy, kill `#coming-soon`, empty-states sell the schedule, numeral/copy polish.
- **Bidding-room UX overhaul:** folds in P0 #1/#4 + one bid pattern + real presence.
- **Mission-control health dashboard** (spec: `docs/superpowers/specs/2026-07-17-health-dashboard-design.md`) — now doubly justified by the settlement-was-silently-dead lesson.
