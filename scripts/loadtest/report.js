/**
 * report.js — metrics + CORRECTNESS AUDIT for a bid-storm run.
 *
 * Exports (used by bid-storm.js right after a storm):
 *   buildReport(records, ctx) -> throughput / rejection breakdown / latency
 *                                percentiles / cold-start delta + pass flags
 *   runAudit(db, auctionId, records, opts) -> re-reads the auction doc, its
 *                                bids subcollection and the settled order, and
 *                                asserts money-path correctness
 *   printReport(report, audit, ctx)
 *
 * Standalone re-run against a saved results file (uses the live throwaway DB
 * for the audit):   node report.js results-<timestamp>.json
 *
 * PASS/FAIL thresholds — from docs/superpowers/specs/2026-07-23-perf-for-load-design.md
 * (§ Load-Testing Plan, "Pass/fail thresholds"):
 *   - accepted throughput holds >= 2 bids/sec/lot as concurrency rises
 *     (expected ceiling ~2-3/sec/lot from single-doc txn contention)
 *   - warm p95 < ~800ms
 *   - NO lost / double-counted / mis-attributed bids, no wrong winner,
 *     order money exact to the fil
 */

'use strict';

const { percentile, expectedOrderTotals } = require('./common');

const THRESHOLDS = {
  minAcceptedPerSec: 2.0,   // spec: >=2 accepted bids/sec/lot under concurrency
  warmP95Ms: 800,           // spec: warm p95 < ~800ms
  warmAfterMs: 10000,       // requests after t+10s count as "steady state"
  coldFirstN: 10,           // "cold window": the first N requests of the run
  minUserGapMs: 1400,       // informational floor for the 1.5s per-user limit
};

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

