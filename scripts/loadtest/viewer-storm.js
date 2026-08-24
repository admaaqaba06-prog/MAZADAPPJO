/**
 * Mazzado — viewer/read-fan-out load test.
 *
 * The bid-storm harness answers "how many people can WRITE (bid) at once" —
 * that's capped hard by Firestore's single-document transaction ceiling
 * (~2/sec/lot, confirmed flat from 10 to 5000 concurrent bidders). This
 * script answers the DIFFERENT question: how many people can WATCH a live
 * lot at once? That's a real-time LISTENER fan-out problem, not a write-
 * contention problem, and it scales completely differently — Firestore
 * listeners are read-only and Google's infra is built to fan a single
 * document's changes out to very large numbers of concurrent subscribers.
 *
 * HONESTY NOTE ON WHAT THIS TEST CAN AND CAN'T PROVE:
 * At high concurrency (thousands+) run from ONE local Node process, this
 * test increasingly measures THIS MACHINE's ability to hold that many
 * concurrent gRPC/WebChannel connections open (sockets, memory, event-loop
 * lag) — not Firestore's actual ceiling, which is a Google-managed service
 * with its own (much higher, separately-documented) scaling limits. Treat
 * results here as "does our app's listener pattern behave correctly and
 * affordably at N concurrent viewers," not "this is Firestore's hard limit."
 * If network_error/timeout counts start dominating, that's a signal about
 * THIS test client, not Mazzado's backend.
 *
 * What it does:
 *   1. Opens N concurrent onSnapshot listeners on ONE seeded auction doc
 *      (simulating N people watching the same live lot).
 *   2. Waits for every listener's first snapshot (subscription-success proof).
 *   3. Mutates the doc once (a real Firestore write, NOT a placeBid — this
 *      test is read/fan-out only, it doesn't touch the bid path or its
 *      money-critical invariants) and measures how long it takes every
 *      listener to observe the change (fan-out latency).
 *   4. Holds listeners open for a short window to catch dropped connections.
 *   5. Reports subscription success rate, fan-out latency percentiles, and
 *      estimated Firestore read costs (doc-reads billed per listener per
 *      change, per Firestore's realtime-listener billing model).
 *
 * Usage:
 *   node viewer-storm.js               # N=1000 viewers, default lot
 *   LOADTEST_VIEWERS=10000 node viewer-storm.js
 */
'use strict';

const {
  loadConfig,
  initAdmin,
  readManifest,
  fail,
} = require('./common');

const N = parseInt(process.env.LOADTEST_VIEWERS || '1000', 10);
const HOLD_MS = parseInt(process.env.LOADTEST_VIEWER_HOLD_MS || '15000', 10);
const AUCTION_ID = process.env.LOADTEST_AUCTION_ID || null;

const config = loadConfig();
const { db } = initAdmin(config);

const manifest = readManifest();
if (!manifest) fail('No seed-manifest.json — run `node seed.js` first.');
if (manifest.projectId !== config.projectId) {
  fail(`seed-manifest.json is for project "${manifest.projectId}" but LOADTEST_PROJECT_ID is "${config.projectId}". Re-run seed.js.`);
}
const lotId = AUCTION_ID || manifest.auctionIds[0];
if (!manifest.auctionIds.includes(lotId)) {
  fail(`Auction "${lotId}" is not in the seed manifest (${manifest.auctionIds.join(', ')}).`);
}

