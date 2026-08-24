# Core Happy Path v1 — Design Spec

**Date:** 2026-07-18 · **Owner:** MJ · **Status:** approved decisions from product session; supersedes the inherited Whatnot-style model.

## Why

The inherited app was modeled on Whatnot (pre-loaded wallet, per-bid escrow locks, self-serve sellers). Mazad's real business — proven daily in WhatsApp at 10–15K JD GMV — runs a far lighter model. v1 rebuilds the app around the actual business: one funnel, one money story, no dead ends.

## The money story (the only one, told everywhere)

> **1 JD membership to enter → bid freely → win → pay price + 5% buyer's premium within 24h → seller receives 95%.**

- **Membership:** 1 JD/month · 4 JD/6mo · 7 JD/yr (existing tiers). Framed as عضوية مزاد (membership), not a fee — renewable, and it's the seriousness filter.
- **Buyer's premium: 5%**, disclosed *before* commitment at every step (bid button, confirm, win notification, payment screen). Never a surprise.
- **Seller commission: 5%** (seller receives 95%). Landing copy currently says 7.5% — **must be updated to 5% + 5%.**
- **No wallet.** No pre-loading, no balance, no escrow locks, no withdrawals in the buyer path.
- **Non-payment policy: 24h to pay after winning → account banned + item re-run (or offered to runner-up).** Stated in terms, at first bid, and in the payment-due message. Ban is by phone identity.

## The funnel (v1 buyer happy path)

| Stage | Screen/surface | Primary CTA | Notes |
|---|---|---|---|
| 1. Arrive | Landing (AR default) or WhatsApp deep link | «ادخل المزادات المباشرة» | Deep links (`?auction=`) skip landing |
| 2. Sign up | Phone OTP only | «أرسل الرمز» | Arabic default; Google/FB/email hidden; loading states on submit |
| 3. Join | Membership screen (NEW — replaces wallet as the money surface) | «اشترك بـ ١ دينار» | CliQ transfer + receipt upload (existing subscription flow, promoted); status: pending → approved with WhatsApp confirmation via the notify pipe |
| 4. Browse | Discover / Live (with real daily inventory — ops commitment) | «زايد الآن» | Empty states sell the schedule + channel link |
| 5. Bid | Live room | «زايد ١٠٠ د.أ» + line «المجموع عند الفوز: ١٠٥ د.أ (شامل عمولة ٥٪)» | Non-members hitting bid → membership prompt (the 1 JD upsell moment) |
| 6. Win | WhatsApp `auction_won` + `payment_due` | Pay via CliQ | Message includes total incl. premium + 24h deadline |
| 7. Pay | Order screen: CliQ details + receipt upload | «أكّد الدفع» | Countdown to deadline visible; admin approves; `order_*` WhatsApps confirm |
| 8. Receive | Order tracking (existing order states) | — | delivery/pickup per item |
| 9. Review | Rating prompt (NEW) | «قيّم تجربتك» | Required — see Ratings |

**Seller path (v1):** none self-serve. "Sell" nav → simple «بيع معنا» screen → WhatsApp CTA (concierge intake is the moat). Team lists items via admin drop-builder.

## Ratings & vendor ladder

**Reviews (two-sided, per completed auction):**
- Buyer → auction: 1–5 stars + optional text, prompted at order completion. **Enforcement: an unreviewed completed order blocks the next bid** (modal: «قيّم مشترياتك السابقة للمتابعة», one screen, 10 seconds).
- Mazad → buyer: one-tap 1–5 in the admin order close-out (defaults 5). Feeds internal buyer trust + the ban policy.

**Data model:**
- `reviews`: `{ orderId, auctionId, raterId, direction: 'buyer_rates_auction' | 'mazad_rates_buyer', stars, text?, vendorId?, createdAt }`
- `vendors` (internal): `{ id, name, phone, notes }` + aggregates `{ auctionsCount, gmv, avgStars, fiveStarCount, disputes }` (updated by Cloud Function on review write).
- `auctions.vendorId` (optional, set in drop-builder, never shown to buyers in v1).
- Buyers see aggregate item/auction ratings under the Mazad brand only.

**Vendor graduation:** at **100 five-star auctions** (config value), vendor becomes *eligible*; MJ flips them manually → future public vendor page (the shelved seller-center code is the basis). v1 only accrues the data + shows an admin vendor leaderboard (basic table).

## Cut list (hide/disable, don't delete)

- Wallet: top-up, withdraw, balances, escrow ledger, transactions (the whole "WHATNOT WALLET" — incl. removing that label and the **false Central Bank of Jordan / 24-7 Finance Desk claims**, replaced with true copy: funds via CliQ to Capital Bank account; support hours as real).
- Self-serve Sell/listing wizard + seller center (regular users).
- Google/Facebook/email auth on the auth screen (phone only).
- "VERIFIED MERCHANT" and all residual fake trust/social-proof numbers.
- Template leftovers: "Men's modern & thrift/Thrift/Soccer/Accessories" pills, "V3 PILOT" badge.

## Server changes (money path — careful, reviewed)

1. **`placeBid`**: remove wallet-balance checks and escrow lock/refund logic; gate = active membership only (+ existing increments/soft-close). Non-members get a clean "membership required" error the UI turns into the upsell.
2. **Settlement/orders**: order gains `buyersPremium = round(finalPrice * 0.05)` and `totalDue = finalPrice + buyersPremium`; `payment_due` WhatsApp includes the breakdown + 24h deadline. Add `paymentDeadlineAt`.
3. **Enforcement**: scheduled function flags orders past `paymentDeadlineAt` unpaid → marks `defaulted`, sets user `banned: true` (blocks bids via placeBid check), surfaces in admin for re-run/runner-up decision (manual in v1).
4. **Reviews aggregation**: onWrite of `reviews` → update vendor aggregates + buyer trust counters.
5. Firestore rules for `reviews` (author-only create, no edits after write) and `banned` enforcement.

## App-wide fixes riding along

- **Bilingual, Arabic-default:** a visible language selector (عربي / English) on the landing header AND in the app header on every screen. Arabic is the default; English is a full first-class option (all v1 copy ships in both). The choice persists (localStorage) and carries across landing → app → return visits.
- Landing: pricing CTAs → app membership (kill `#coming-soon` dead ends), copy de-pre-launched, 5%+5% language, brand name unified (**Mazzado** — one form, one logo).
- Membership status chip in the app header where the wallet balance used to be («عضو حتى ١٥/٨» or «انضم بـ ١ دينار»).

## Success criteria

A new user can go WhatsApp/landing → phone signup (AR) → 1 JD membership approved → bid on a real auction → win → see/pay total incl. 5% → get WhatsApp confirmations → be prompted to rate — with zero dead ends, zero mentions of wallets/balances, and no English unless chosen.

## Out of scope (v1)

Public vendor pages, category deposits for high-ticket items, automated re-run/runner-up offers, online card payments, the health dashboard (separately specced, queued).