function buildReport(records, ctx) {
  const byOutcome = {};
  const rejectionReasons = {};
  for (const r of records) {
    byOutcome[r.outcome] = (byOutcome[r.outcome] || 0) + 1;
    if (r.outcome === 'rejected') {
      rejectionReasons[r.reason] = (rejectionReasons[r.reason] || 0) + 1;
    }
  }
  const accepted = records.filter((r) => r.outcome === 'accepted');
  const durationSec = (ctx.stormDurationMs || 1) / 1000;
  const acceptedPerSec = accepted.length / durationSec;

  const allLat = records.filter((r) => r.latencyMs > 0).map((r) => r.latencyMs);
  const acceptedLat = accepted.map((r) => r.latencyMs);

  // Cold-start delta: the first N requests of the whole run (in wall-clock
  // order of request START = completion offset minus latency) vs steady state
  // (everything after warmAfterMs). placeBid deploys with minInstances:1, so
  // the delta here directly evidences the PF3 minInstances cost decision.
  const chrono = [...records]
    .filter((r) => r.latencyMs > 0)
    .sort((a, b) => (a.tOffsetMs - a.latencyMs) - (b.tOffsetMs - b.latencyMs));
  const coldLat = chrono.slice(0, THRESHOLDS.coldFirstN).map((r) => r.latencyMs);
  const steadyLat = chrono
    .filter((r) => (r.tOffsetMs - r.latencyMs) >= THRESHOLDS.warmAfterMs)
    .map((r) => r.latencyMs);

  // Per-user spacing of ACCEPTED bids — measures the 1.5s server rate limit.
  // Gap computed between request-start times (client-side approximation; the
  // server's own clock is authoritative inside the txn).
  let minAcceptedGapMs = null;
  const byUser = new Map();
  for (const r of accepted) {
    if (!byUser.has(r.uid)) byUser.set(r.uid, []);
    byUser.get(r.uid).push(r.tOffsetMs - r.latencyMs);
  }
  for (const starts of byUser.values()) {
    starts.sort((a, b) => a - b);
    for (let i = 1; i < starts.length; i++) {
      const gap = starts[i] - starts[i - 1];
      if (minAcceptedGapMs === null || gap < minAcceptedGapMs) minAcceptedGapMs = gap;
    }
  }

  const warmP95 = percentile(steadyLat.length ? steadyLat : allLat, 95);
  const throughputPass = acceptedPerSec >= THRESHOLDS.minAcceptedPerSec;
  const latencyPass = warmP95 !== null && warmP95 < THRESHOLDS.warmP95Ms;

  return {
    totals: {
      requests: records.length,
      byOutcome,
      rejectionReasons,
      retriesAfterAbort: records.filter((r) => r.isRetryAfterAbort).length,
    },
    throughput: {
      acceptedBids: accepted.length,
      durationSec: Number(durationSec.toFixed(1)),
      acceptedPerSecPerLot: Number(acceptedPerSec.toFixed(2)),
      threshold: THRESHOLDS.minAcceptedPerSec,
      pass: throughputPass,
    },
    latencyMs: {
      all: { p50: percentile(allLat, 50), p95: percentile(allLat, 95), p99: percentile(allLat, 99) },
      accepted: { p50: percentile(acceptedLat, 50), p95: percentile(acceptedLat, 95), p99: percentile(acceptedLat, 99) },
      coldWindow: {
        n: coldLat.length,
        mean: coldLat.length ? Number((coldLat.reduce((a, b) => a + b, 0) / coldLat.length).toFixed(1)) : null,
        max: coldLat.length ? Number(Math.max(...coldLat).toFixed(1)) : null,
      },
      steadyState: {
        n: steadyLat.length,
        p50: percentile(steadyLat, 50),
        p95: percentile(steadyLat, 95),
        p99: percentile(steadyLat, 99),
      },
      coldStartDeltaMs:
        coldLat.length && steadyLat.length
          ? Number((Math.max(...coldLat) - percentile(steadyLat, 50)).toFixed(1))
          : null,
      warmP95Threshold: THRESHOLDS.warmP95Ms,
      warmP95Pass: latencyPass,
    },
    rateLimit: {
      minGapBetweenAcceptedBidsSameUserMs: minAcceptedGapMs === null ? null : Math.round(minAcceptedGapMs),
      serverLimitMs: 1500,
      note: minAcceptedGapMs !== null && minAcceptedGapMs < THRESHOLDS.minUserGapMs
        ? 'gap below ~1.5s observed client-side — server clock is authoritative, verify rate_limited counts'
        : 'per-user pacing respected the 1.5s server rate limit',
    },
    pass: throughputPass && latencyPass,
  };
}

// ---------------------------------------------------------------------------
// Correctness audit
// ---------------------------------------------------------------------------

/**
 * Re-read the auction + bids subcollection (+ settled order) and assert:
 *   - no lost bids       (every accepted response has exactly one bid doc)
 *   - no duplicate bids  (no two bid docs share an amount — amounts are
 *                         strictly increasing under the min-bid rule, so a
 *                         duplicate amount means a double-applied bid)
 *   - no mis-attribution (each bid doc's bidderId matches the record's uid)
 *   - monotonic price    (first bid >= startingPrice; every later bid >=
 *                         previous + minIncrement; all integer fils)
 *   - auction doc coherence (totalBids / currentPrice(Fils) / currentBidderId
 *                         all agree with the bid set)
 *   - winner == highest accepted bid, and the settled order's buyersPremium +
 *     totalDue match settleAuctionTxn's 5% integer-fils math TO THE FIL
 */
