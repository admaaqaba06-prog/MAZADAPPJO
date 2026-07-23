# Mazad JO — placeBid Load-Test Harness

Measures the real `placeBid` ceiling per the Load-Testing Plan in
`docs/superpowers/specs/2026-07-23-perf-for-load-design.md`: accepted bids/sec/lot,
rejection breakdown, p50/p95/p99 latency, cold-start delta, and a to-the-fil
correctness audit of the auction, its bids, and the settled order.

## NEVER AGAINST PROD

This harness only ever runs against a **THROWAWAY Firebase project**. Concurrent
writes to a real hot auction doc + fake users would corrupt real state and bill
real money.

**Built-in guard:** every script hard-fails (exit 1) before touching anything if:

- `LOADTEST_PROJECT_ID` is missing, or
- `LOADTEST_PROJECT_ID` matches a production project id — `mazadjoapp` is
  hardcoded, **plus** every project id found in the repo's `.firebaserc` at
  runtime, or
- the service account at `GOOGLE_APPLICATION_CREDENTIALS` belongs to a
  blocklisted project, or its `project_id` differs from `LOADTEST_PROJECT_ID`
  (no "throwaway id on the CLI, prod creds in the env"), or
- `LOADTEST_WEB_API_KEY` equals the production web API key from
  `src/services/firebase.ts`.

Do not add the throwaway project to `.firebaserc` as `default`, and never
weaken the blocklist in `common.js`.

## One-time setup

1. **Create a throwaway Firebase project** (Blaze plan — Cloud Functions
   require it):

   ```bash
   firebase projects:create mazadjo-loadtest-1   # any NON-prod id
   # In the Firebase console for that project: enable Firestore (production
   # mode) and Authentication (no providers needed — the harness uses custom
   # tokens minted by the Admin SDK).
   ```

2. **Deploy the app's functions + rules + indexes to it** (from the repo root):

   ```bash
   firebase deploy --project mazadjo-loadtest-1 \
     --only functions,firestore:rules,firestore:indexes
   ```

   This deploys `placeBid` **and** `scheduledAuctionCloser` (the every-minute
   settle cron the audit relies on). First deploy may ask to enable Cloud
   Scheduler/Build APIs — accept.

3. **Service account key** (never committed — `.gitignore` here blocks common
   names, but keep it outside the repo anyway):
   Firebase console → Project settings → Service accounts → *Generate new
   private key*. Save it somewhere like `~/keys/mazadjo-loadtest-1.json`.

4. **Web API key** of the throwaway project (needed to exchange custom tokens
   for ID tokens via the Auth REST API):
   Project settings → General → *Web API Key*, or
   `firebase apps:sdkconfig web --project mazadjo-loadtest-1`
   (create a web app first with `firebase apps:create web loadtest` if none).

5. **Env** (shell session, or a `.env` you source — never commit):

   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS=~/keys/mazadjo-loadtest-1.json
   export LOADTEST_PROJECT_ID=mazadjo-loadtest-1
   export LOADTEST_WEB_API_KEY=AIza...        # THROWAWAY project's key
   # optional:
   # export LOADTEST_REGION=us-central1      # gen-1 default; only if you changed it
   # export LOADTEST_FUNCTIONS_URL=https://...cloudfunctions.net  # full override
   ```

6. `npm install` at the **repo root** if you haven't (`firebase-admin` is a
   root dependency; the harness resolves it from there — no extra installs).

## Run

From `scripts/loadtest/`:

```bash
node seed.js        # N users w/ active subscriptions + M live lots (isLoadTest:true)
node bid-storm.js   # the storm + report + correctness audit
node teardown.js    # delete everything flagged isLoadTest
```

Re-run `seed.js` between storms — it resets lot prices, clears old bids, and
zeroes each user's `lastBidAt`.

### Knobs

| Env var | Default | Meaning |
| --- | --- | --- |
| `LOADTEST_USERS` | 50 | seeded bidders (seed.js) |
| `LOADTEST_AUCTIONS` | 3 | seeded live lots (seed.js) |
| `LOADTEST_AUCTION_MINUTES` | 10 | lot endsAt horizon (seed.js) |
| `LOADTEST_START_PRICE_JOD` | 100 | integer (fils-clean) starting price |
| `LOADTEST_MIN_INCREMENT_JOD` | 5 | integer increment |
| `LOADTEST_BIDDERS` | 25 | K concurrent bidders (bid-storm.js) |
| `LOADTEST_SECONDS` | 60 | T storm duration |
| `LOADTEST_PACE_MS` | 1600 | per-user pacing; `<1500` probes the rate limiter |
| `LOADTEST_JITTER_MS` | 400 | random extra pacing |
| `LOADTEST_AUCTION_ID` | first seeded lot | which lot to storm |
| `LOADTEST_SETTLE` | 1 | after the storm, expire the lot and wait for the real `scheduledAuctionCloser` cron so the audit can verify the order; `0` skips |

### The ramp the spec asks for (10 → 25 → 50 → 100 on the hot lot)

```bash
LOADTEST_USERS=100 node seed.js
for k in 10 25 50 100; do
  LOADTEST_BIDDERS=$k node bid-storm.js
  node seed.js        # reset the lot between steps
done
```

Each storm writes `results-<timestamp>.json`; re-print/re-audit any run with
`node report.js results-<timestamp>.json`.

## What it measures / pass-fail (from the spec)

- **accepted / aborted(contention) / rejected(reason) per second per lot** —
  expected ceiling **~2-3 accepted/sec/lot** (single-doc txn contention);
  PASS requires **>= 2/sec** as concurrency rises.
- **Latency p50/p95/p99**, warm vs cold: PASS requires **warm p95 < 800ms**.
  Cold-start delta = max of the first 10 requests minus steady-state p50
  (PF3 `minInstances` evidence — `placeBid` currently deploys `minInstances:1`).
- **Rate limit:** each virtual bidder paces itself ≥ the server's 1.5s/user
  limit; aggression comes from bidder count. The report shows the min observed
  same-user accepted-bid gap and the `rate_limited` rejection count.
- **Correctness audit (hard PASS/FAIL):** re-reads the auction + `bids`
  subcollection + `orders/{auctionId}` and asserts no lost / duplicate /
  mis-attributed bids, a strictly monotonic integer-fils price ladder,
  `totalBids`/`currentPrice*`/`currentBidderId` coherence, winner == highest
  accepted bid, and order `buyersPremium`/`totalDue` == bid + 5% premium
  **to the fil** (settleAuctionTxn math).

Record confirmed numbers in `docs/PERFORMANCE.md` per the spec.

## Notes

- The harness drives the **real** `placeBid` callable over its HTTPS protocol
  (`POST {"data":{auctionId,amount}}` + `Authorization: Bearer <ID token>`) —
  not `simulateBid`, which is admin-gated and bypasses the rate limit and
  membership gates.
- `PRICE_MOVED_RETRY` (HTTP 409 / `ABORTED`) is handled exactly like the app:
  re-read the live price, retry at the new minimum on the next iteration.
- Firestore reads/writes per bid and viewer fan-out costs (also in the spec's
  measure list) are read from the Cloud Console metrics of the throwaway
  project during the run — they are not client-observable from this harness.
