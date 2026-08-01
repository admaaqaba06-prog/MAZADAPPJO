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

25. ~~**Nobody could become a seller**~~ ✅ **Fixed 2026-07-28** (PRs #186, #188). Found while
    prod-testing the Wave 3 non-admin seller path. Three failures at once: `handleActivateSeller`
    in `WalletView` was the only code writing `isSeller` and **was never called**; it wrote the flag
    client-side where `firestore.rules` denylists it for self-writes (verified against deployed
    prod — that write returns 403, the same write without the key returns 200); and `role: 'seller'`
    only ever reached local React state. `AppContext` then gated the seller **orders, escrows and
    disputes** subscriptions on that ungrantable flag, so five real non-admin accounts held sold
    orders they could not see — and under Wave 3 could not fulfil. The disputes gate was the
    sharpest: a seller could not see a dispute raised *against* them. Now: the `activateSeller`
    callable (Admin SDK) is the only grant path, a real wallet button calls it, `onListingApproved`
    grants it when the admin team approves a lot, all three subscriptions are unconditional, and
    `scripts/admin/backfill-sellers.cjs` flagged the five (already run; admins deliberately
    excluded — they see every order anyway and would gain a public store page).

    **Lesson:** dead code hid a broken feature. Nothing called the function, so its guaranteed
    `PERMISSION_DENIED` never surfaced. A client-side write to a rules-denylisted field is always a
    bug, whether or not anything calls it.

## 🔴 Open — verified real

26. **The five backfilled sellers have never been told their orders exist.** They can now see them,
    but some of those sales are old and may be sitting unfulfilled. Deferred by MJ 2026-07-28 — no
    outreach for now. Worth pulling order age + status per seller before any push.

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

25. **Fulfillment SLAs are now 24h / 24h** (Wave 4, 2026-07-29). Was 48h to ship and five days to
    deliver. Client-only — `functions/fulfillmentNudge.js` derives buckets but reads no thresholds.
    **Expect the Action Center to show a backlog the first time you open it:** five days of drift
    becomes visible at once. That is the intent, not a bug.

26. **Withdrawals history needed a composite index** (status + timestamp desc) — added to
    `firestore.indexes.json` 2026-07-29. It had been failing silently in the admin console for
    however long; the pending-payouts query was fine, only the history list was empty.

27. **A defaulted lot now sells itself to the runner-up** (Second Chance Offer, 2026-07-30).
    `paymentDefaultEnforcer` no longer just marks the order defaulted and stops: it offers the lot
    to the runner-up at their own bid, once, for 24h. If that bid cleared the seller's reserve the
    offer goes **straight to the bidder with no human in the loop** — so this is **the first fully
    automatic sale path in the system**, a lot changing hands at a lower price with nobody
    approving it. That is deliberate (21 of 31 real orders sitting `defaulted` is what the status
    quo costs) but it is the thing to watch after launch. Below reserve, the seller is still asked
    first.

    **Where to watch it:** every offer writes a `system_health` row of type `second_chance_opened`
    — `Second chance offered (pending_buyer|pending_seller)`, source `paymentDefaultEnforcer`,
    naming the lot, the runner-up, the amount and who defaulted. The System tab renders unknown
    types fine, so they show up without any admin change. The bidder name in that row is **masked**
    (`maskBidderName`), so it identifies the offer, not the person.

    Two deploy dependencies, both real:
    - `firebase deploy --only firestore:indexes` must finish **before** the frontend ships. The
      runner-up's card reads a composite index (`secondChanceOffer.bidderId`, `.status`,
      `.openedAt desc`); until it builds the query fails `failed-precondition`, which the hook logs
      and swallows — so the card is **absent, not broken**. Index builds on an existing collection
      are not instant.
    - The n8n **Build Messages** Code node must be re-pasted from `n8n/build-messages.js`, or
      production WhatsApp keeps the old wording («لم تبلغ المزايدات السعر المطلوب» — the bids did
      not reach the asking price), which is false for a second-chance recipient. Email is unaffected:
      it renders from `email_content`, which Functions produce.

