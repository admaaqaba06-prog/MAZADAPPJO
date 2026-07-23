/**
 * seed.js — seed the THROWAWAY project with test bidders + live auctions so
 * bid-storm.js can drive the real placeBid callable.
 *
 * Creates (idempotently — safe to re-run; re-running RESETS lot state):
 *   - N Auth users with deterministic uids  loadtest-user-0001..N
 *   - users/{uid} docs that PASS every placeBid gate (functions/index.js):
 *       subscriptionStatus: 'active'  + future subscriptionExpiry  (:829-833)
 *       isBlocked: false                                            (:826)
 *       lastBidAt: 0   (1.5s server rate limit baseline,            (:819-824)
 *   - M live auctions  loadtest-lot-01..M  shaped like simulateSpawnAuction
 *     (functions/index.js:3090) with endsAt a few minutes out, integer-JOD
 *     (fils-clean) starting prices, explicit minIncrement, totalBids: 0.
 *   - Clears each lot's bids subcollection, its orders/{lotId} doc and its
 *     chat messages, so a re-seed starts every lot from a clean slate.
 *
 * EVERY doc carries isLoadTest: true for teardown.js.
 *
 * Env knobs (all optional):
 *   LOADTEST_USERS            number of bidders            (default 50)
 *   LOADTEST_AUCTIONS         number of live lots          (default 3)
 *   LOADTEST_AUCTION_MINUTES  endsAt = now + this          (default 10)
 *   LOADTEST_START_PRICE_JOD  integer starting price       (default 100)
 *   LOADTEST_MIN_INCREMENT_JOD integer increment           (default 5)
 *
 * Usage:  node seed.js     (see README.md for the full env checklist)
 */

'use strict';

const {
  LOADTEST_FLAG,
  USER_UID_PREFIX,
  AUCTION_ID_PREFIX,
  loadConfig,
  initAdmin,
  writeManifest,
  deleteRefsInBatches,
} = require('./common');

const N_USERS = parseInt(process.env.LOADTEST_USERS || '50', 10);
const N_AUCTIONS = parseInt(process.env.LOADTEST_AUCTIONS || '3', 10);
const AUCTION_MINUTES = parseInt(process.env.LOADTEST_AUCTION_MINUTES || '10', 10);
const START_PRICE_JOD = parseInt(process.env.LOADTEST_START_PRICE_JOD || '100', 10);
const MIN_INCREMENT_JOD = parseInt(process.env.LOADTEST_MIN_INCREMENT_JOD || '5', 10);

const config = loadConfig();
const { admin, db } = initAdmin(config);

function pad(n, width) {
  return String(n).padStart(width, '0');
}

async function ensureAuthUser(uid, displayName) {
  try {
    await admin.auth().getUser(uid);
    return 'exists';
  } catch (e) {
    if (e && e.code === 'auth/user-not-found') {
      await admin.auth().createUser({ uid, displayName });
      return 'created';
    }
    throw e;
  }
}

