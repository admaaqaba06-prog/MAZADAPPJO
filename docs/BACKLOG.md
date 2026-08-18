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

27. **Every existing auction description is still fabricated.** The 2026-08-02 change (item 29) fixed
    **creation only**. Of the 115 real auctions measured 2026-08-01, 13 carry `Premium Lot: {title}`
    and 102 carry a pasted product name; **5 of the 13 are still `processing` in the Action Center**
    (نضخات، العاب، مكبتج، اااااااا، علم), so MJ can write a real description at approval and no data
    migration is needed. The other 8 are ended/completed/draft and moot. **The 102 are the live
    problem** — they arrived through the WhatsApp/admin drop-builder path, which that change did not
    touch.

    **Display-suppressed 2026-08-02**, on all four surfaces that print a description (desktop
    bidding aside, mobile lot page, `AuctionDetailsModal`, `ReelsDesktopRightPanel`): a trimmed
    description equal to the trimmed title renders nothing. **The write is NOT fixed.**
    `src/utils/dropPayload.ts:57` still does `description: input.productName.trim()`, so every new
    Mazad drop still stores an echo — the last live fabrication path, and the reason decision #3
    ("no fabrication anywhere") is not yet achieved. That is the real fix and it is still open.

28. ~~**Mobile's description guard is untrimmed.**~~ ✅ **Fixed 2026-08-02** as part of the
    title-echo suppression; mobile now derives a trimmed value and returns `null` for both the
    empty and the echo case.

    **Correcting the rationale that was recorded here:** the entry claimed a blank description
    rendered a blank `<p>` on mobile. That was wrong — `''` is falsy, so mobile hid it correctly;
    only *whitespace-only* slipped through, a much narrower hole. **The real open gap is a
    different one:** `SellerCenterView.tsx:726` (`handleEditSubmit`) is an unvalidated, untrimmed,
    uncapped third seller write path. A seller can create at the 20-character floor and then edit
    down to `"a"`, so Task 1's floor is a creation-time speed bump, not a data invariant. Open.

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

