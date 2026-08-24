# Mazzado — Load Test Results & Cost Model

**Date:** 2026-07-24
**Method:** `scripts/loadtest/` harness against a throwaway Firebase project
(`mazadjo-loadtest`, fully isolated from production `mazadjoapp`), driving the
**real** `placeBid` callable and real Firestore `onSnapshot` listeners — not
simulated/mocked paths. See `scripts/loadtest/README.md` for how to reproduce.

## Headline finding

**Bidding (writes) and viewing (reads) are two completely different scaling
problems with two completely different ceilings.** Conflating them — "can we
handle thousands of concurrent users" — is the wrong question; the right ones
are answered separately below.

---

## 1. Bidding (the `placeBid` write path)

### The ceiling is architectural, not capacity-driven

`placeBid` is a Firestore transaction on **one document** (the auction being
bid on). Firestore hard-limits sustained writes to a single document to
roughly 1 commit/sec (short bursts can exceed this before throttling). This
was confirmed empirically:

| Concurrent bidders | Accepted bids/sec/lot | Correctness audit |
|---:|---:|:---|
| 10  | 1.61 | PASS |
| 25  | 1.93 | PASS |
| 50  | 2.43 | PASS |
| 100 | 2.40 | PASS |
| 1,000 | 2.09 | PASS |
| 2,000 | 1.95 | PASS |
| 5,000 | 1.37–1.57 | PASS |

**Throughput is flat at ~2 accepted bids/sec/lot from 50 bidders all the way
to 5,000.** Adding more concurrent bidders on the *same lot* does not, and
architecturally cannot, increase how many people win per second — it only
increases how many lose the race for that second's slot. This is not a bug
and is not fixable by scaling functions or raising quotas; it's inherent to
one document being the single source of truth for one auction's price/winner.
**Correctness held perfectly at every level tested — 10 through 5,000
concurrent bidders, zero lost/duplicate/mis-attributed bids, exact fil-level
money accounting, every time.**

### The real, tunable bottleneck: `placeBid`'s `maxInstances`

At **500 concurrent bidders**, the *production-shipped* config
(`minInstances:1, maxInstances:20`, from today's Wave 3-infra) produced **180
raw HTTP 500 errors** (out of 6,448 requests) and severe tail latency (p99
~11 seconds). Function-level execution logs showed **zero internal errors**
in `placeBid` itself — these 500s happen at the Cloud Functions front end,
before a function instance is ever invoked, i.e. `maxInstances` was being hit
and excess requests were bounced by the platform, not by the app.

Confirmed by direct A/B test on the same throwaway project:

| `maxInstances` | Bidders | Platform errors | Correctness |
|---:|---:|---:|:---|
| 20 (shipped) | 500 | 180 / 6,448 (2.8%) | PASS |
| 500 | 500 | 0 / 6,395 | PASS |
| 500 | 1,000 | 0 / 22,945 | PASS |
| 500 | 2,000 | 3 / 44,127 (0.007%) | PASS |
| 500 | 5,000 | 2,813 / 72,905 (3.9%) | PASS |
| 2,000 | 5,000 | 295 (platform) + 731 (client) / 65,890 | PASS |

**Recommendation:** raise production's `placeBid` `maxInstances` from `20` to
at least `500` (comment in `functions/index.js` already flags this as a
post-load-test TODO). This doesn't change the ~2/sec accepted-bid ceiling —
nothing can — but it changes *how excess bidders fail*: a clean, cheap
"someone beat you to it" rejection instead of a raw 500 that looks like the
app is broken. Cost impact: `maxInstances` only bounds a *ceiling*, Cloud
Functions gen-1 still only bills for instances actually spun up under real
load, so raising the cap costs nothing at idle — it only matters during an
actual concurrency spike.

At 5,000 bidders even with `maxInstances:2000`, a new, different bottleneck
appeared: **this single local test machine's own connection capacity**
(client-side `network_error` count rose from 441 to 731 as platform errors
fell from 2,813 to 295). That is a limit of the load-test client, not of
Mazzado's backend — pushing single-lot bidder simulation past ~2,000–5,000
from one machine stops producing clean signal about the app and starts
measuring the laptop running the test.

---

## 2. Viewing (the read/listener fan-out path)

This is the dimension that actually matters for "thousands of people at
once" — most of a crowd watching a hot drop are watching, not racing to bid.
Firestore's realtime listeners are a fundamentally different, horizontally-
scaled mechanism from the single-document write path above.

| Concurrent viewers | Subscribed | Time to subscribe | Fan-out p99 latency |
|---:|---:|---:|---:|
| 200 | 200/200 (100%) | 1.3s | 854ms |
| 2,000 | 2,000/2,000 (100%) | 1.6s | 1,376ms |
| 10,000 | 10,000/10,000 (100%) | 2.7s | 1,444ms |
| 50,000 | 50,000/50,000 (100%) | 9.9s | 5,188ms |

**Zero subscription failures at any tested scale, up to 50,000 concurrent
viewers on one lot.** Latency to first snapshot and to fan-out both rise with
scale (as expected — this is genuinely straining the *test client* holding
that many open connections from one process, the same effect seen on the
write side), but no wall was hit. This is a real, positive finding: **the
app's read pattern for a live lot has no evident scaling problem anywhere
near the range a real drop would need**, even a viral one.

Caveat, stated plainly: this test used the Admin SDK (server-side listeners),
which bypasses client security-rules checks — it measures Firestore's raw
fan-out capacity, not the rules-evaluation cost per listener. Real browser
clients also pay for the JS bundle, client-side rendering, and CDN/network
costs the perf work earlier today (Waves 3A–3E) already targeted. This test
isolates and confirms the *backend* read path specifically is not the
constraint.

---

## 3. Cost model

Grounded in Firestore/Cloud Functions standard public pricing and today's
real measured usage (not projections):

**Firestore:** $0.06 / 100K reads · $0.18 / 100K writes · $0.02 / 100K deletes
**Cloud Functions (gen-1):** $0.40 / million invocations + compute time
(negligible here — `placeBid` executions ran 100–400ms each in testing)

### Real measured costs from today's runs

| Test | Volume | Estimated cost |
|---|---:|---:|
| Bid storm, 2,000 bidders, 60s | 44,127 function calls (~1 Firestore txn read+write each) | ~$0.02 functions + ~$0.08 Firestore ≈ **$0.10** |
| Bid storm, 5,000 bidders, 60s | 72,905 function calls | ~$0.03 functions + ~$0.13 Firestore ≈ **$0.16** |
| Viewer storm, 50,000 viewers | 100,000 document reads | **$0.06** |

**A single 60-second synthetic storm at any scale tested cost well under
$1.** This means load-testing itself is cheap to repeat; it's real, sustained
production traffic (hours of live drops, every day) that the budget question
is really about — see below.

### Budgeting formula for a real drop

For a drop lasting **D minutes** with **B** aggressive bidders on the hot lot
and **V** concurrent viewers:

- **Bid-path function calls** ≈ `B × (60×D / 1.6)` (each bidder self-paces at
  the 1.5s server rate limit + jitter, ~1.6s apart) — cost ≈ calls × $0.40/1M
  (functions) + calls × 2 × $0.06/100K (Firestore read+write per attempt,
  accepted or rejected — every attempt does at least one transactional read).
- **Viewer-path reads** ≈ `V × (accepted-bids-during-D + other-doc-changes)`
  — during active bidding this is dominated by the ~2/sec accepted-bid rate
  from Part 1 (each accepted bid is one snapshot delivered to every
  subscribed viewer), so roughly `V × min(120×D, 2×60×D)` reads for the hot
  lot's own listener alone (bounded by the ~2/sec ceiling — a 10-minute drop
  can't produce more than ~1,200 real price-change events no matter how many
  people are bidding). Chat and other listeners add on top of this at a
  similar order of magnitude.

