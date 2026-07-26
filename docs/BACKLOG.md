# Mazad JO — Backlog & Launch Punch-List

_Compiled 2026-07-18 after the end-to-end production dress rehearsal. Grouped by priority. This is the board; work top-down._

---

## 🔴 P0 — Blockers before real customers bid

1. **Accidental-bid buttons** _(bidding room)_ — the quick-bid amounts (20/25/30) sit inside the stats row and read as amount *selectors*, but tapping one places an instant bid. In a money app that's an accidental payment obligation. Fix: make them labeled bid actions with a 1-tap confirm ("Confirm: 20 JD, total 21 incl. 5%"), OR make them pure selectors that set the swipe amount and keep swipe as the only commit. One bid pattern, not two.
2. **Stale-snapshot winner race** _(functions/index.js, closer)_ — winner/price are read from the sweep query snapshot, not the fresh in-txn read; a last-second bid can settle to the previous bidder at the previous price. Fix: derive `winnerId`/`finalPrice`/`totalBids` from `freshData` inside the transaction.
3. **Immediate auctions never open** _(drop-builder)_ — the builder always creates status `upcoming`; the opener only flips auctions that have a `scheduledStartAt`. A drop created "now" with no schedule stays upcoming forever. Fix: if no schedule, create as `live` (or set scheduledStartAt = now).
4. **Live room dies without a video** — `videoUrl` is empty (builder never collects one) → black screen + "NO LIVE AUCTIONS" even when an auction is live. Fix: fall back to the thumbnail + keep the bid panel; make video optional.

## 🟠 P1 — Customer-facing / conversion

5. **Subscription submit is broken UX** — silent success (no confirmation → users re-click → **duplicate requests**); every submit **double-writes** (client + Cloud Function); server-written requests show **"Invalid Date"**; **rejecting a duplicate request wipes an already-active membership**. Fix the whole flow: one write, loading→success state, dedupe, and never downgrade an active member on reject.
6. **Membership status needs a refresh to show** — approving/activating doesn't reflect live in the header chip.
7. **Two navigation bars** — top bar + left sidebar duplicate each other. Keep top, remove left sidebar (mobile keeps bottom bar).
8. **"SYSTEM CRITICAL" red label** next to the user name (admin-only leftover) — reads like an error. Remove/relabel.
9. **Fake "2.1K" live-chat viewer count** — residual theater; show real presence or nothing.
10. **"No bidder / No bids yet" display bug** — shows even when a bid exists (data is correct; display is wrong).
11. **Raw Firebase errors shown to users** (e.g. "Hostname match not found (auth/captcha-check-failed)") — map to friendly AR/EN messages.
12. **Bot ~33% failure rate** _(WhatsApp AI Reply Agent, pre-existing)_ — separate from our pipe; needs a dedicated dig (mohammad's bot).

## 🟡 P2 — Polish

13. **Landing still says 7.5% seller fee** — must be 5% + 5%; kill the `#coming-soon` dead-end CTAs; remove pre-launch copy.
14. **Collapse identical Sign up / Log in tabs** (now that auth is phone-only they're the same).
15. **`misc` drop-channel → "Fashion" category** — invisible under the new category pills; add a "Misc" mapping or pill.
16. **"by MAZAD JO Store"** on auctions — show the real seller/creator name. **Root cause identified 2026-07-26:** this is NOT simply a fake placeholder — MazadJo genuinely IS the seller on its own drops, so the literal is true for those. The real defect is at SAVE time: `createListing` stores `sellerName: currentUser.name`, so an admin-built drop is saved under the admin's *personal* name. Fix the drop-builder to store MazadJo as the seller; then the display needs no fallback guess. A render-time swap to `activeAuction.sellerName` was tried and reverted — it would have shown buyers the admin's personal name.
17. **Generic "User" name** — prompt for a name during onboarding.
18. **Timer counts past zero** — frontend countdown doesn't stop at auction end.
19. ~~**FCM send inside the settlement txn** — on retry, duplicate "you won" push; move post-commit next to the n8n calls.~~ ✅ **Fixed 2026-07-26** — the winner push now fires post-commit alongside the n8n webhooks; the token is captured inside the txn. Guarded by `functions/txnPurity.test.js`, which fails if any non-idempotent send (FCM or `postToN8n`) is reintroduced inside *any* transaction callback.
20. ~~**Premium fils formula duplicated 6×** _(functions)_ — extract a `premiumFils(price)` helper before the 5% rate ever changes.~~ ✅ **Fixed 2026-07-26** — was 12 sites, not 6. Extracted `premiumFils`/`totalDueFils` (+ `buyerPremiumJod`/`totalDueJod` wrappers) and `BUYER_PREMIUM_RATE` into `functions/settlement.js`, beside the seller helpers. Note: `src/utils/bidMath.ts` still carries the frontend's own copy of the 5% — it agrees today, but a rate change is a two-file edit.
21. **Mixed numerals** — premium disclosure uses Western digits while the button uses Arabic-Indic; make consistent.
22. ~~**Hardcoded lot details on the DESKTOP auction page** — condition "NEW", "Free Delivery" and "Amman, Jordan" were string literals shown for every lot. The 2026-07-25 mobile redesign deleted these on mobile only.~~ ✅ **Fixed 2026-07-26** — the desktop product-info row now renders real per-lot data only: condition from `activeAuction.condition`, and location replaced by the new per-lot `viewing` field. "Free Delivery" is gone — no shipping data backed it. Blocks with no data are omitted, and the row is suppressed entirely when nothing qualifies. See `docs/superpowers/specs/2026-07-26-per-lot-viewing-design.md`.
23. ~~**"Verified Merchant" shown for every seller**~~ ✅ **Fixed 2026-07-26** — the label and the `ShieldCheck` tick are now gated on the seller's real `verificationStatus`, via the `isVerified` value the component already derived but ignored at two of three sites. The seller-card copy was also English-only inside an otherwise bilingual component; it is bilingual now.

## 🧰 Infra / runbook

22. **Adding a domain = also authorize it in Firebase Auth** (authorized domains) — add to `docs/DEPLOY.md`; this broke signup on `mazad-jo.com` today.
23. **Consolidate account ownership** under MJ/team — Cloudflare (colleague's account holds the DNS), Vercel (mazadteam), WasenderAPI, Firebase. Partially done (MJ has Firebase console + Vercel + is now app admin).
24. **Empty-phone guard on n8n Webhook Receiver** — skip the WasenderAPI send when phone is empty (in progress 2026-07-18).

## 🚀 Queued projects (specced / scoped)

- **Ops rhythm (the real unlock):** mirror the daily WhatsApp auctions into the app via the drop-builder so shelves are never empty. Nothing else matters if there's no inventory to bid on.
- **Plan B — Ratings + vendor ladder** (spec: `docs/superpowers/specs/2026-07-18-core-happy-path-design.md`): two-sided reviews (buyer↔auction, review blocks next bid), internal vendor stats, graduation at 100 five-star auctions → public vendor page.
- **Plan C — Landing truth pass:** 5%+5% copy, kill `#coming-soon`, empty-states sell the schedule, numeral/copy polish.
- **Bidding-room UX overhaul:** folds in P0 #1/#4 + one bid pattern + real presence.
- **Mission-control health dashboard** (spec: `docs/superpowers/specs/2026-07-17-health-dashboard-design.md`) — now doubly justified by the settlement-was-silently-dead lesson.
