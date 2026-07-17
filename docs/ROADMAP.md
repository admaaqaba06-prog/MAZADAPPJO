# Mazad JO — Roadmap (post-takeover)

_Last updated: 2026-07-17. Owner: MJ + team. This is the single source of truth for what we own, what's broken, and what we build next._

---

## 1. Where we are — the baseline (what we now own)

We took over the full system. Here's the inventory and its live status.

| System | What it is | Status |
|--------|-----------|--------|
| **Web app** | React 19 + Vite + Firebase SPA, hosted on Vercel (`mazadteam/mazadappjo`) | ✅ Live |
| **Landing page** | Merged into the app repo as the front door (`src/landing/`) | ✅ Live |
| **Domain** | `mazad-jo.com` → app (apex 308→`www`), SSL valid. DNS on Cloudflare, registrar Bluehost | ✅ Live |
| **Auction engine** | Server-authoritative close, deterministic winner, server-enforced increments, escrow, orders (Cloud Functions) | ✅ Live |
| **Notification pipe** | Cloud Functions → n8n webhook → WasenderAPI → WhatsApp (won/payment/outbid/order events) | ✅ Live |
| **WhatsApp bot** | n8n "WhatsApp AI Reply Agent" → WasenderAPI (AI replies to inbound) | ⚠️ Live but failing ~33% |
| **Auto-deploy** | GitHub Actions deploys Firebase (rules/storage/functions) on merge; Vercel auto-deploys frontend | ✅ Live |

**Infra map (who holds what):** Firebase project `mazadjoapp` · Vercel team `mazadteam` · n8n Cloud `mazadjo.app.n8n.cloud` · Cloudflare DNS (colleague's account) · WasenderAPI (Bearer credential in n8n) · Bluehost (registrar only).

**Key architecture note:** WhatsApp sending is **WasenderAPI** (an unofficial WhatsApp-Web gateway), **not** Meta's official Cloud API. Upside: no templates/approval, free-form text. Downside: higher ban risk for business-initiated messages.

---

## 2. Known issues & risks (the bug list)

Ordered by how much they hurt customers / the business.

1. **Bot 33% failure rate** — the reply bot fails ~1 in 3 executions (n8n Executions). Unknown cause; directly customer-facing.
2. **Bot name-encoding bug** — business name renders as `&#x645;&#x632;...` instead of "مزاد" in bot replies. Looks broken/sketchy to customers.
3. **WasenderAPI = unofficial gateway** — ban risk for business-initiated notifications. No fallback if the session drops.
4. **Ownership spread across a colleague's accounts** — Cloudflare, Vercel team, Firebase, WasenderAPI. A single lost login could block us. Consolidate.
5. **n8n has no idempotency dedupe** — events carry an `idempotencyKey`, but n8n doesn't yet skip duplicates → rare double-WhatsApp on trigger redelivery.
6. **Residual fake social-proof** — hardcoded follower/trust/rating numbers in `SellerProfileModal`, `OrderDetailsView`, seller cards.
7. **Prototype-grade codebase** — 3,700-line `AppContext.tsx`, minimal tests, `tsc` can't type-check (no `@types/react`, strict off).

---

## 3. The roadmap

### Phase 0 — Close out current work (now)
- [x] Settlement crash fix deployed (auctions auto-complete + create orders)
- [x] WhatsApp notification pipe live + tested end-to-end
- [x] Landing page as front door, live at `mazad-jo.com`
- [ ] Confirm every notification event fires correctly in production (outbid, order lifecycle) with a real auction

### Phase 1 — Stability & visibility _(the takeover priority: "flag bugs")_
- **Mission-control dashboard**, built in phases (extend the React admin, add a Firestore `touchpoints` event-log that Functions + n8n write to):
  1. **Health / bug-flagging** — n8n failure rates, auctions stuck `live` past end time, orders stuck `waiting_payment`, function errors. _Start here._
  2. **Live ops monitor** — auctions live/closing now, orders needing payment/shipment (for Aya)
  3. **Business metrics** — auctions, bids, win rate, revenue, subscriptions
  4. **Customer touchpoint timeline** — per-phone journey across bot + app + notifications
- **Fix the bot** — investigate the 33% failure rate; fix the name-encoding bug
- **Consolidate ownership** — get MJ/team as owner/admin on Cloudflare, Vercel, Firebase, WasenderAPI

### Phase 2 — Trust & hardening
- Remove residual fake social-proof numbers (real data or remove)
- Server-side auth gating; add `@types/react` + a real type-check; grow test coverage on money paths
- **Evaluate migrating WhatsApp to official Meta Cloud API** + approved templates (durable, lower ban risk) — keep WasenderAPI as fallback

### Phase 3 — Growth (the funnel)
- Measure the landing funnel: landing → app vs landing → WhatsApp; iterate CTAs
- Channel drop automation (assisted posting to WhatsApp Channels) + deep links
- Subscription / monetization tuning (trial → paid), paid traffic once the funnel converts

---

## 4. Decisions on file
- **Consolidated to one repo** (landing merged into the app) — one deploy, one source of truth.
- **Landing CTAs:** primary → enter the app; secondary + header → WhatsApp (`wa.me/962781444899`).
- **`mazad-jo.com` canonical = `www`** (apex redirects). Easy to flip if we prefer bare domain.
- **Ship on WasenderAPI now**; official Cloud API is a Phase 2 hardening decision, not a blocker.
