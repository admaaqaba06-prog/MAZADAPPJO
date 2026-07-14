# Mazad JO — App Strategy

_Why we're building the app, what it does first, and how we roll it out alongside WhatsApp._

## The thesis

**The app is the bidding room WhatsApp sends people into.** WhatsApp stays the megaphone, the community, and the trust brand. The app quietly takes over the jobs WhatsApp is bad at — running auctions and handling orders — one at a time, until it has earned the audience outright. We build incrementally; discovery and community come to the app in a few months, once it is already where people are.

## The funnel

```
Landing page  →  WhatsApp bot        →  Category Channels     →  App (auction site)   →  Notifications
(one job:        (n8n, official API:     (Mazad-Phones,           (OTP / magic-link       (n8n, official API:
 send people      educate, concierge,     Mazad-Cars,              → subscribe gate         you-won, payment,
 to the bot)      answer any question)    Mazad-Misc; drops        → one-tap bid)           delivery, sell-intake)
                                          with deep links)
```

**Landing → bot (educate) → channel (discover drops) → app (bid) → bot (notify).** WhatsApp is the megaphone and the concierge; the app is the floor.

## The headline: the app breaks the one-auction-at-a-time ceiling

On WhatsApp, one group = one admin's full attention = literally one auction at a time. That human-serial limit *is* our throughput ceiling.

The app's engine already runs **unlimited auctions concurrently** — it closes each one on its own server-set time, picks each winner automatically, and never mixes them up. Schedule 30 auctions in the morning and they open, run, and settle themselves, all overlapping, with **zero attention during the session.** That is the single biggest prize: more auctions per day with *less* labor, not more.

## Auction mechanics