28. **The six admin callables are now kept warm on a 5-minute schedule** (Admin Action Latency,
    2026-08-01 — spec: `docs/superpowers/specs/2026-07-31-admin-action-latency-design.md`).
    Measured against production, an admin callable that did *no work at all* took **2021 ms cold**
    and ~450 ms warm, and the Action Center had **no busy state at all**, so a button read as dead
    for two seconds. `warmAdminCallables` (scheduled, every 5 min) now pings `verifyOrderPayment`,
    `approveSubscription`, `rejectSubscription`, `approveWithdrawal`, `rejectWithdrawal` and
    `sendFulfillmentNudge`. A warmer, not `minInstances`: ~$70/month of held instances buys 1.5
    seconds on a surface one operator touches, and after May 2026 the cheap option that cannot
    surprise anyone is the default. **Google may still evict an instance between pings — the
    failure mode is a 2-second cold start, i.e. today's behaviour, never worse.** `minInstances`
    stays a one-line follow-up per function if a week of measurement says the warmer is not holding.

    **`__warm` is deliberately unauthenticated.** Each of the six opens with
    `if (data && data.__warm === true) return { warm: true };` **above its auth gate** — it reads
    nothing, writes nothing, returns a constant. Below the gate it would be dead code and every
    ping would land as an auth failure: **~1,700 `unauthenticated` errors a day, burying the only
    signal that would reveal a real unauthorised attempt.** Warming the functions must not cost the
    ability to see an attack on them. The trade — a third party can invoke it to spin an instance —
    is the same amplification the auth-rejection path already offered, and the response carries no
    information. Do not "fix" it by moving the line below the gate; a test pins its placement
    against the first gate of either form (`context.auth` or `assertAdmin`).

    **One consequence to hold onto:** the `__warm` path returns **HTTP 200 and writes no log
    line**, so a flood through it is *more* invisible than the auth-rejection flood it replaced —
    it will not trip 4xx/5xx-rate alerting, and nothing in the logs distinguishes 10 pings a day
    from 10 million. After the May 2026 runaway API bill, that is worth naming explicitly: the
    thing that would catch abuse here is an **invocation-count or billing** alert on these six
    functions, not an error-rate one.

    **Optimistic hiding is restricted to listing approve/reject — nothing else, ever.** All eleven
    Action Center buttons get an immediate pending state, but only `onApproveListing` /
    `onRejectListing` remove their row before the server confirms: they are the only two with no
    server round-trip to warm (client Firestore writes), neither moves money, and an approval is
    undone by a rejection. Everything else — payment verify/reject, membership, payouts, dispute
    resolve, order advance, **and the nudge** (it sends a real WhatsApp; there is no unsend) —
    stays in the queue until the listener delivers the real state. An admin must never be shown
    "done" for money that has not moved. The allowlist is asserted in tests, so a new money action
    is `'confirmed'` by omission and any attempt to widen optimism fails loudly.

    **Deploy note:** merging to main **is** the functions deploy (the `Deploy Firebase` action).
    Do not also deploy by hand — a manual deploy collides with CI on Google's function-update
    quota and both fail (happened 2026-07-31). A large deploy can silently drop individual
    functions on "Quota Exceeded" **while still printing `Deploy complete`**; re-list and retry by
    name.

## 🚀 Queued projects (specced / scoped)

- ~~**Delivery is trust + paper**~~ ✅ **Shipped 2026-07-28 (Wave 3).** The handoff used to be: driver delivers, buyer signs a paper receipt, driver films it and WhatsApps CS. "There is no system." There is now — a three-photo evidence chain (seller prepares → seller dispatches with a `DC-XXXXX` code visible → buyer photographs receipt and types the code), where the buyer's confirmation releases escrow with no admin in the happy path. The paper receipt survives as an offline physical fallback; **the app is the system of record.** Design: `docs/superpowers/specs/2026-07-28-wave3-delivery-evidence-design.md`.

- **Ops rhythm (the real unlock):** mirror the daily WhatsApp auctions into the app via the drop-builder so shelves are never empty. Nothing else matters if there's no inventory to bid on.
- **Plan B — Ratings + vendor ladder** (spec: `docs/superpowers/specs/2026-07-18-core-happy-path-design.md`): two-sided reviews (buyer↔auction, review blocks next bid), internal vendor stats, graduation at 100 five-star auctions → public vendor page.
- **Plan C — Landing truth pass:** 5%+5% copy, kill `#coming-soon`, empty-states sell the schedule, numeral/copy polish.
- **Bidding-room UX overhaul:** folds in P0 #1/#4 + one bid pattern + real presence.
- **Mission-control health dashboard** (spec: `docs/superpowers/specs/2026-07-17-health-dashboard-design.md`) — now doubly justified by the settlement-was-silently-dead lesson.