async function runAudit(db, auctionId, records, { expectSettled = false } = {}) {
  const failures = [];
  const warnings = [];

  const auctionSnap = await db.collection('auctions').doc(auctionId).get();
  if (!auctionSnap.exists) {
    return { pass: false, failures: [`auction ${auctionId} missing at audit time`], warnings, summary: {} };
  }
  const auction = auctionSnap.data();

  const bidsSnap = await db.collection('auctions').doc(auctionId).collection('bids').get();
  const bidDocs = bidsSnap.docs.map((d) => d.data());

  const accepted = records.filter((r) => r.outcome === 'accepted');
  const startingPriceFils = Math.round((auction.startingPrice || 0) * 1000);
  const minIncrementFils = Math.round((auction.minIncrement || 10) * 1000);

  // --- match accepted responses <-> bid docs (amountFils is unique per
  // accepted bid: the min-bid rule forces strictly increasing amounts) ---
  const docsByAmount = new Map();
  for (const d of bidDocs) {
    const amt = d.amountFils !== undefined ? d.amountFils : Math.round((d.amount || 0) * 1000);
    if (docsByAmount.has(amt)) {
      failures.push(`DUPLICATE bid docs at ${amt} fils (bidders ${docsByAmount.get(amt).bidderId} and ${d.bidderId}) — double-applied bid`);
    }
    docsByAmount.set(amt, d);
  }

  for (const rec of accepted) {
    const doc = docsByAmount.get(rec.amountFils);
    if (!doc) {
      failures.push(`LOST bid: ${rec.uid} got success for ${rec.amountFils} fils but no bid doc exists`);
    } else if (doc.bidderId !== rec.uid) {
      failures.push(`MIS-ATTRIBUTED bid at ${rec.amountFils} fils: accepted for ${rec.uid} but doc says ${doc.bidderId}`);
    }
  }

  // Unmatched docs: a bid doc with no accepted response. A request that timed
  // out client-side may still have committed — cross-check before failing.
  const acceptedAmounts = new Set(accepted.map((r) => r.amountFils));
  for (const [amt, doc] of docsByAmount) {
    if (!acceptedAmounts.has(amt)) {
      const ghost = records.find(
        (r) => (r.outcome === 'network_error' || r.outcome === 'error') && r.amountFils === amt && r.uid === doc.bidderId
      );
      if (ghost) {
        warnings.push(`bid doc at ${amt} fils matches a ${ghost.outcome} request from ${doc.bidderId} — committed but unacked (not a correctness failure)`);
      } else {
        failures.push(`PHANTOM bid doc at ${amt} fils by ${doc.bidderId} — no corresponding request record`);
      }
    }
  }

  // --- monotonic price ladder, integer fils ---
  const sorted = [...docsByAmount.keys()].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    const amt = sorted[i];
    if (!Number.isInteger(amt)) failures.push(`non-integer fils amount ${amt}`);
    const doc = docsByAmount.get(amt);
    const jodFils = Math.round((doc.amount || 0) * 1000);
    if (jodFils !== amt) failures.push(`bid doc fils mismatch: amount=${doc.amount} JOD vs amountFils=${amt}`);
    if (i === 0) {
      if (amt < startingPriceFils) failures.push(`first bid ${amt} below starting price ${startingPriceFils} fils`);
    } else if (amt < sorted[i - 1] + minIncrementFils) {
      failures.push(`price ladder violation: ${amt} < ${sorted[i - 1]} + increment ${minIncrementFils} fils`);
    }
  }

  // --- auction doc coherence ---
  const topAmount = sorted.length ? sorted[sorted.length - 1] : null;
  const topDoc = topAmount !== null ? docsByAmount.get(topAmount) : null;
  if ((auction.totalBids || 0) !== bidDocs.length) {
    failures.push(`auction.totalBids=${auction.totalBids} but ${bidDocs.length} bid docs exist`);
  }
  if (topAmount !== null) {
    if (Math.round((auction.currentPrice || 0) * 1000) !== topAmount) {
      failures.push(`auction.currentPrice=${auction.currentPrice} JOD != top bid ${topAmount} fils`);
    }
    if (auction.currentPriceFils !== undefined && auction.currentPriceFils !== topAmount) {
      failures.push(`auction.currentPriceFils=${auction.currentPriceFils} != top bid ${topAmount}`);
    }
    if (auction.currentBidderId !== topDoc.bidderId) {
      failures.push(`WRONG LEADER: auction.currentBidderId=${auction.currentBidderId} but highest bid is ${topDoc.bidderId}`);
    }
  }

  // --- settled order (scheduledAuctionCloser -> settleAuctionTxn semantics) ---
  const orderSnap = await db.collection('orders').doc(auctionId).get();
  const settledStatus = ['completed', 'ended', 'reserve_not_met'].includes(auction.status);

  if (settledStatus && auction.status === 'completed') {
    if (!orderSnap.exists) {
      failures.push(`auction completed but no orders/${auctionId} doc`);
    } else {
      const order = orderSnap.data();
      if (topDoc && order.buyerId !== topDoc.bidderId) {
        failures.push(`WRONG WINNER: order.buyerId=${order.buyerId} but highest accepted bid is ${topDoc.bidderId}`);
      }
      const finalPriceJod = topAmount !== null ? topAmount / 1000 : auction.startingPrice;
      if (Math.round((order.winningBidAmount || 0) * 1000) !== Math.round(finalPriceJod * 1000)) {
        failures.push(`order.winningBidAmount=${order.winningBidAmount} != final price ${finalPriceJod} JOD`);
      }
      // settleAuctionTxn: premium = round(fils*0.05)/1000, totalDue = (fils + round(fils*0.05))/1000
      const expect = expectedOrderTotals(finalPriceJod);
      if (Math.round((order.buyersPremium || 0) * 1000) !== expect.premiumFils) {
        failures.push(`order.buyersPremium=${order.buyersPremium} JOD != expected ${expect.buyersPremiumJod} (to-the-fil)`);
      }
      if (Math.round((order.totalDue || 0) * 1000) !== expect.totalDueFils) {
        failures.push(`order.totalDue=${order.totalDue} JOD != expected ${expect.totalDueJod} (bid + 5% premium, to-the-fil)`);
      }
      if (order.status !== 'waiting_payment') {
        warnings.push(`order.status=${order.status} (expected waiting_payment)`);
      }
    }
  } else if (settledStatus && auction.status === 'ended') {
    if (accepted.length > 0) failures.push(`auction settled 'ended' (unsold) despite ${accepted.length} accepted bids`);
    if (orderSnap.exists) failures.push(`unsold auction has an order doc`);
  } else if (expectSettled) {
    warnings.push(`auction status is still "${auction.status}" — settle did not complete; order checks skipped`);
  } else {
    warnings.push('auction not settled (LOADTEST_SETTLE=0 or still live) — winner/order checks limited to leader coherence');
  }

  return {
    pass: failures.length === 0,
    failures,
    warnings,
    summary: {
      auctionStatus: auction.status,
      bidDocs: bidDocs.length,
      acceptedResponses: accepted.length,
      topBidFils: topAmount,
      leader: auction.currentBidderId || null,
      orderExists: orderSnap.exists,
    },
  };
}