Because bidding is app-only (channels announce, they don't take bids), we're free to run the *fairest* engine — there's no WhatsApp rule to match.

- **Anti-sniping = auto-extend, not punishment.** A hard cutoff rewards waiting; snipers snipe because it works. Instead, **any bid in the final 60 seconds extends the clock by 30 seconds, rolling until the room goes quiet.** Waiting buys nothing, so bidders post their real max — which kills sniping *and* tends to raise final prices. (The engine already has a tight 10s/15s version at `functions/index.js:476-480`; we widen and make it configurable.)
- **Short base duration.** 10 minutes (or less) is fine — soft-close means quiet auctions end fast and hot ones run long on their own. Ideal for running many concurrently.
- **Dynamic minimum increment.** A 1 JD free-for-all invites penny-wars that drag auctions out. Scale the increment with price (the code already seeds `minIncrement` at ~5% of starting price). Bigger jumps → faster resolution to a real price → more auctions/day.
- **Configurable per auction.** House defaults, with per-auction overrides so a big-ticket car auction can be tuned differently from a phone.
- **The theater improves.** Instead of a staged "1…2…3," bidders see a real **"⏱ Extended +30s!"** as the price climbs, then a genuine quiet-room close and the "sold at 360 — saved 120" reveal. The drama is earned.

## Why this is the right shape

**1. Don't break what works — feed on it.** Our real asset is ~2,000 people of liquidity and a near-zero-return trust brand, both living on WhatsApp. An app that tries to replace WhatsApp on day one launches as an empty room, and empty rooms kill auctions. So the app consumes WhatsApp's reach (deep links, channel drops, bot notifications) instead of competing with it.

**2. Don't rebuild what's already done.** The hard, scary part — server-run close, automatic winner selection, enforced bid increments, anti-sniping, one-tap bidding, *and the concurrency above* — is already built and solid. Effort goes only to the real gaps, not to re-doing the engine.

**3. A smaller app is a safer app.** By doing only *sign in → one room → bid → settle*, there is far less to secure, test, and get wrong before we trust it with real JOD. Cutting the browse/reels ambition for now is not just focus — it is the fastest path to something reliable.

**4. Never split the order book.** The biggest risk is two venues bidding on the same auction. Our rule is boring on purpose: **bidding happens only in the app.** WhatsApp channels announce and link; they never take bids. No reconciliation, no bid-parsing bots, no staff re-typing bids.

**5. Migrate by measurement.** We move auctions app-native *as the app proves it can carry the liquidity* — tracked, not guessed. That is also why discovery/community come later: they only work on a warm, daily-active crowd. Get the audience into the building first; build the lobby second.

## Identity & authentication — phone = identity, two paths

Every participant is already a verified WhatsApp phone number. We make that the backbone.

- **From the bot (1:1):** the bot has already verified the number, so it can hand out a **personalized magic link** — a short-lived signed token. The user taps it and lands in the app **already logged in** (server verifies token → mints a Firebase session). No auth wall for anyone who came through the bot. Fully legit (official 1:1 Cloud API).
- **From a channel drop (broadcast):** the link is identical for every follower and cannot carry a per-user token, so it lands behind an **auth overlay**. The one-time code can be delivered **over WhatsApp** via Meta's official authentication-template (WhatsApp OTP), not just SMS.
- **Note:** Firebase's built-in phone auth uses its own SMS pipeline; "OTP over WhatsApp" is a small custom flow (generate code → send via WhatsApp API → verify → mint Firebase custom token). Since the funnel is landing → bot → channel, most bidders hit the bot first, so the frictionless magic-link path covers the majority.

**Only paying subscribers can bid** (see the subscription section below). A follower can be in a channel without having paid; tapping a drop routes them: not-logged-in → auth → not-subscribed → subscribe → bid. The app already gates bidding behind subscription, so this is the existing flow, not new work.

## The rollout

### Now — the room + the operator portal
- **Admin drop-builder** (the daily-pain killer, zero WhatsApp-API risk): a form that composites the branded card — hero image + spec badge + retail-price plaque + the full Arabic block (auction #, start time, duration, starting price, product name, spec bullets, condition, hype lines, rules footer, one-month guarantee, subscribers-only note, payment/VIP terms, delivery, tagline) — generates the **deep link**, tags a **category**, and schedules the drop.
- **Assisted channel posting** — at drop time the portal hands the team a ready-to-post package (image + caption on the clipboard); a team member pastes it into the right channel (Mazad-Phones / Cars / Misc). Paste + send, seconds, no typing. (Auto-posting to channels is not legitimately possible — see below.)
- **Scheduled auto-open** (mirrors the auto-close that already exists) — the piece that makes concurrent, hands-off auctions real.
- **Auth**: phone identity — magic-link pre-auth from the bot, WhatsApp/SMS OTP from channel-cold users.
- **Make the live experience real** — true viewer/bidder presence and the "you saved X vs. market" reveal (currently simulated).
- **Fix the bid-amount display bug** — the live room can offer a bid the server then rejects; that reads as "rigged" and must be fixed.

### Next — prove & migrate
- **Notification pipe via the existing n8n bot** (official Cloud API, 1:1 templates): the app emits events; n8n delivers them. Payment follow-ups, order/delivery updates, "want to sell?" nudges, listing help.
- Instrument how much bidding and GMV is app-native.
- Turn the dormant subscription into real value (early access, VIP room, watchlists).

### Later — destination
- Discovery feed, categories, community — once the app is where people already are.

## The operator portal

A role-aware internal console for the ~9-person team, mapped to existing roles. First job: remove the operator's #1 pain (posting every ~10 minutes) by turning "create an auction" into a scheduled, mostly-automated action:

- **Create + schedule** an auction (own-inventory or consignment as distinct listing types), with the branded card, specs, timing, starting price, and increment.
- **Auto-open / auto-close** on server time — no human toggling.
- **Prepare + package** the channel drop and deep link (assisted post).
- Later: order + settlement ledger, inventory states, courier tracking, subscriber/CRM, support tickets.

## Subscription & the payment gate (Aya's confirmation)

Bidding is gated by a paid subscription, tiered by duration:

| Pay | Bidding for |
|-----|-------------|
| 1 JD | 1 month |
| 4 JD | 6 months |
| 7 JD | 1 year |

Payment is a bank/CliQ transfer, and confirmation is **manual for now**: a team member (Aya) verifies the transfer against the bank account, then unlocks bidding for that phone number.

- **Aya's confirmation UI** (in the operator portal): she selects/enters a **phone number**, picks the **tier**, records amount + date + bank reference, and confirms. That sets `subscriptionStatus: active` with an **expiry** derived from the tier.
- **Keyed to the phone number**, so confirming a payment unlocks that phone whether or not they've opened the app yet; when they authenticate (magic-link / OTP), they can bid immediately.
- **Admin-only write** — the Firestore rules already block users from self-granting subscription status; Aya's action is server-side and **logged for audit** (who / when / amount / reference), since it is a money gate.
- **Expiry + renewal:** bidding lapses at expiry; renewal reminders come later via the n8n notification pipe.
- **Automatable later:** a bank/CliQ reconciliation webhook can replace the manual step without changing this model — Aya's confirmation is just the first, human implementation of it.

Note: this base subscription is separate from **VIP** (pay-on-delivery, ~10 JD/mo), whose payment scheme is pending compliance review and is **not designed here**.

## Selling = team-verified intake (the trust moat)

Selling stays human on purpose. A seller contacts Mazad (or the bot captures the lead) → Mazad picks up or receives the item → **inspects it** → decides to list it with a recommended starting bid. That Mazad-verifies-every-item step is *why buyers trust the listings* and why returns are near zero. The bot captures **sell intent** (lead + photos) and hands off to the team; it does not automate the listing decision or the starting bid.

## WhatsApp automation — what's legit, what isn't (verified July 2026)

**Bot + 1:1 notifications: fully legit and automatable.** The official WhatsApp Business Platform (Cloud API) supports 1:1 messaging, interactive messages, and authentication (OTP) templates. The n8n bot and the notification pipe run on this.

**Channel posting: no legitimate auto-post exists.** Meta's official Cloud API does **not** support publishing to Channels — its documented surfaces are 1:1 messaging, calling, and groups, not Channels ([Meta docs](https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform)). Every "WhatsApp Channels API" on the market (Whapi, Maytapi, WAHA) is **unofficial** — it drives a logged-in WhatsApp Web session and carries account-ban risk. WAHA states this plainly: it runs "a real instance of WhatsApp Web," and *"WhatsApp does not allow bots or unofficial clients on their platform, so this shouldn't be considered totally safe"* ([WAHA](https://waha.devlike.pro/whatsapp-channels/), [Whapi](https://whapi.cloud/whatsapp-channels)).

**Therefore: channel drops are assisted-post (human hits post), by design, not by compromise.** The portal removes all the labor except the final tap.

> Footnote: Meta now lists **Groups** as an official Cloud-API surface, so legit auto-posting to *groups* may be possible — but groups drag back the noise, moderation, and member-cap problems the strategy moved away from. We stay on Channels + assisted posting.

## The through-line

Every step either removes labor or removes friction, and none of them bets the business. WhatsApp carries the audience the whole way; the app takes over one job at a time.
