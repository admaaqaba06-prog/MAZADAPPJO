/**
 * Backfill `isSeller` for anyone who already holds a sold order.
 *
 * WHY THIS IS NEEDED. Until the activateSeller callable landed, nothing in the
 * app could grant `isSeller`: WalletView's handleActivateSeller was never
 * called AND wrote the flag client-side, which firestore.rules denylists for
 * self-writes. So every self-serve seller stayed unflagged — and AppContext
 * gated the seller-orders / seller-escrows / seller-disputes subscriptions on
 * that flag, which meant those people could not see their own sales at all.
 *
 * Runs the SAME functions/sellerActivation.js core the callable uses, so a
 * backfilled seller is byte-identical to a self-activated one and the two can
 * never drift.
 *
 * READ-ONLY BY DEFAULT. Pass --apply to write.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=<key> node scripts/admin/backfill-sellers.cjs [--apply]
 */
const path = require('path');
const admin = require(path.join(__dirname, '../loadtest/node_modules/firebase-admin'));
const { activateSeller } = require(path.join(__dirname, '../../functions/sellerActivation.js'));

const APPLY = process.argv.includes('--apply');

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'mazadjoapp' });
const db = admin.firestore();

(async () => {
  const orders = await db.collection('orders').get();
  const sellerIds = new Set();
  orders.forEach((d) => {
    const s = d.data().sellerId;
    if (s) sellerIds.add(s);
  });

  const needing = [];
  for (const uid of sellerIds) {
    const snap = await db.collection('users').doc(uid).get();
    if (!snap.exists) {
      needing.push({ uid, name: '(no user doc)', skip: 'no user doc' });
      continue;
    }
    const u = snap.data();
    const flagged = u.isSeller === true || u.role === 'seller';
    const isAdmin = u.isAdmin === true || u.role === 'admin';
    if (flagged) continue;
    // Admins are deliberately NOT backfilled. They are unaffected — AppContext
    // gives an admin the whole orders collection, not the per-seller
    // subscription — so flagging them fixes nothing, and activateSeller would
    // mint a PUBLIC sellerProfiles store page (that collection is
    // `allow read: if true`) for an account that never had one.
    const skip = isAdmin ? 'admin — unaffected, sees all orders'
      : (u.isBlocked === true ? 'blocked' : null);
    needing.push({
      uid,
      name: u.name || '(no name)',
      isAdmin,
      blocked: u.isBlocked === true,
      skip,
    });
  }

  console.log(`sellers on orders: ${sellerIds.size} | needing a flag: ${needing.length}`);
  needing.forEach((n) => console.log(' ', JSON.stringify(n)));

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to backfill.');
    process.exit(0);
  }

  const deps = { db, Timestamp: admin.firestore.Timestamp, now: () => Date.now(), lang: 'ar' };
  let ok = 0, skipped = 0, failed = 0;
  for (const n of needing) {
    if (n.skip) { console.log(`SKIP  ${n.uid} (${n.skip})`); skipped++; continue; }
    try {
      const res = await activateSeller(deps, { uid: n.uid });
      console.log(`OK    ${n.uid} ${n.name} -> ${JSON.stringify(res)}`);
      ok++;
    } catch (e) {
      console.log(`FAIL  ${n.uid} ${n.name} -> ${e.code || ''} ${e.message}`);
      failed++;
    }
  }
  console.log(`\nactivated: ${ok} | skipped: ${skipped} | failed: ${failed}`);

  // Verify: re-read and confirm every non-skipped uid is now flagged.
  let verified = 0;
  for (const n of needing) {
    if (n.skip) continue;
    const u = (await db.collection('users').doc(n.uid).get()).data() || {};
    if (u.isSeller === true) verified++;
    else console.log(`UNVERIFIED ${n.uid} — isSeller is still ${u.isSeller}`);
  }
  console.log(`verified flagged: ${verified}/${ok}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
