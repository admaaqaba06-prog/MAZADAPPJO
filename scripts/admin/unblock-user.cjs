#!/usr/bin/env node
/**
 * unblock-user.cjs — clear a payment-default (or manual) block on a buyer, and
 * optionally delete the stale waiting_payment/defaulted orders that caused (or
 * would re-cause) the block.
 *
 * WHY THIS EXISTS: placeBid and the client bid gates key off users/{uid}.isBlocked.
 * The paymentDefaultEnforcer sets isBlocked:true on any buyer with an order still
 * waiting_payment past its paymentDeadlineAt. Unbanning alone won't stick if a
 * waiting_payment order remains — it re-defaults and re-blocks. This tool clears
 * both in one shot.
 *
 * AUTH: needs a mazadjoapp service-account key (Firebase console -> Project
 * settings -> Service accounts -> Generate new private key). NEVER commit it.
 *   export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/key.json
 *
 * USAGE (identifier = phone, email, OR uid — auto-detected):
 *   node scripts/admin/unblock-user.cjs 0790005753            # diagnose (read-only)
 *   node scripts/admin/unblock-user.cjs maher@example.com --fix
 *   node scripts/admin/unblock-user.cjs JLXGOwj1ueSgmgzkeFbudo8jpBR2 --fix
 *   node scripts/admin/unblock-user.cjs 0790005753 --fix --clear-orders
 *                                                            # unblock + delete stale orders
 *
 * Phone may be local (0790005753) or E.164 (+962790005753); Jordan variants are
 * matched automatically. An identifier with `@` is looked up by email (returns
 * EVERY doc on that email — an admin can have both a phone and email/Google doc);
 * a 20+ char alphanumeric string is treated as a Firebase uid. Only orders in
 * waiting_payment/defaulted are ever deleted, and only with --clear-orders;
 * completed/paid orders are never touched.
 */
'use strict';

// firebase-admin isn't a root dependency of this app; the loadtest harness
// vendors a known-good v11. Resolve from there, then fall back to root.
function loadAdmin() {
  const candidates = [
    '../loadtest/node_modules/firebase-admin',
    'firebase-admin',
  ];
  for (const c of candidates) {
    try { return require(c.startsWith('.') ? require('path').join(__dirname, c) : c); }
    catch (e) { if (process.env.DEBUG_ADMIN_LOAD) console.error('  loader miss', c, '::', e.message.split('\n')[0]); }
  }
  console.error('firebase-admin not found. Run `npm i` in scripts/loadtest, or `npm i firebase-admin` at repo root.');
  process.exit(1);
}
const admin = loadAdmin();

const args = process.argv.slice(2);
const phoneArg = args.find((a) => !a.startsWith('--'));
const FIX = args.includes('--fix');
const CLEAR_ORDERS = args.includes('--clear-orders');

if (!phoneArg) {
  console.error('Usage: node scripts/admin/unblock-user.cjs <phone|email|uid> [--fix] [--clear-orders]');
  process.exit(1);
}
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS to a mazadjoapp service-account key path first.');
  process.exit(1);
}

// Build Jordan phone variants from whatever the user typed.
function phoneVariants(input) {
  const digits = input.replace(/[^\d]/g, '');
  const local9 = digits.replace(/^00962/, '').replace(/^962/, '').replace(/^0/, ''); // 790005753
  const set = new Set([
    input,
    `+962${local9}`,
    `962${local9}`,
    `00962${local9}`,
    `0${local9}`,
    local9,
  ]);
  return [...set];
}

admin.initializeApp(); // uses GOOGLE_APPLICATION_CREDENTIALS
const db = admin.firestore();

async function findByPhone(variants) {
  for (const field of ['phoneNumber', 'phone']) {
    for (const v of variants) {
      const snap = await db.collection('users').where(field, '==', v).limit(5).get();
      if (!snap.empty) return { docs: snap.docs, via: `${field}==${v}` };
    }
  }
  return null;
}

async function findByEmail(email) {
  const snap = await db.collection('users').where('email', '==', email).limit(10).get();
  return snap.empty ? null : { docs: snap.docs, via: `email==${email}` };
}

async function findByUid(uid) {
  const doc = await db.collection('users').doc(uid).get();
  return doc.exists ? { docs: [doc], via: `uid==${uid}` } : null;
}

// Detect what the identifier is: an email (@), a Firebase uid (long alnum, no
// digits-only), or a phone. Firebase uids are 28 alnum chars; a phone is all
// digits/+, so the {20,} alnum test can't collide with a phone.
async function findUser(identifier) {
  if (identifier.includes('@')) return findByEmail(identifier.trim().toLowerCase());
  if (/^[A-Za-z0-9]{20,}$/.test(identifier)) return findByUid(identifier);
  return findByPhone(phoneVariants(identifier));
}

(async () => {
  console.log(`[unblock] project via credentials; identifier: ${phoneArg}`);
  const found = await findUser(phoneArg);
  if (!found) {
    console.error(`[unblock] no users doc matched "${phoneArg}" (tried email/uid/phone). Nothing changed.`);
    process.exit(2);
  }
  console.log(`[unblock] matched via ${found.via}: ${found.docs.length} doc(s)`);

  for (const d of found.docs) {
    const u = d.data();
    console.log(`\nUSER ${d.id}  (${u.name || '—'})`);
    console.log(`  isBlocked=${u.isBlocked}  blockedReason=${u.blockedReason}  role=${u.role}  isAdmin=${u.isAdmin}`);

    const ordersSnap = await db.collection('orders').where('buyerId', '==', d.id).get();
    const stale = [];
    console.log(`  orders as buyer: ${ordersSnap.size}`);
    ordersSnap.forEach((o) => {
      const od = o.data();
      const isStale = od.status === 'waiting_payment' || od.status === 'defaulted';
      const deadline = od.paymentDeadlineAt && od.paymentDeadlineAt.toDate && od.paymentDeadlineAt.toDate().toISOString();
      console.log(`    ${o.id}: status=${od.status} paymentStatus=${od.paymentStatus} deadline=${deadline} title="${od.auctionTitle || ''}"${isStale ? '  <-- would block' : ''}`);
      if (isStale) stale.push(o.ref);
    });

    if (!FIX) continue;

    await db.collection('users').doc(d.id).set(
      { isBlocked: false, blockedReason: admin.firestore.FieldValue.delete() },
      { merge: true },
    );
    console.log(`  FIX: isBlocked=false, blockedReason removed`);

    if (CLEAR_ORDERS) {
      for (const ref of stale) { await ref.delete(); console.log(`  FIX: deleted stale order ${ref.id}`); }
      if (!stale.length) console.log('  FIX: no stale orders to delete');
    } else if (stale.length) {
      console.log(`  NOTE: ${stale.length} stale order(s) remain — a waiting_payment one will re-block. Re-run with --clear-orders to delete them.`);
    }
  }

  console.log(FIX ? '\n[unblock] done (changes applied).' : '\n[unblock] read-only. Add --fix (and --clear-orders) to apply.');
  process.exit(0);
})().catch((e) => { console.error('[unblock] FATAL', e); process.exit(1); });
