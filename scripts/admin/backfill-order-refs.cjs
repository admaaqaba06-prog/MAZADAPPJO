#!/usr/bin/env node
/**
 * backfill-order-refs.cjs — assign a unique human-readable `MZ-XXXXX` reference
 * to existing `orders` docs that lack a valid one, mirroring the server
 * `functions/assignOrderRef.js` reservation logic (reserve `orderRefs/{code}` +
 * stamp `orders/{id}.orderRef`, read-before-write in a transaction, retry on
 * collision, idempotent).
 *
 * DRY-RUN by default: it NEVER writes anything — and never reserves a code —
 * unless `--commit` is explicitly passed. Do NOT run against prod without care.
 *
 * AUTH (mirrors scripts/admin/audit-test-data.cjs exactly): a mazadjoapp
 * service-account key. NEVER commit it.
 *   export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/mazadjoapp-key.json
 *
 * USAGE:
 *   node scripts/admin/backfill-order-refs.cjs            # DRY RUN — report only
 *   node scripts/admin/backfill-order-refs.cjs --commit   # assign + stamp refs
 */
'use strict';

// firebase-admin isn't a root dependency of this app; the loadtest harness
// vendors a known-good copy. Resolve from there, then fall back to root.
// (Identical loader to scripts/admin/audit-test-data.cjs.)
function loadAdmin() {
  const candidates = [
    '../loadtest/node_modules/firebase-admin',
    'firebase-admin',
  ];
  for (const c of candidates) {
    try { return require(c.startsWith('.') ? require('path').join(__dirname, c) : c); }
    catch (e) { if (process.env.DEBUG_ADMIN_LOAD) console.error('  loader miss', c, '::', e.message.split('\n')[0]); }
  }
  console.error('firebase-admin not found. Run `npm ci` in scripts/loadtest, or `npm i firebase-admin` at repo root.');
  process.exit(1);
}
const admin = loadAdmin();

// The committed server twins — reuse them so this script and the live callable
// stay in lockstep on alphabet, format, and validation.
const { generateOrderRef, isValidOrderRef } = require('../../functions/orderRef');

const args = process.argv.slice(2);
const COMMIT = args.includes('--commit');
const MAX_TRIES = 8;          // reservation retries per candidate
const SAMPLE_LIMIT = 10;      // proposed pairs printed in a dry run

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS to a mazadjoapp service-account key path first.');
  process.exit(1);
}

admin.initializeApp(); // uses GOOGLE_APPLICATION_CREDENTIALS
// firebase-admin ≤12 exposes the namespaced admin.firestore(); ≥13 (incl. v14)
// moved it to the modular 'firebase-admin/firestore' entry point.
const modularFs = typeof admin.firestore === 'function' ? null : require('firebase-admin/firestore');
const db = modularFs ? modularFs.getFirestore() : admin.firestore();
// Match the sibling's namespaced/modular split for the Timestamp constructor.
const Timestamp = modularFs ? modularFs.Timestamp : admin.firestore.Timestamp;

// Loop-local sentinel: a reserved-code collision inside the transaction. Thrown
// to abort THIS transaction, caught by the retry loop to draw the next code.
// Distinct from a real error so we never swallow genuine failures. (Mirrors
// functions/assignOrderRef.js.)
const COLLISION = Symbol('orderRef-collision');

// Reserve a unique code for `orderId` and stamp the order. Mirrors
// functions/assignOrderRef.js: read-before-write, retry on collision.
async function reserveOrderRef(orderId) {
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const code = generateOrderRef();
    try {
      await db.runTransaction(async (txn) => {
        // Reads before writes: check the reservation slot first.
        const refDoc = db.collection('orderRefs').doc(code);
        const refSnap = await txn.get(refDoc);
        if (refSnap.exists) {
          throw COLLISION; // code already taken — retry with a new one
        }
        txn.set(refDoc, {
          orderId,
          createdAt: Timestamp.now(),
        });
        txn.set(
          db.collection('orders').doc(orderId),
          {
            orderRef: code,
            updatedAt: Timestamp.now(),
          },
          { merge: true }
        );
      });
      return code;
    } catch (e) {
      if (e === COLLISION) continue;
      throw e; // genuine transaction failure — propagate
    }
  }
  throw new Error(`could not allocate a unique order ref for ${orderId} after ${MAX_TRIES} tries.`);
}

(async () => {
  if (COMMIT) {
    console.log('!!! --commit passed: will RESERVE + STAMP order refs in ~3s. Ctrl-C to abort. !!!');
    const until = Date.now() + 3000;
    while (Date.now() < until) { /* busy-wait 3s, no interactive prompt */ }
  } else {
    console.log('=== DRY RUN — no data will be written. Pass --commit to assign refs. ===');
  }

  const snap = await db.collection('orders').get();
  const total = snap.size;

  // A candidate is any order whose orderRef is missing or fails validation.
  const candidates = [];
  let alreadyHaveRef = 0;
  snap.forEach((d) => {
    const ref = (d.data() || {}).orderRef;
    if (isValidOrderRef(ref)) alreadyHaveRef++;
    else candidates.push(d.id);
  });

  console.log(`\nScanned ${total} order(s). ${alreadyHaveRef} already have a valid ref. ${candidates.length} candidate(s) need one.`);

  if (!COMMIT) {
    // Sample proposed codes WITHOUT writing or reserving them.
    const sample = candidates.slice(0, SAMPLE_LIMIT);
    console.log(`\nSample of up to ${SAMPLE_LIMIT} proposed assignments (NOT written, NOT reserved):`);
    for (const id of sample) {
      console.log(`    ${id} -> ${generateOrderRef()}`);
    }
    if (candidates.length > sample.length) {
      console.log(`    ...and ${candidates.length - sample.length} more candidate(s).`);
    }
    console.log(`\nDRY RUN complete. Nothing written. Re-run with --commit to assign ${candidates.length} ref(s).`);
    process.exit(0);
  }

  // --commit: reserve + stamp each candidate. One failure must not abort the run.
  let assigned = 0;
  let failed = 0;
  for (const id of candidates) {
    try {
      const code = await reserveOrderRef(id);
      console.log(`    ${id} -> ${code}`);
      assigned++;
    } catch (e) {
      console.error(`    ${id} FAILED: ${e.message}`);
      failed++;
    }
  }

  console.log(`\nCOMMIT complete. Assigned ${assigned} ref(s), ${failed} failure(s), out of ${candidates.length} candidate(s).`);
  process.exit(0);
})().catch((e) => { console.error('[backfill-order-refs] FATAL', e); process.exit(1); });
