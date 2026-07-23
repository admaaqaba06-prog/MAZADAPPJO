/**
 * bid-storm.js — drive the REAL `placeBid` callable with K concurrent bidders
 * on one lot for T seconds, then hand the collected records to report.js for
 * metrics + a correctness audit.
 *
 * Auth path (mirrors a real client, per the spec's Load-Testing Plan):
 *   1. Admin SDK createCustomToken(uid) for each seeded bidder.
 *   2. Exchange for an ID token via the Auth REST API:
 *        POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=<WEB_API_KEY>
 *        body {"token": "<custom>", "returnSecureToken": true}  ->  { idToken }
 *      (ID tokens live 1h — plenty for any sane T.)
 *   3. Call placeBid over the gen-1 callable HTTPS protocol:
 *        POST https://<region>-<project>.cloudfunctions.net/placeBid
 *        headers: Content-Type: application/json, Authorization: Bearer <idToken>
 *        body:    {"data": {"auctionId": "...", "amount": <JOD number>}}
 *      Success  -> HTTP 200 {"result": {success, message, amount?, finalEndTime?}}
 *                  (validation "no"s come back success:false INSIDE result — HTTP 200)
 *      Thrown   -> HTTP 4xx/5xx {"error": {message, status}} — notably
 *                  status "ABORTED" / message "PRICE_MOVED_RETRY" (HTTP 409) on
 *                  transaction contention (functions/index.js:943-945).
 *
 * Bidder behavior (mirrors src/context/AppContext.tsx placeBid + retry UX):
 *   - Each virtual bidder loops: re-read the auction price (fresh min via the
 *     same bidPricing rule as the server), bid the min, record the outcome,
 *     then pace itself >= the 1.5s per-user server rate limit
 *     (functions/index.js:819-824). Aggression comes from bidder COUNT.
 *   - On PRICE_MOVED_RETRY (aborted contention) the next loop iteration is
 *     the client-style retry: re-read price, retry at the new min.
 *   - On a below-min rejection the next iteration likewise recomputes the min
 *     from live state (same as the client's confirm re-prompt).
 *
 * Env knobs:
 *   LOADTEST_BIDDERS      K concurrent bidders                 (default 25)
 *   LOADTEST_SECONDS      T storm duration                     (default 60)
 *   LOADTEST_PACE_MS      per-user pacing between own bids     (default 1600)
 *                         set <1500 to deliberately measure the rate limiter
 *   LOADTEST_JITTER_MS    random extra pacing 0..J             (default 400)
 *   LOADTEST_AUCTION_ID   lot to storm (default: first lot in seed-manifest)
 *   LOADTEST_SETTLE       '1' (default) = after the storm, force endsAt into
 *                         the past and wait for the REAL scheduledAuctionCloser
 *                         cron to settle, so the audit can verify the order.
 *                         '0' = skip settling (auction stays live).
 *
 * Usage:  node bid-storm.js          (after node seed.js)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
  loadConfig,
  initAdmin,
  sleep,
  bidPricing,
  readManifest,
  fail,
} = require('./common');
const { buildReport, printReport, runAudit } = require('./report');

const K = parseInt(process.env.LOADTEST_BIDDERS || '25', 10);
const T_SECONDS = parseInt(process.env.LOADTEST_SECONDS || '60', 10);
const PACE_MS = parseInt(process.env.LOADTEST_PACE_MS || '1600', 10);
const JITTER_MS = parseInt(process.env.LOADTEST_JITTER_MS || '400', 10);
const DO_SETTLE = process.env.LOADTEST_SETTLE !== '0';

const config = loadConfig({ requireWebApiKey: true });
const { admin, db } = initAdmin(config);

const manifest = readManifest();
if (!manifest) {
  fail('No seed-manifest.json — run `node seed.js` first.');
}
if (manifest.projectId !== config.projectId) {
  fail(`seed-manifest.json is for project "${manifest.projectId}" but LOADTEST_PROJECT_ID is "${config.projectId}". Re-run seed.js.`);
}
const AUCTION_ID = process.env.LOADTEST_AUCTION_ID || manifest.auctionIds[0];
if (!manifest.auctionIds.includes(AUCTION_ID)) {
  fail(`Auction "${AUCTION_ID}" is not in the seed manifest (${manifest.auctionIds.join(', ')}).`);
}
if (K > manifest.uids.length) {
  fail(`LOADTEST_BIDDERS=${K} but only ${manifest.uids.length} users were seeded. Re-run seed.js with LOADTEST_USERS>=${K}.`);
}

const PLACE_BID_URL = `${config.functionsBaseUrl}/placeBid`;
const SIGN_IN_URL = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${config.webApiKey}`;

// ---------------------------------------------------------------------------
// Auth: custom token -> ID token
// ---------------------------------------------------------------------------

async function mintIdToken(uid) {
  const customToken = await admin.auth().createCustomToken(uid);
  const res = await fetch(SIGN_IN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.idToken) {
    throw new Error(
      `signInWithCustomToken failed for ${uid} (HTTP ${res.status}): ` +
      JSON.stringify(body.error || body)
    );
  }
  return body.idToken;
}

// ---------------------------------------------------------------------------
// The callable call + outcome classification
// ---------------------------------------------------------------------------

// Rejection reasons -> buckets, mirroring the exact placeBid messages
// (functions/index.js:815-860). Substring matching, same as the client's
// bidErrors.ts classification.
function classifyRejection(message) {
  const m = String(message || '');
  if (m.includes('يرجى الانتظار')) return 'rate_limited';           // 1.5s per-user limit
  if (m.includes('Minimum bid')) return 'below_min';               // stale price
  if (m.includes('بالفعل')) return 'duplicate_amount';             // same user, same amount
  if (m.includes('already ended')) return 'ended';
  if (m.includes('not accepting')) return 'not_live';
  if (m.includes('MEMBERSHIP_REQUIRED')) return 'membership';
  if (m.includes('restricted')) return 'blocked';
  if (m.includes('not found')) return 'not_found';
  return 'rejected_other';
}

/**
 * One placeBid round-trip. Returns a record:
 * { outcome, reason, httpStatus, latencyMs, amountFils, ... }
 * outcome: 'accepted' | 'rejected' | 'aborted_contention' | 'error' | 'network_error'
 */
