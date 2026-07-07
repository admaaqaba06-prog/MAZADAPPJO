# Mazad JO — App Strategy

_Why we're building the app, what it does first, and how we roll it out alongside WhatsApp._

## The thesis

**The app is the bidding room WhatsApp sends people into.** WhatsApp stays the megaphone, the community, and the trust brand. The app quietly takes over the jobs WhatsApp is bad at — running auctions and handling orders — one at a time, until it has earned the audience outright. We build incrementally; discovery and community come to the app in a few months, once it is already where people are.

## The headline: the app breaks the one-auction-at-a-time ceiling

On WhatsApp, one group = one admin's full attention = literally one auction at a time. That human-serial limit *is* our throughput ceiling.

The app's engine already runs **unlimited auctions concurrently** — it closes each one on its own server-set time, picks each winner automatically, and never mixes them up. Schedule 30 auctions in the morning and they open, run, and settle themselves, all overlapping, with **zero attention during the session.** That is the single biggest prize: more auctions per day with *less* labor, not more.

## Why this is the right shape

**1. Don't break what works — feed on it.** Our real asset is ~2,000 people of liquidity and a near-zero-return trust brand, both living on WhatsApp. An app that tries to replace WhatsApp on day one launches as an empty room, and empty rooms kill auctions. So the app consumes WhatsApp's reach (deep links, "starting soon" pings, winner announcements) instead of competing with it.

**2. Don't rebuild what's already done.** The hard, scary part — server-run close, automatic winner selection, enforced bid increments, anti-sniping, one-tap bidding, *and the concurrency above* — is already built and solid. Effort goes only to the real gaps, not to re-doing the engine.

**3. A smaller app is a safer app.** By doing only *sign in → one room → bid → settle*, there is far less to secure, test, and get wrong before we trust it with real JOD. Cutting the browse/reels ambition for now is not just focus — it is the fastest path to something reliable.

**4. Never split the order book.** The biggest risk is two venues bidding on the same auction. Our rule is boring on purpose: **an auction is either WhatsApp-native or app-only, never both.** No reconciliation, no bid-parsing bots, no staff re-typing bids.

**5. Migrate by measurement.** We move auctions from WhatsApp-only to app-only *as the app proves it can carry the liquidity* — tracked, not guessed. That is also why discovery/community come later: they only work on a warm, daily-active crowd. Get the audience into the building first; build the lobby second.

## The rollout

### Now — the room + the operator portal
- **Phone-number login** so our known WhatsApp numbers walk straight in (no signup form).
- **Admin/operator portal** to create and schedule auctions — the same action that drives the auto-open below. This is where the team lives day to day.
- **Scheduled auto-open** (mirrors the auto-close that already exists) — the piece that makes concurrent, hands-off auctions real.
- **Make the live experience real** — true viewer/bidder presence and the "you saved X vs. market" reveal (currently simulated).
- **Fix the bid-amount display bug** — the live room can offer a bid the server then rejects; that reads as "rigged" and must be fixed.
- **WhatsApp connector** — auto-post listing cards, "starting soon," and winner announcements, each carrying a deep link into the app (see below).

### Next — prove & migrate
- Instrument how much bidding and GMV is app-native.
- Shift more auctions app-only as liquidity holds.
- Turn the dormant subscription into real value (early access, VIP room, watchlists).

### Later — destination
- Discovery feed, categories, community — once the app is where people already are.

## The operator portal

A role-aware internal console for the ~9-person team. Its first job is to remove the operator's #1 pain (posting every ~10 minutes) by turning "create an auction" into a scheduled, automated action:

- **Create + schedule** an auction (own-inventory or consignment as distinct listing types), with the branded card, specs, timing, starting price, and increment.
- **Auto-open / auto-close** on server time — no human toggling.
- **Push to WhatsApp** via the connector (below).
- Later: order + settlement ledger, inventory states, courier tracking, subscriber/CRM, support tickets — mapped to the existing team roles.

## WhatsApp automation — approach & risk (decided)

**Decision:** during the coexistence period, the portal will **auto-post auction cards into the existing WhatsApp groups** using automation that drives a logged-in WhatsApp number.

**Why this path:** while the groups are still a bidding venue, we need fully hands-off posting *into the real groups*. Official broadcast (below) does not serve an interactive group, and a human-in-the-loop "share" still costs an admin a tap each time. This choice replicates today's behavior with zero manual labor.

**Known risk:** this uses unofficial automation, which is against WhatsApp's Terms of Service. The worst case is the number being banned. Because the audience *is* the business, we mitigate deliberately:
- Run it on a **dedicated secondary number**, never the main business line.
- Post at **human-like cadence**, not machine-instant.
- **No bulk member-adds** through automation.
- **Warm the number** before high-volume use, and **monitor** for throttling.
- Keep a **manual fallback** so a ban degrades to "post by hand," not "operation down."

**Reversibility — the connector boundary:** "send to WhatsApp" is a single pluggable module. We start with the unofficial group poster; as auctions migrate app-only, we swap the same portal to **official broadcast** (WhatsApp Business Platform templates and/or a WhatsApp Channel) with deep links — which is fully ToS-safe. The risky choice is contained at one boundary we can replace with no rework.

> Note for the team: the official WhatsApp Business API **cannot** post into groups — it is built for broadcast/1:1 messaging to individuals. Group auto-posting only exists via the unofficial path above. This is exactly why the long-term plan moves the megaphone to official broadcast as bidding moves into the app.

## The through-line

Every step either removes labor or removes friction, and none of them bets the business. WhatsApp carries the audience the whole way; the app takes over one job at a time.