31. **The sign-in screen sells before it asks** (Sign-in Marketing Panel, 2026-08-03).
    It was a login box centred in an empty black viewport: two buttons, a title, and a
    small grey footer tagline. `2026-08-03-landing-live-lots-design.md` (#231) deferred
    this by name — *"the sign-in screen redesign. Separate spec, deliberately sequenced
    after this"* — because the funnel had a worse problem first: the landing page was
    hiding 147 live lots behind an empty state, so visitors were told there was nothing
    to buy and *then* reached the sign-in screen.

    **It is a marketing surface, not a gate.** The earlier work here
    (`2026-07-18-engagement-ux-design.md` Wave 2) shipped deep-link carry-through and
    zero-silence auth — both of which assume the visitor arrived *from a specific lot*.
    Most do not: an ad, a shared link, a typed URL. The screen now stands on its own.

    **Three blocks, in Fogg order** (`Behavior = Motivation × Ability × Prompt`). Prompt
    and ability were already fine — the buttons are one tap and unmissable — so
    **motivation** leads: live activity, then escrow, then how it works. Live activity is
    first because a visitor who believes the marketplace is empty never gets as far as
    wondering whether it is safe.

    **Arrangement is per breakpoint, settled over two preview rounds with MJ.** Desktop
    puts the lots at the head of the left column beside the card — there is room, and the
    inventory is the hook. Mobile puts the *same* lots BELOW the card, so the form is the
    first thing on a small screen and nothing can push the buttons off it. Both copies
    are in the markup; CSS picks one.

    **Real data or nothing.** `selectPanelActivity` returns `null` for loading, empty,
    errored, *and* nothing-renderable — one signal, deliberately, so the panel cannot
    distinguish "still coming" from "none" and therefore cannot grow a skeleton for
    content that may never arrive. Empty or errored removes the block entirely rather
    than announcing "no auctions right now" on a marketing surface. A stale list behind
    an error flag is discarded — a failed refetch must not present sold lots as live.
    The count states the marketplace's size and is never padded.

    **No countdowns, and that is measured.** Production 2026-08-03: **149 lots are
    `status: 'live'` and only 4 carry a future `endTime`.** A clock would be absent or
    wrong on ~97% of inventory, so `PanelLot` does not carry one — a component cannot
    render a countdown from data it never receives.

    **Costs nothing.** `useLandingAuctions` is a module-cached single `getDocs`; a
    visitor who touched the landing page pays zero, a direct arrival pays one read. No
    new query, no index, no listener. **The sign-in form never waits on it** and renders
    interactive on first paint in every fetch state.

    **Every claim already existed.** The escrow line is condensed from
    `translations.ts:551`/`:309`. The copy tests assert the ABSENCE of claims Mazad JO
    makes nowhere else — free shipping, guarantees, refunds, delivery windows, "no fees"
    (there IS a 5% buyer commission). Three attempts to insert such claims were caught by
    the suite.

    **Tested by what it renders**, via `renderToStaticMarkup` — the technique #222
    introduced — rather than the source-text assertions used elsewhere here, which pass
    whenever a string appears, including inside a comment. The load-bearing assertion is
    that **both sign-in buttons render in all five panel states**: marketing must never
    be able to break auth.

    **Two defects only the preview caught**, invisible to a renderer with no layout
    engine: the activity count rendered underneath the absolute header (`lg:pt-24`), and
    the shorter column floated to the vertical middle while the card started 185px higher
    (`lg:items-start`).

    **Still unverified:** nobody has opened this on a real phone. The Chrome extension
    pins the CSS viewport at desktop width, so the mobile arrangement is proven by tests
    and not by eye.

    **Follow-ons, deliberately out:** per-trigger contextual lines for bid/sell/save/chat
    (`requestSignIn()` call sites), analytics on `view→signup→first-bid` (without it this
    change's effect is unmeasurable), and the clockless-lot problem itself.

## 🧰 Infra / runbook

29. **The Vercel account is BLOCKED, and nobody knows why** (2026-08-18). The frontend
    migration off Vercel was not planned work — it was forced. Vercel returned
    `HTTP 402 DEPLOYMENT_DISABLED` on `mazad-jo.com`, `www`, and the `.vercel.app`
    domain, so the customer-facing site was **fully down**. Vercel's own PR check
    states the cause more precisely than the 402 did: **"Account is blocked."**

    That is broader than an unpaid invoice — Vercel blocks for billing failure, terms
    violations, and abuse/fraud flags. **Nothing depends on that account any more**
    (see item 30), but the reason has never been established, and a block can extend
    to anything else hosted under it. Worth finding out rather than rediscovering.

30. **Google AI Studio still holds a claim on `mazad-jo.com`.** Firebase's apex IP
    `199.36.158.100` is shared across all customers; which site it serves is decided
    solely by the `hosting-site=` TXT record. An AI Studio app in an **unrelated
    Firebase project** (site `ambient-basis-rf4nj`) had claimed the domain first, so
    for ~10 minutes after the DNS cutover the apex served *"My Google AI Studio App"*
    to real visitors until Firebase re-polled the TXT.

    It resolved itself, but **the claim on the other side was never removed** — it is
    still configured against a project nobody watches. It lost the race once; leaving
    it live is a hazard for the next DNS change. Someone should find that app and
    disconnect the domain, or delete the project.

31. **Three pieces of infrastructure sit outside the team's control**, which is item 23
    with names attached, learned the hard way today:
    - **Cloudflare DNS** — zone `mazad-jo.com`, in an `@privaterelay.appleid.com`
      account. Every DNS change needs that login.
    - **The GitHub repo** — owned by the personal user `admaaqaba06-prog`. `coinbits-mj`
      is a **write** collaborator only, so it cannot manage GitHub App installations,
      branch protection, or repo settings.
    - **Vercel** — blocked, per item 29.

    The practical cost showed up immediately: removing the Vercel GitHub App had to be
    handed to whoever holds `admaaqaba06-prog`, because no amount of write access can
    do it.

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

29. **Sellers now write their own descriptions, and nothing invents one** (Auction Description,
    2026-08-02 — spec: `docs/superpowers/specs/2026-08-01-auction-description-design.md`).
    Measured against production: of **115** real auctions, **13** carried the string
    `Premium Lot: {title}`, **0** were empty, and the other **102** held pasted product names
    (`iPhone 17 pro max`, `⌚ *Apple Watch Ultra* – مستعملة`). **Zero carried a real description.**
    Mobile's `التفاصيل` section was never broken — it was faithfully rendering a duplicate of the
    title. The cause was **capture, not display**: `ListingWizardView` (self-serve) had **no
    description input at all** and fabricated one from the title; `SellView` (concierge) had a real
    field but fell back to the product name when blank. Same pattern as the fabricated seller reviews
    removed in PR #198 — the app inventing content to fill a gap.

    Now: **required on the self-serve path** with a **20-character floor after trimming**
    (`src/utils/listingDescription.ts`, one constant), a real textarea in the wizard, **both
    fabrications deleted**, and a Details section on the desktop bidding screen (clamped to 4 lines
    with a show-more gated on *measured* overflow).

    **Two fabrications, not three.** `src/utils/dropPayload.ts:57` does
    `description: input.productName.trim()` — the admin drop path, still live, still writing an echo
    for every new Mazad drop. The spec scoped it out believing the drop builder already had a real
    field; that field is `descriptionEn`/`descriptionAr` on the **drop**, not the per-lot
    `description`. **Decision #3 ("no fabrication anywhere") is therefore not achieved by this
    branch** — see item 27. The display is suppressed; the write is not.

    **The floor guarantees length, not content.** `Samsung Galaxy S24 Ultra` is 24 characters and
    clears 20. A `description !== title` check was considered and **rejected**: title-duplication is
    the dominant production pattern (102/115), but those arrived through the WhatsApp/admin
    drop-builder path, which is out of scope, while the wizard produced only the 13 fabrications now
    deleted. A title-equality check in the wizard would guard a door the problem never came through.
    Revisit once real submissions are visible.

    **That ruling was right for the wizard and wrong as a general rule.** Task 3 opened a different
    door — the *display*. The desktop card would have surfaced all 102 echoes on the highest-traffic
    screen in the app, so the same check was added at the **display layer** on 2026-08-02, on all
    four surfaces that print a description (desktop aside, mobile lot page, `AuctionDetailsModal`,
    `ReelsDesktopRightPanel`). Exact-and-trimmed equality, not fuzzy: the failure mode of a loose
    match is suppressing a real description, which is worse than showing a redundant one. **The
    capture-layer ruling stands; only the display-layer conclusion changed.**

    **The concierge path writes `description: ''` on purpose.** A blank field is a blank value, and
    every display surface now guards on a trimmed non-empty string, so `''` renders nothing
    anywhere. The comment lives at the `SellView` line.

    **Correction (2026-08-02): the reason originally recorded here was false.** It claimed
    `cDesc.trim() || undefined` would be a TypeError because `DropBuilderView.tsx:263` calls
    `a.description.toLowerCase()` unguarded. It cannot: `auctionDocMap.ts:63` coerces
    `data.description || ''` when the doc is read, so **no component ever sees `undefined`**. The
    value is right; the constraint does not exist. Recorded so it is not rediscovered as one.

    **`maxLength={1000}` on the textarea is the only cap that exists.** `firestore.rules` places
    **no constraint at all** on `auctions.description` — the `size() <= 500` rule at
    `firestore.rules:555` is **notifications**, not auctions. A rules-level cap is the real fix if
    the write path ever matters.

    **Desktop placement is deliberate and load-bearing.** The section was first built under the
    product-info card in `<main>`; at `scrollTop: 0` a bidder saw a **~12px sliver of white card and
    nothing else**, because `<main>` has only ~12px of slack (content box `100vh−96` vs stack
    `100vh−108`; the `vh` terms cancel, so it holds at every window size) and the card adds ~152px.
    The whole feature was below the fold on the highest-traffic screen. **MJ ruled: relocate into the
    right `<aside>`**, which already scrolls independently — so `<main>` does not scroll at all, and
    the reading order becomes seller → what it costs → what the lot *is* → history → chat. It sits
    directly below `#desktop-bid-panel`; anything above it moves the bid controls at first paint.
    The heading is `text-xs`, **not** `text-[12px]` — an arbitrary Tailwind value sets font-size only
    and inherits `line-height: normal`, and Arabic faces run 15–35% taller, which risked clipping
    `التفاصيل`. `text-xs` carries an explicit `line-height: 1rem`. Don't reintroduce either.

    **`no-scrollbar` is a dead class repo-wide** — 0 occurrences in built CSS, 8 in source. Anyone
    reaching for it to fix a scroll affordance is reaching for nothing.

    **Evidence caveat worth keeping:** a built-CSS grep does **not** prove a component is wired to a
    utility. Tailwind v4 scans non-ignored markdown, and the plan doc for this change contains
    `line-clamp-3`/`line-clamp-4` in code blocks — so the class is emitted even with the component
    gutted. Only mutation testing proves the wiring.

30. **Customer messaging is bilingual, and `users/{uid}.language` is what decides it**
    (Global Language, 2026-08-02). Every customer-facing message — in-app notification, WhatsApp
    and email — is now rendered by Cloud Functions in the **recipient's** language, not the
    sender's and not the app's. One field drives all three: `users/{uid}.language`, read by
    `resolveLang` in `functions/messageCopy.js`.

    **Arabic is the default and the fallback, and it is not a soft default.** `resolveLang` returns
    `'en'` **only** on an exact `'en'`; a missing user doc, a missing field, a junk value, `'EN'`,
    a non-string — everything else is Arabic. That is the correct bias for this market, and it
    means **no backfill is needed**: the ~all existing users have no `language` field and keep
    receiving Arabic exactly as before. The client mirrors the same rule before it writes
    (`normalizeLanguage`, `src/utils/languagePersistence.ts`), and a test runs both
    implementations over the same inputs so the two cannot drift.

    **The language toggle now writes that field.** Before this, `setLanguage` wrote only
    `localStorage`, which the server cannot read — so a customer could run the whole app in English
    and still get every message in Arabic. The write is **best-effort by design**: the UI flips
    first, the Firestore write is fire-and-forget with its failure swallowed to a `console.warn`,
    and the next toggle retries. A signed-out visitor writes nothing (their `currentUser.id` is the
    sentinel `'unauthenticated'` — **truthy**, so a plain `if (currentUser?.id)` guard fires a
    doomed write on every visitor toggle; don't reintroduce that shape). **No `firestore.rules`
    change was needed** — `match /users/{userId}`'s `allow update` gates self-writes by
    **denylist**, and `language` is on none of the excluded lists.

    **The n8n Build Messages node is now a forwarder, and this is the last paste it needs for a
    copy change.** It renders `email_content` / `wa_text` straight from the Functions payload
    instead of holding its own copy, so **from here on, message wording changes ship with a merge
    alone**. Two caveats:
    - **The paste is still required once, and the order is: merge → let the Firebase deploy
      finish → then paste.** Not the other way round. *Merge-first* is genuinely safe and was
      verified by running the new Functions payload through the OLD node: it consumes only the
      fields it always did, ignores `email_content`/`wa_text`, and renders exactly today's Arabic
      email — so a late paste costs nothing but a mixed-language window (English in-app bell,
      Arabic WhatsApp/email) that self-heals on the paste. *Paste-first* is a different story: the
      still-deployed old `emailFor` sends an `email_content` whose `brand` is the raw `BRAND` with
      no `labels`, and a subject/heading-only gate would accept it and render a customer-visible
      email with no header, no company name, no address, no hours and a footer of three bare
      unlabelled numbers. That was measured, not theorised. **`usableContent()` in
      `n8n/build-messages.js` now also requires the five footer labels**, so the pre-bilingual
      shape is rejected and falls back to the node's own complete Arabic email — the window is
      now merely suboptimal rather than broken. Follow the order anyway.
    - **`functions/emailCopy.js` was dead code from 2026-07-29 (`fad74be`) until this shipped.**
      Functions built `email_content` for three days and the deployed node never read it, so the
      branded email shell — Al Hani footer, amount, `MZ-` order reference — reached nobody. The
      lesson generalises: **a server-side render that no deployed consumer reads is invisible to
      every test in this repo.** Verify a payload field end-to-end at the node, not at the emitter.

    **The English copy is new and unreviewed by a human.** Tests prove all twenty events carry a
    non-empty string in both languages; they cannot prove it reads well to a customer. Read the
    English strings before they reach anyone.

## 🚀 Queued projects (specced / scoped)

- ~~**Delivery is trust + paper**~~ ✅ **Shipped 2026-07-28 (Wave 3).** The handoff used to be: driver delivers, buyer signs a paper receipt, driver films it and WhatsApps CS. "There is no system." There is now — a three-photo evidence chain (seller prepares → seller dispatches with a `DC-XXXXX` code visible → buyer photographs receipt and types the code), where the buyer's confirmation releases escrow with no admin in the happy path. The paper receipt survives as an offline physical fallback; **the app is the system of record.** Design: `docs/superpowers/specs/2026-07-28-wave3-delivery-evidence-design.md`.

- **Ops rhythm (the real unlock):** mirror the daily WhatsApp auctions into the app via the drop-builder so shelves are never empty. Nothing else matters if there's no inventory to bid on.
- **Plan B — Ratings + vendor ladder** (spec: `docs/superpowers/specs/2026-07-18-core-happy-path-design.md`): two-sided reviews (buyer↔auction, review blocks next bid), internal vendor stats, graduation at 100 five-star auctions → public vendor page.
- **Plan C — Landing truth pass:** 5%+5% copy, kill `#coming-soon`, empty-states sell the schedule, numeral/copy polish.
- **Bidding-room UX overhaul:** folds in P0 #1/#4 + one bid pattern + real presence.
- **Mission-control health dashboard** (spec: `docs/superpowers/specs/2026-07-17-health-dashboard-design.md`) — now doubly justified by the settlement-was-silently-dead lesson.