async function callPlaceBid(idToken, amountJod) {
  const started = process.hrtime.bigint();
  let httpStatus = 0;
  try {
    const res = await fetch(PLACE_BID_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ data: { auctionId: AUCTION_ID, amount: amountJod } }),
      signal: AbortSignal.timeout(30000),
    });
    httpStatus = res.status;
    const latencyMs = Number(process.hrtime.bigint() - started) / 1e6;
    const body = await res.json().catch(() => ({}));

    if (res.ok && body.result) {
      if (body.result.success === true) {
        return { outcome: 'accepted', reason: 'accepted', httpStatus, latencyMs, serverMessage: body.result.message };
      }
      const reason = classifyRejection(body.result.message);
      return { outcome: 'rejected', reason, httpStatus, latencyMs, serverMessage: body.result.message };
    }

    // Thrown HttpsError path: {"error": {"message": "...", "status": "ABORTED"|...}}
    const errStatus = body.error && body.error.status;
    const errMessage = (body.error && body.error.message) || '';
    if (errStatus === 'ABORTED' || errMessage.includes('PRICE_MOVED_RETRY')) {
      // Transaction contention on the hot auction doc — the retriable infra
      // "no", NOT a validation rejection (functions/index.js:929-945).
      return { outcome: 'aborted_contention', reason: 'PRICE_MOVED_RETRY', httpStatus, latencyMs, serverMessage: errMessage };
    }
    return {
      outcome: 'error',
      reason: `http_${httpStatus}_${errStatus || 'unknown'}`,
      httpStatus,
      latencyMs,
      serverMessage: errMessage,
    };
  } catch (e) {
    const latencyMs = Number(process.hrtime.bigint() - started) / 1e6;
    // A timed-out request MAY still have committed server-side; the audit
    // cross-checks unmatched bid docs against these records.
    return { outcome: 'network_error', reason: e.name === 'TimeoutError' ? 'timeout' : 'fetch_failed', httpStatus, latencyMs, serverMessage: e.message };
  }
}

// ---------------------------------------------------------------------------
// Virtual bidder loop
// ---------------------------------------------------------------------------

async function readMinRequired() {
  const snap = await db.collection('auctions').doc(AUCTION_ID).get();
  if (!snap.exists) throw new Error(`Auction ${AUCTION_ID} disappeared mid-storm.`);
  return bidPricing(snap.data());
}

async function bidderLoop(userIdx, uid, idToken, stormStartMs, deadlineMs, records) {
  // Stagger the first shots so K bidders don't fire in perfect lockstep.
  await sleep(Math.random() * Math.min(PACE_MS, 1000));
  let wasAborted = false;

  while (Date.now() < deadlineMs) {
    let pricing;
    try {
      pricing = await readMinRequired(); // fresh min, same rule as the server
    } catch (e) {
      records.push({
        tOffsetMs: Date.now() - stormStartMs, userIdx, uid, amountFils: null,
        outcome: 'error', reason: 'price_read_failed', httpStatus: 0, latencyMs: 0, serverMessage: e.message,
      });
      await sleep(PACE_MS);
      continue;
    }

    const amountFils = pricing.minRequiredFils;
    const rec = await callPlaceBid(idToken, amountFils / 1000);
    records.push({
      tOffsetMs: Date.now() - stormStartMs,
      userIdx,
      uid,
      amountFils,
      isRetryAfterAbort: wasAborted,
      ...rec,
    });
    wasAborted = rec.outcome === 'aborted_contention';

    // Per-user pacing: respect (or deliberately probe, via LOADTEST_PACE_MS)
    // the server's 1.5s per-user rate limit. Contention pressure comes from
    // the NUMBER of bidders, not from any one user spamming.
    await sleep(PACE_MS + Math.random() * JITTER_MS);
  }
}