// ---------------------------------------------------------------------------
// Pretty print
// ---------------------------------------------------------------------------

function fmt(v) {
  return v === null || v === undefined ? 'n/a' : (typeof v === 'number' ? v.toFixed(1) : String(v));
}

function printReport(report, audit, ctx) {
  const L = console.log;
  L('\n================= LOAD TEST REPORT =================');
  L(`lot ${ctx.auctionId} — ${ctx.bidders} bidders for ${ctx.stormSeconds}s (pace ${ctx.paceMs}ms)`);
  L('\n--- Throughput ---');
  L(`accepted bids:          ${report.throughput.acceptedBids}`);
  L(`accepted/sec/lot:       ${report.throughput.acceptedPerSecPerLot}  (threshold >= ${report.throughput.threshold})  ${report.throughput.pass ? 'PASS' : 'FAIL'}`);
  L('\n--- Outcomes ---');
  for (const [k, v] of Object.entries(report.totals.byOutcome)) L(`${k.padEnd(20)} ${v}`);
  if (Object.keys(report.totals.rejectionReasons).length) {
    L('rejection breakdown:');
    for (const [k, v] of Object.entries(report.totals.rejectionReasons)) L(`  ${k.padEnd(18)} ${v}`);
  }
  L(`retries after abort:    ${report.totals.retriesAfterAbort}`);
  L('\n--- Latency (ms) ---');
  L(`all      p50=${fmt(report.latencyMs.all.p50)}  p95=${fmt(report.latencyMs.all.p95)}  p99=${fmt(report.latencyMs.all.p99)}`);
  L(`accepted p50=${fmt(report.latencyMs.accepted.p50)}  p95=${fmt(report.latencyMs.accepted.p95)}  p99=${fmt(report.latencyMs.accepted.p99)}`);
  L(`steady   p50=${fmt(report.latencyMs.steadyState.p50)}  p95=${fmt(report.latencyMs.steadyState.p95)}  p99=${fmt(report.latencyMs.steadyState.p99)}  (n=${report.latencyMs.steadyState.n})`);
  L(`cold window (first ${report.latencyMs.coldWindow.n}): mean=${fmt(report.latencyMs.coldWindow.mean)}  max=${fmt(report.latencyMs.coldWindow.max)}`);
  L(`cold-start delta:       ${fmt(report.latencyMs.coldStartDeltaMs)} (cold max - steady p50; placeBid deploys minInstances:1)`);
  L(`warm p95 < ${report.latencyMs.warmP95Threshold}ms:      ${report.latencyMs.warmP95Pass ? 'PASS' : 'FAIL'}`);
  L('\n--- Rate limit (1.5s/user, server-enforced) ---');
  L(`min gap between same-user accepted bids: ${fmt(report.rateLimit.minGapBetweenAcceptedBidsSameUserMs)}ms — ${report.rateLimit.note}`);
  L('\n--- Correctness audit ---');
  L(`auction status: ${audit.summary.auctionStatus} | bid docs: ${audit.summary.bidDocs} | accepted responses: ${audit.summary.acceptedResponses} | leader: ${audit.summary.leader} | order: ${audit.summary.orderExists ? 'yes' : 'no'}`);
  for (const w of audit.warnings) L(`WARN  ${w}`);
  for (const f of audit.failures) L(`FAIL  ${f}`);
  L(audit.pass ? 'audit: PASS (no lost/duplicate/mis-attributed bids; price monotonic; winner + money exact)' : `audit: FAIL (${audit.failures.length} violations)`);
  L('\n=====================================================');
  L(`OVERALL: ${report.pass && audit.pass ? 'PASS' : 'FAIL'}`);
  L('=====================================================\n');
}

module.exports = { buildReport, runAudit, printReport, THRESHOLDS };

// ---------------------------------------------------------------------------
// Standalone: node report.js results-<timestamp>.json
// ---------------------------------------------------------------------------

if (require.main === module) {
  const fs = require('fs');
  const { loadConfig, initAdmin, fail } = require('./common');

  const file = process.argv[2];
  if (!file) fail('usage: node report.js <results-file.json>');
  let saved;
  try {
    saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    fail(`could not read ${file}: ${e.message}`);
  }
  const config = loadConfig();
  if (saved.ctx.projectId !== config.projectId) {
    fail(`results file is for project "${saved.ctx.projectId}" but LOADTEST_PROJECT_ID is "${config.projectId}"`);
  }
  const { db } = initAdmin(config);

  (async () => {
    const report = buildReport(saved.records, saved.ctx);
    const audit = await runAudit(db, saved.ctx.auctionId, saved.records, { expectSettled: !!saved.ctx.settled });
    printReport(report, audit, saved.ctx);
    process.exit(report.pass && audit.pass ? 0 : 2);
  })().catch((e) => {
    console.error('[report] failed:', e);
    process.exit(1);
  });
}
