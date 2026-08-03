#!/usr/bin/env node
/**
 * backfill-categories.cjs — move mis-bucketed lots onto the unified taxonomy.
 *
 * WHY THIS EXISTS: until the taxonomy was unified (src/utils/categories.ts),
 * three separate defects put lots in the wrong bucket:
 *
 *  1. The admin drop builder and concierge form derived category from the three
 *     WhatsApp channels, so every lot that was not a phone or a car was stored
 *     as 'Fashion' — the catch-all. A television lived there.
 *  2. The seller wizard stored 'Luxury' for Watches, a value no Discover chip
 *     and no search facet matched. Those lots are invisible under every
 *     category filter except "All".
 *  3. The same wizard offered "Phones" and "Electronics" as two labels writing
 *     the SAME 'Electronics' value, so seller-listed phones are indistinguishable
 *     from laptops and televisions in the data.
 *
 * The app handles all three at READ time via Category.legacyMatch, so nothing is
 * broken without this script. This moves the underlying data so the buckets are
 * honest.
 *
 * AUTH: needs a mazadjoapp service-account key (Firebase console -> Project
 * settings -> Service accounts -> Generate new private key). NEVER commit it.
 *   export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/key.json
 *
 * USAGE — two phases, report first, ALWAYS:
 *   node scripts/admin/backfill-categories.cjs            # report only, writes nothing
 *   node scripts/admin/backfill-categories.cjs --apply    # writes
 *
 * A title the classifier does not recognise KEEPS ITS CURRENT CATEGORY. A wrong
 * automatic guess on a live auction is worse than the mis-bucketing it would
 * replace.
 *
 * 'Luxury' -> 'Watches' is a rename rather than a guess and applies to every
 * such lot regardless of title.
 *
 * Idempotent: the classifier is a pure function of the title, so re-running
 * --apply over already-corrected lots is a no-op.
 */
'use strict';

// firebase-admin isn't a root dependency of this app; the loadtest harness
// vendors a known-good v11. Resolve from there, then fall back to root.
function loadAdmin() {
  const candidates = ['../loadtest/node_modules/firebase-admin', 'firebase-admin'];
  for (const c of candidates) {
    try {
      return require(c.startsWith('.') ? require('path').join(__dirname, c) : c);
    } catch (e) {
      if (process.env.DEBUG_ADMIN_LOAD) console.error('  loader miss', c, '::', e.message.split('\n')[0]);
    }
  }
  console.error('firebase-admin not found. Run `npm i` in scripts/loadtest, or `npm i firebase-admin` at repo root.');
  process.exit(1);
}

const admin = loadAdmin();
const { classifyCategory } = require('./classifyCategory.cjs');

const APPLY = process.argv.includes('--apply');

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS to a mazadjoapp service-account key path first.');
  process.exit(1);
}

/**
 * Categories worth re-examining, and why:
 *  - Fashion: the old catch-all, so it holds a mixed bag of everything.
 *  - Luxury:  a dead value that matches no chip.
 *  - Electronics: held both real electronics AND every seller-listed phone,
 *    because the wizard's "Phones" option wrote 'Electronics'. Only titles the
 *    classifier reads as phones move; real electronics stay put.
 */
const SWEEP = ['Fashion', 'Luxury', 'Electronics'];

function proposedFor(data) {
  const from = data.category;
  // A rename, not a guess: 'Luxury' matches no chip, so every one of these is
  // currently unreachable by category regardless of what its title says.
  if (from === 'Luxury') return 'Watches';

  const guess = classifyCategory(data.title);
  if (!guess) return null;

  // Only move an Electronics lot when the title clearly reads as a phone;
  // a television correctly stored as Electronics must not be churned.
  if (from === 'Electronics') return guess === 'Phones' ? 'Phones' : null;

  return guess;
}

(async () => {
  admin.initializeApp({ credential: admin.credential.applicationDefault() });
  const db = admin.firestore();

  const snap = await db.collection('auctions').where('category', 'in', SWEEP).get();

  const changes = [];
  const unrecognised = [];

  for (const doc of snap.docs) {
    const d = doc.data() || {};
    const from = d.category;
    const to = proposedFor(d);
    if (!to || to === from) {
      if (from === 'Fashion') unrecognised.push({ id: doc.id, title: d.title, status: d.status });
      continue;
    }
    changes.push({
      id: doc.id,
      title: String(d.title || '').slice(0, 48),
      from,
      to,
      bids: d.totalBids || 0,
      status: d.status,
    });
  }

  console.log(`\nScanned ${snap.size} lots in ${SWEEP.join(' / ')}.`);
  console.log(`${changes.length} would change:\n`);
  if (changes.length) console.table(changes);

  if (unrecognised.length) {
    console.log(`\n${unrecognised.length} lot(s) in the catch-all whose title the classifier does not recognise.`);
    console.log('These are LEFT ALONE — they need a human to categorise:\n');
    console.table(unrecognised.slice(0, 50));
    if (unrecognised.length > 50) console.log(`  …and ${unrecognised.length - 50} more.`);
  }

  const withBids = changes.filter((c) => c.bids > 0);
  if (withBids.length) {
    console.log(`\n⚠  ${withBids.length} of the proposed changes have live bids:`);
    console.log(`   ${withBids.map((c) => c.id).join(', ')}`);
    console.log('   A category change does not affect bidding, but review them before applying.\n');
  }

  if (!APPLY) {
    console.log('\nReport only — nothing was written. Re-run with --apply to write.\n');
    process.exit(0);
  }

  let batch = db.batch();
  let pending = 0;
  for (const c of changes) {
    batch.update(db.collection('auctions').doc(c.id), { category: c.to });
    pending++;
    if (pending === 400) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }
  if (pending) await batch.commit();

  console.log(`\n✅ Updated ${changes.length} lot(s).\n`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
