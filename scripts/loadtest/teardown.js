/**
 * teardown.js — delete EVERYTHING the load-test harness created on the
 * throwaway project. Finds data by the isLoadTest flag (plus the children of
 * flagged docs that can't carry the flag themselves):
 *
 *   - auctions where isLoadTest == true
 *       + each auction's bids subcollection (placeBid writes)
 *       + orders/{auctionId}                (settleAuctionTxn keys orders by auction id)
 *       + chats where auctionId == the lot  (placeBid's post-commit bid-indicator chat)
 *   - users docs where isLoadTest == true
 *   - Auth users whose uid starts with 'loadtest-'
 *   - local seed-manifest.json
 *
 * Idempotent — safe to run twice. Same prod guard as every other script.
 *
 * Usage:  node teardown.js
 */

'use strict';

const fs = require('fs');
const {
  LOADTEST_FLAG,
  USER_UID_PREFIX,
  MANIFEST_PATH,
  loadConfig,
  initAdmin,
  deleteRefsInBatches,
} = require('./common');

const config = loadConfig();
const { admin, db } = initAdmin(config);

async function deleteFlaggedAuctions() {
  const snap = await db.collection('auctions').where(LOADTEST_FLAG, '==', true).get();
  let bids = 0;
  let chats = 0;
  let orders = 0;
  for (const doc of snap.docs) {
    const bidsSnap = await doc.ref.collection('bids').get();
    bids += await deleteRefsInBatches(db, bidsSnap.docs.map((d) => d.ref));

    const chatsSnap = await db.collection('chats').where('auctionId', '==', doc.id).get();
    chats += await deleteRefsInBatches(db, chatsSnap.docs.map((d) => d.ref));

    const orderRef = db.collection('orders').doc(doc.id);
    if ((await orderRef.get()).exists) {
      await orderRef.delete();
      orders++;
    }
  }
  await deleteRefsInBatches(db, snap.docs.map((d) => d.ref));
  console.log(`[teardown] auctions: ${snap.size} (bids: ${bids}, chats: ${chats}, orders: ${orders})`);
}

async function deleteFlaggedUserDocs() {
  const snap = await db.collection('users').where(LOADTEST_FLAG, '==', true).get();
  await deleteRefsInBatches(db, snap.docs.map((d) => d.ref));
  console.log(`[teardown] user docs: ${snap.size}`);
}

async function deleteAuthUsers() {
  let deleted = 0;
  let pageToken;
  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    const targets = page.users
      .filter((u) => u.uid.startsWith(USER_UID_PREFIX))
      .map((u) => u.uid);
    if (targets.length) {
      const res = await admin.auth().deleteUsers(targets);
      deleted += res.successCount;
      if (res.failureCount) {
        console.warn(`[teardown] ${res.failureCount} auth deletions failed (re-run teardown):`, res.errors.slice(0, 3));
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);
  console.log(`[teardown] auth users: ${deleted}`);
}

(async () => {
  console.log(`[teardown] project: ${config.projectId} (prod guard passed)`);
  await deleteFlaggedAuctions();
  await deleteFlaggedUserDocs();
  await deleteAuthUsers();
  if (fs.existsSync(MANIFEST_PATH)) {
    fs.unlinkSync(MANIFEST_PATH);
    console.log('[teardown] removed seed-manifest.json');
  }
  console.log('[teardown] done.');
  process.exit(0);
})().catch((e) => {
  console.error('[teardown] failed:', e);
  process.exit(1);
});