function percentile(values, p) {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

(async () => {
  console.log(`[viewer-storm] project: ${config.projectId} (using Admin SDK — server-side listeners, bypasses client read-rules by design; this measures Firestore's own fan-out, not the rules layer)`);
  console.log(`[viewer-storm] lot: ${lotId}`);
  console.log(`[viewer-storm] opening ${N} concurrent listeners...`);

  const lotRef = db.collection('auctions').doc(lotId);

  let subscribedCount = 0;
  let firstSnapshotErrors = 0;
  const subscribeStartMs = Date.now();
  const firstSnapshotLatencies = [];
  const unsubs = [];

  // One shared "mutation round" we'll trigger after all subscriptions settle,
  // to measure fan-out latency — a plain counter bump, not a bid.
  let mutationSentAtMs = null;
  const fanoutLatencies = [];
  let fanoutSeenCount = 0;
  const expectedMutationValue = { marker: 0 };

  const subscriptionPromises = [];
  for (let i = 0; i < N; i++) {
    let gotFirst = false;
    const p = new Promise((resolve) => {
      const startMs = Date.now();
      const unsub = lotRef.onSnapshot(
        (snap) => {
          if (!gotFirst) {
            gotFirst = true;
            subscribedCount++;
            firstSnapshotLatencies.push(Date.now() - startMs);
            resolve();
          } else if (mutationSentAtMs !== null && snap.exists) {
            const data = snap.data();
            if (data && data.__viewerStormMarker === expectedMutationValue.marker) {
              fanoutSeenCount++;
              fanoutLatencies.push(Date.now() - mutationSentAtMs);
            }
          }
        },
        (err) => {
          if (!gotFirst) {
            firstSnapshotErrors++;
            gotFirst = true;
            resolve();
          }
        }
      );
      unsubs.push(unsub);
    });
    subscriptionPromises.push(p);
  }

  await Promise.all(subscriptionPromises);
  const subscribeElapsedMs = Date.now() - subscribeStartMs;
  console.log(
    `[viewer-storm] subscriptions settled in ${(subscribeElapsedMs / 1000).toFixed(1)}s: ` +
    `${subscribedCount}/${N} succeeded, ${firstSnapshotErrors} failed`
  );

  // Trigger one real fan-out: bump a marker field the listeners are already
  // watching for. This is a plain Firestore write, isolated to a field no
  // app code reads — it cannot affect bidding/settlement.
  expectedMutationValue.marker = Date.now();
  mutationSentAtMs = Date.now();
  await lotRef.update({ __viewerStormMarker: expectedMutationValue.marker });
  console.log('[viewer-storm] mutation sent — measuring fan-out latency...');

  await new Promise((resolve) => setTimeout(resolve, Math.min(HOLD_MS, 10000)));

  console.log(
    `[viewer-storm] fan-out: ${fanoutSeenCount}/${subscribedCount} listeners observed the change ` +
    `within the wait window`
  );

  // Hold the remaining window open to catch listeners that silently drop.
  const remainingHoldMs = HOLD_MS - Math.min(HOLD_MS, 10000);
  if (remainingHoldMs > 0) {
    console.log(`[viewer-storm] holding listeners open for ${(remainingHoldMs / 1000).toFixed(1)}s more...`);
    await new Promise((resolve) => setTimeout(resolve, remainingHoldMs));
  }

  // Clean up the marker field and close all listeners.
  await lotRef.update({ __viewerStormMarker: require('firebase-admin').firestore.FieldValue.delete() });
  unsubs.forEach((u) => u());

  console.log('');
  console.log('================= VIEWER LOAD TEST REPORT =================');
  console.log(`lot ${lotId} — ${N} concurrent viewers requested`);
  console.log('');
  console.log('--- Subscription success ---');
  console.log(`succeeded:              ${subscribedCount}/${N} (${((subscribedCount / N) * 100).toFixed(1)}%)`);
  console.log(`failed immediately:     ${firstSnapshotErrors}`);
  console.log(`time to all-subscribed: ${(subscribeElapsedMs / 1000).toFixed(1)}s`);
  console.log('');
  console.log('--- First-snapshot latency (ms) ---');
  console.log(`p50=${percentile(firstSnapshotLatencies, 50).toFixed(1)}  p95=${percentile(firstSnapshotLatencies, 95).toFixed(1)}  p99=${percentile(firstSnapshotLatencies, 99).toFixed(1)}`);
  console.log('');
  console.log('--- Fan-out latency (ms) — time for a single doc write to reach each listener ---');
  console.log(`observed within window: ${fanoutSeenCount}/${subscribedCount}`);
  if (fanoutLatencies.length > 0) {
    console.log(`p50=${percentile(fanoutLatencies, 50).toFixed(1)}  p95=${percentile(fanoutLatencies, 95).toFixed(1)}  p99=${percentile(fanoutLatencies, 99).toFixed(1)}`);
  }
  console.log('');
  console.log('--- Estimated Firestore cost for this run ---');
  // Firestore bills one document READ per listener per snapshot delivered
  // (the initial snapshot + each subsequent change). Here: 1 initial + 1
  // mutation snapshot per subscribed listener, roughly.
  const estimatedReads = subscribedCount * 2;
  const readCostUsd = (estimatedReads / 100000) * 0.06; // $0.06 / 100k reads, standard Firestore pricing
  console.log(`~${estimatedReads} document reads billed (2 per successful listener: initial + 1 update)`);
  console.log(`~$${readCostUsd.toFixed(4)} for this run's reads alone (excludes the sustained realtime-connection cost, which Firestore does not meter separately from reads)`);
  console.log('');
  console.log(
    subscribedCount === N && firstSnapshotErrors === 0
      ? 'OVERALL: all requested viewers subscribed cleanly.'
      : `OVERALL: ${N - subscribedCount} viewer(s) failed to subscribe — see notes in this file's header on client-side vs Firestore-side limits before concluding this is the app's ceiling.`
  );
  console.log('=============================================================');

  process.exit(0);
})().catch((e) => {
  console.error('[viewer-storm] FATAL:', e);
  process.exit(1);
});