async function seedUsers() {
  const uids = [];
  let created = 0;
  const subscriptionExpiry = admin.firestore.Timestamp.fromMillis(
    Date.now() + 30 * 24 * 60 * 60 * 1000 // +30 days — clears the expiry gate
  );

  for (let i = 1; i <= N_USERS; i++) {
    const uid = `${USER_UID_PREFIX}${pad(i, 4)}`;
    const name = `LoadTest Bidder ${pad(i, 4)}`;
    const status = await ensureAuthUser(uid, name);
    if (status === 'created') created++;

    // Full overwrite (set, no merge): re-seeding resets lastBidAt so the rate
    // limiter starts cold for every run.
    await db.collection('users').doc(uid).set({
      id: uid,
      [LOADTEST_FLAG]: true,
      name,
      avatar: '',
      isBlocked: false,
      subscriptionStatus: 'active',
      subscriptionExpiry,
      lastBidAt: 0,
      wonCount: 0,
      role: 'user',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    uids.push(uid);
  }
  console.log(`[seed] users: ${uids.length} total (${created} newly created in Auth)`);
  return uids;
}

/** Remove a lot's bids subcollection, its order doc, and its chat messages. */
async function clearLotState(auctionId) {
  const bidsSnap = await db.collection('auctions').doc(auctionId).collection('bids').get();
  if (!bidsSnap.empty) {
    await deleteRefsInBatches(db, bidsSnap.docs.map((d) => d.ref));
  }
  // settleAuctionTxn creates orders keyed by the auction id (functions/index.js:165)
  await db.collection('orders').doc(auctionId).delete().catch(() => {});
  const chatsSnap = await db.collection('chats').where('auctionId', '==', auctionId).get();
  if (!chatsSnap.empty) {
    await deleteRefsInBatches(db, chatsSnap.docs.map((d) => d.ref));
  }
  return bidsSnap.size;
}

async function seedAuctions() {
  const auctionIds = [];
  const endMs = Date.now() + AUCTION_MINUTES * 60 * 1000;

  for (let i = 1; i <= N_AUCTIONS; i++) {
    const auctionId = `${AUCTION_ID_PREFIX}${pad(i, 2)}`;
    const clearedBids = await clearLotState(auctionId);

    // Integer JOD -> exactly N*1000 fils, so every downstream fils computation
    // (bidPricing, premium, totalDue) stays integer-clean.
    const startingPrice = START_PRICE_JOD + (i - 1); // slight spread across lots

    // Shape mirrors simulateSpawnAuction (functions/index.js:3090-3125) minus
    // the isSimulated flag (we must exercise the REAL placeBid path; the flag
    // here is isLoadTest for teardown only, and placeBid ignores it).
    await db.collection('auctions').doc(auctionId).set({
      id: auctionId,
      [LOADTEST_FLAG]: true,
      title: `LOADTEST — Lot ${pad(i, 2)}`,
      description: 'Load-test auction — removed by scripts/loadtest/teardown.js.',
      category: 'Electronics',
      channel: 'misc',
      status: 'live',
      startingPrice,
      currentPrice: startingPrice,
      currentPriceFils: startingPrice * 1000,
      minIncrement: MIN_INCREMENT_JOD,
      totalBids: 0,
      duration: AUCTION_MINUTES * 60,
      isApproved: true,
      approvalStatus: 'approved',
      ownershipAttested: true,
      attestedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdById: 'loadtest-seller',
      sellerId: 'loadtest-seller',
      sellerName: 'LoadTest Seller',
      thumbnailUrl: '',
      imageUrl: '',
      mediaUrls: [],
      endTime: endMs,
      endsAt: admin.firestore.Timestamp.fromMillis(endMs),
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      approvedBy: 'loadtest-seed',
      openedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(
      `[seed] auction ${auctionId}: live @ ${startingPrice} JOD (+${MIN_INCREMENT_JOD}), ` +
      `ends in ${AUCTION_MINUTES}m` + (clearedBids ? `, cleared ${clearedBids} old bids` : '')
    );
    auctionIds.push(auctionId);
  }
  return { auctionIds, endMs };
}

(async () => {
  console.log(`[seed] project: ${config.projectId} (prod guard passed)`);
  const uids = await seedUsers();
  const { auctionIds, endMs } = await seedAuctions();

  writeManifest({
    projectId: config.projectId,
    seededAt: new Date().toISOString(),
    endsAtMs: endMs,
    uids,
    auctionIds,
    startPriceJod: START_PRICE_JOD,
    minIncrementJod: MIN_INCREMENT_JOD,
  });

  console.log(`[seed] done — manifest written to scripts/loadtest/seed-manifest.json`);
  console.log(`[seed] next: node bid-storm.js  (default: ${Math.min(25, uids.length)} bidders on ${auctionIds[0]})`);
  process.exit(0);
})().catch((e) => {
  console.error('[seed] failed:', e);
  process.exit(1);
});