**Worked example — a genuinely large drop:** 10-minute drop, 500 aggressive
bidders on the hot lot, 20,000 concurrent viewers:
- Bid-path: 500 × (600/1.6) ≈ 187,500 calls → ≈ **$0.08** (functions) + **$0.22**
  (Firestore reads+writes) ≈ **$0.30**
- Viewer-path: 20,000 viewers × ~1,200 accepted-bid updates (10 min at the
  ~2/sec ceiling) = 24,000,000 reads → **$14.40**

**The viewer/read path — not the bid path — is where real cost lives at
scale**, because every accepted bid fans out to every watching viewer. This
is the number to budget against as audience size grows, not the bidder count.

---

## What this means for scaling decisions

1. **Don't try to raise the per-lot bid-acceptance rate above ~2/sec** —
   it's a Firestore architectural ceiling, not a config knob. If a future
   product need genuinely requires higher per-lot throughput, the fix is a
   different data model (e.g. sharding bid queues), not tuning.
2. **Do raise `placeBid`'s `maxInstances`** from 20 to 500+ before any real
   drop with meaningfully more than ~100 simultaneous bidders — this is a
   free (at-idle) fix for a real, confirmed failure mode.
3. **Viewer/read scaling has real headroom** — tens of thousands of
   concurrent viewers work today with zero failures. The cost driver at that
   scale is Firestore read volume from realtime listener fan-out, which
   scales roughly linearly with `viewers × accepted-bids-during-the-drop`,
   not with the number of bidders.
4. **Load-testing itself is cheap** — re-run `scripts/loadtest/` any time
   after a change to re-confirm these numbers; each run costs cents.

---

## Notes on the load-test harness (fixed today)

- Fixed a `firebase-admin` version mismatch (root `package.json` has v14's
  modular-only API; the harness needed v11's namespace API matching
  `functions/`'s own version) — resolved by installing a scoped local
  `firebase-admin@^11` under `scripts/loadtest/`.
- Fixed a real race condition surfaced by testing at scale: `onUserCreated`
  (an Auth trigger) writes default `subscriptionStatus:'none'` asynchronously
  on new-user creation, which can race and clobber `seed.js`'s own
  `subscriptionStatus:'active'` write for freshly-created users. Mitigation:
  re-run `seed.js` once after any run that creates new Auth users (documented
  in `seed.js`'s own console output now).
- Added bounded-concurrency (`mapWithConcurrency` in `common.js`) to both
  user-seeding and token-minting — the original sequential implementations
  were impractically slow beyond a few hundred users/bidders. Capped (not
  unbounded) to stay gentle on Google's own Identity Toolkit API quota.
- Added `scripts/loadtest/viewer-storm.js` — a new script simulating N
  concurrent Firestore listeners on a lot (the read/viewer side), separate
  from the existing bid-storm (the write/bidder side).
- `UV_THREADPOOL_SIZE=64` (or higher) is now recommended in the README for
  any run seeding/minting beyond a few hundred — Node's default thread pool
  (4) causes spurious DNS `ENOTFOUND` errors under heavy concurrent lookup
  pressure otherwise; this is a Node/local-machine limitation, unrelated to
  Firebase or Mazzado's backend.