// ---------------------------------------------------------------------------
// Post-storm: force the lot to expire, let the REAL closer cron settle it
// ---------------------------------------------------------------------------

async function settleViaCron() {
  console.log('[storm] settling: forcing endsAt into the past; waiting for scheduledAuctionCloser (every-1-minute cron)...');
  const pastMs = Date.now() - 1000;
  await db.collection('auctions').doc(AUCTION_ID).update({
    endTime: pastMs,
    endsAt: admin.firestore.Timestamp.fromMillis(pastMs),
  });

  // The cron sweeps every minute; give it up to ~3 sweeps.
  const waitUntil = Date.now() + 200 * 1000;
  while (Date.now() < waitUntil) {
    await sleep(10000);
    const snap = await db.collection('auctions').doc(AUCTION_ID).get();
    const status = snap.exists ? snap.data().status : 'missing';
    if (['completed', 'ended', 'reserve_not_met'].includes(status)) {
      console.log(`[storm] settled: auction status = ${status}`);
      return true;
    }
    process.stdout.write('.');
  }
  console.warn('\n[storm] WARNING: closer cron did not settle within ~3 minutes — is Cloud Scheduler deployed on the throwaway project? Order checks will be skipped.');
  return false;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

(async () => {
  console.log(`[storm] project: ${config.projectId} (prod guard passed)`);
  console.log(`[storm] target:  ${PLACE_BID_URL}`);
  console.log(`[storm] lot:     ${AUCTION_ID}`);
  console.log(`[storm] config:  K=${K} bidders, T=${T_SECONDS}s, pace=${PACE_MS}ms+0..${JITTER_MS}ms jitter`);
  if (PACE_MS < 1500) {
    console.log('[storm] NOTE: pace < 1500ms — deliberately probing the per-user rate limiter; expect rate_limited rejections.');
  }

  // Sanity: the lot must still be live and not about to expire mid-storm.
  const lotSnap = await db.collection('auctions').doc(AUCTION_ID).get();
  if (!lotSnap.exists) fail(`Auction ${AUCTION_ID} not found — run seed.js.`);
  const lot = lotSnap.data();
  if (lot.status !== 'live' && lot.status !== 'active') {
    fail(`Auction ${AUCTION_ID} status is "${lot.status}" (not live) — re-run seed.js.`);
  }
  const endsAtMs = lot.endsAt && lot.endsAt.toMillis ? lot.endsAt.toMillis() : lot.endTime;
  if (endsAtMs && endsAtMs < Date.now() + (T_SECONDS + 30) * 1000) {
    fail(`Auction ${AUCTION_ID} ends too soon for a ${T_SECONDS}s storm — re-run seed.js (LOADTEST_AUCTION_MINUTES).`);
  }

  const uids = manifest.uids.slice(0, K);
  console.log(`[storm] minting ${K} custom tokens + exchanging for ID tokens...`);
  const idTokens = [];
  for (const uid of uids) {
    idTokens.push(await mintIdToken(uid)); // sequential: gentle on the Auth REST quota
  }
  console.log('[storm] tokens ready. firing.');

  const records = [];
  const stormStartMs = Date.now();
  const deadlineMs = stormStartMs + T_SECONDS * 1000;

  const ticker = setInterval(() => {
    const acc = records.filter((r) => r.outcome === 'accepted').length;
    const abt = records.filter((r) => r.outcome === 'aborted_contention').length;
    console.log(`[storm] t+${Math.round((Date.now() - stormStartMs) / 1000)}s  requests=${records.length} accepted=${acc} aborted=${abt}`);
  }, 5000);

  await Promise.all(
    uids.map((uid, i) => bidderLoop(i, uid, idTokens[i], stormStartMs, deadlineMs, records))
  );
  clearInterval(ticker);
  const stormDurationMs = Date.now() - stormStartMs;
  console.log(`[storm] storm over: ${records.length} requests in ${(stormDurationMs / 1000).toFixed(1)}s`);

  const settled = DO_SETTLE ? await settleViaCron() : false;

  // Persist raw records so report.js can be re-run standalone.
  const ctx = {
    projectId: config.projectId,
    auctionId: AUCTION_ID,
    bidders: K,
    stormSeconds: T_SECONDS,
    stormDurationMs,
    paceMs: PACE_MS,
    jitterMs: JITTER_MS,
    settled,
    startedAt: new Date(stormStartMs).toISOString(),
  };
  const outPath = path.join(__dirname, `results-${new Date(stormStartMs).toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(outPath, JSON.stringify({ ctx, records }, null, 2));
  console.log(`[storm] raw records written to ${outPath}`);

  // Metrics + correctness audit (report.js).
  const report = buildReport(records, ctx);
  const audit = await runAudit(db, AUCTION_ID, records, { expectSettled: settled });
  printReport(report, audit, ctx);

  process.exit(report.pass && audit.pass ? 0 : 2);
})().catch((e) => {
  console.error('[storm] failed:', e);
  process.exit(1);
});
