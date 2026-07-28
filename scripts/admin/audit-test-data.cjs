#!/usr/bin/env node
/**
 * audit-test-data.cjs — FIND and REPORT test-data noise in production Firestore
 * so the owner can review before any cleanup. DRY-RUN by default: it NEVER
 * deletes anything unless `--commit` is explicitly passed, and even then it only
 * deletes the two clearly-safe categories (fake reviews + empty notifications).
 * Users, orders, and disputes are ALWAYS report-only — never deleted.
 *
 * WHY THIS EXISTS: the marketplace accumulated test/seed records (simulator
 * runs, load-test users, hand-seeded reviews, empty-shell notifications). This
 * surfaces them in one labelled report so a human can eyeball the IDs before
 * deciding what to purge.
 *
 * AUTH (mirrors scripts/admin/unblock-user.cjs exactly): a mazadjoapp
 * service-account key. NEVER commit it.
 *   export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/mazadjoapp-key.json
 *
 * USAGE:
 *   node scripts/admin/audit-test-data.cjs            # DRY RUN — report only
 *   node scripts/admin/audit-test-data.cjs --commit   # delete flagged reviews +
 *                                                      # empty notifications ONLY
 *
 * WHAT IT DETECTS (each section is independent + try/catch-guarded so one
 * failing collection can't abort the whole report):
 *   1. reviews      — no resolvable order OR an explicit seed/test marker.
 *   2. notifications — title AND body empty across all language fields.
 *   3. users        — gibberish/test display names or a test/simulated flag.
 *   4. orders       — isSimulated === true (kept intentionally; report only).
 *   5. disputes     — empty/typo reason or missing photos (report only).
 *
 * Only sections 1 and 2 are ever deleted (with --commit), via batched writes
 * (<=450 per batch). Everything else is human-judgment territory.
 */
'use strict';

// firebase-admin isn't a root dependency of this app; the loadtest harness
// vendors a known-good v11. Resolve from there, then fall back to root.
// (Identical loader to scripts/admin/unblock-user.cjs.)
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

const args = process.argv.slice(2);
const COMMIT = args.includes('--commit');
const MAX_PRINT = 200;      // cap printed IDs per section
const BATCH_LIMIT = 450;    // Firestore hard cap is 500; stay under it

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS to a mazadjoapp service-account key path first.');
  process.exit(1);
}

admin.initializeApp(); // uses GOOGLE_APPLICATION_CREDENTIALS
// firebase-admin ≤12 exposes the namespaced admin.firestore(); ≥13 (incl. v14)
// moved it to the modular 'firebase-admin/firestore' entry point.
const db = typeof admin.firestore === 'function'
  ? admin.firestore()
  : require('firebase-admin/firestore').getFirestore();

// ─────────────────────────── helpers ───────────────────────────

// App's emptiness notion (src/utils/notificationContent.ts firstNonEmpty):
// a value counts as present only if it's a non-whitespace string.
function firstNonEmpty(...values) {
  for (const v of values) {
    if (typeof v === 'string' && v.trim() !== '') return v;
  }
  return '';
}

// Print a section's IDs, capped, with an "...and N more" tail.
function printIds(ids) {
  const shown = ids.slice(0, MAX_PRINT);
  for (const id of shown) console.log(`    - ${id}`);
  if (ids.length > shown.length) console.log(`    ...and ${ids.length - shown.length} more`);
}

// Chunk an array into fixed-size slices.
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Conservative gibberish/test-name test. Returns a short reason string if the
// name LOOKS like a throwaway test account, else null. Deliberately narrow —
// we would rather miss a real test account than flag a real user.
function gibberishReason(rawName) {
  if (typeof rawName !== 'string') return null;
  const name = rawName.trim();
  if (name === '') return null;
  const lower = name.toLowerCase();

  // 1. Exact well-known placeholder tokens.
  const KNOWN = new Set([
    'test', 'testing', 'test user', 'testuser', 'test test',
    'asdf', 'asdfasdf', 'asdfg', 'qwerty', 'qwe', 'qweqwe',
    'foo', 'bar', 'foobar', 'baz', 'abc', 'abcabc', 'xyz',
    'aaa', 'aaaa', 'aaaaa', 'xxx', 'xxxx', 'zzz', 'name', 'user',
    'delete', 'deleteme', 'dummy', 'sample', 'demo', 'lorem',
  ]);
  if (KNOWN.has(lower)) return `known placeholder ("${name}")`;

  // 2. Single character repeated (aaaa, 111111, ....).
  if (/^(.)\1{2,}$/.test(name)) return `repeated single char ("${name}")`;

  // 3. A single "word" of length >= 5 that is all Latin letters with NO vowel —
  //    keyboard-mash consonant strings like "asdfg", "hjklm", "qwrtp". Only
  //    applies to pure-ASCII-letter single tokens so Arabic names never match.
  if (/^[A-Za-z]{5,}$/.test(name) && !/[aeiouy]/i.test(name)) {
    return `no-vowel consonant string ("${name}")`;
  }

  return null;
}

// Delete a list of DocumentReferences in batches, logging each ID.
async function batchDelete(refs, label) {
  let deleted = 0;
  for (const group of chunk(refs, BATCH_LIMIT)) {
    const batch = db.batch();
    for (const ref of group) batch.delete(ref);
    await batch.commit();
    for (const ref of group) { console.log(`    deleted ${label} ${ref.id}`); deleted++; }
  }
  return deleted;
}

// ─────────────────────────── detectors ───────────────────────────
// Each returns { refs, ids } (refs only meaningful for deletable sections).

// 1. Fake/seeded reviews. A legitimate review is written ONLY by the rateBuyer/
//    rateAuction callables and always carries an `orderId` that resolves to a
//    real order doc (deterministic id `${orderId}_seller_rates_buyer` etc.).
//    We flag a review when: it has an explicit seed/test marker, OR it has no
//    orderId, OR its orderId does not resolve to an existing order, OR it points
//    at a simulated order. We resolve orderIds via getAll (chunked).
async function detectFakeReviews() {
  const snap = await db.collection('reviews').get();
  console.log(`  scanned ${snap.size} review doc(s)`);

  // Explicit boolean markers a seed/test script might stamp.
  const MARKER_FIELDS = ['seeded', 'isSeed', 'seed', 'isTest', 'test', 'isSimulated', '__seed', 'fake', 'isFake'];

  // Collect distinct orderIds to resolve in bulk.
  const orderIds = new Set();
  snap.forEach((d) => { const oid = d.data().orderId; if (typeof oid === 'string' && oid) orderIds.add(oid); });

  // Resolve which orderIds exist + which are simulated (getAll, chunked at 300).
  const existingOrders = new Set();
  const simulatedOrders = new Set();
  const orderIdList = [...orderIds];
  for (const group of chunk(orderIdList, 300)) {
    const refs = group.map((id) => db.collection('orders').doc(id));
    const docs = await db.getAll(...refs);
    docs.forEach((doc) => {
      if (doc.exists) {
        existingOrders.add(doc.id);
        if (doc.data().isSimulated === true) simulatedOrders.add(doc.id);
      }
    });
  }

  const refs = [];
  const ids = [];
  snap.forEach((d) => {
    const r = d.data();
    let reason = null;

    const marker = MARKER_FIELDS.find((f) => r[f] === true || r[f] === 'true');
    if (marker) reason = `marker ${marker}`;
    else if (typeof r.orderId !== 'string' || r.orderId === '') reason = 'no orderId';
    else if (!existingOrders.has(r.orderId)) reason = `orderId ${r.orderId} does not resolve`;
    else if (simulatedOrders.has(r.orderId)) reason = `on simulated order ${r.orderId}`;

    if (reason) { refs.push(d.ref); ids.push(`${d.id}  [${reason}]`); }
  });

  return { refs, ids, refIds: refs.map((r) => r.id) };
}

// 2. Empty-content notifications: title AND body empty across all language
//    fields (mirrors resolveNotificationContent). We also check legacy body*
//    fields defensively even though the live schema uses description*.
async function detectEmptyNotifications() {
  const snap = await db.collection('notifications').get();
  console.log(`  scanned ${snap.size} notification doc(s)`);

  const refs = [];
  const ids = [];
  snap.forEach((d) => {
    const n = d.data();
    const title = firstNonEmpty(n.titleAr, n.titleEn, n.title);
    const body = firstNonEmpty(
      n.descriptionAr, n.descriptionEn, n.description,
      n.bodyAr, n.bodyEn, n.body,
    );
    if (title === '' && body === '') { refs.push(d.ref); ids.push(d.id); }
  });

  return { refs, ids, refIds: refs.map((r) => r.id) };
}

// 3. Test/gibberish users. CONSERVATIVE: explicit test/sim flags, or a name
//    that clearly reads as a placeholder/keyboard-mash. Report only.
async function detectTestUsers() {
  const snap = await db.collection('users').get();
  console.log(`  scanned ${snap.size} user doc(s)`);

  const FLAG_FIELDS = ['isTest', 'isSimulated', 'isLoadTest', 'isSeed', 'seeded'];
  const ids = [];
  snap.forEach((d) => {
    const u = d.data();
    const flag = FLAG_FIELDS.find((f) => u[f] === true);
    const nameReason = gibberishReason(u.name);
    let reason = null;
    if (flag) reason = `flag ${flag}=true`;
    else if (nameReason) reason = nameReason;
    if (reason) ids.push(`${d.id}  (name="${u.name || ''}", ${reason})`);
  });

  return { ids };
}

// 4. Simulated/test orders: isSimulated === true. Report only (may be kept).
async function detectSimulatedOrders() {
  const snap = await db.collection('orders').where('isSimulated', '==', true).get();
  console.log(`  scanned ${snap.size} order doc(s) with isSimulated==true`);
  const ids = [];
  snap.forEach((d) => {
    const o = d.data();
    ids.push(`${d.id}  (status=${o.status || '?'}, title="${o.auctionTitle || ''}")`);
  });
  return { ids };
}

// 5. Known-bad disputes: empty/whitespace reason/description or missing photos.
//    Report only — disputes always need human judgment.
async function detectBadDisputes() {
  const snap = await db.collection('disputes').get();
  console.log(`  scanned ${snap.size} dispute doc(s)`);
  const ids = [];
  snap.forEach((d) => {
    const disp = d.data();
    const reasonText = firstNonEmpty(disp.description, disp.reason);
    const photos = Array.isArray(disp.photos) ? disp.photos : [];
    const videos = Array.isArray(disp.videos) ? disp.videos : [];
    const problems = [];
    if (reasonText.trim().length < 3) problems.push('empty/too-short reason');
    if (photos.length === 0 && videos.length === 0) problems.push('no photos or videos');
    if (problems.length) ids.push(`${d.id}  (order=${disp.orderId || '?'}, ${problems.join('; ')})`);
  });
  return { ids };
}

// ─────────────────────────── runner ───────────────────────────

async function runSection(title, fn) {
  console.log(`\n=== ${title} ===`);
  try {
    return await fn();
  } catch (e) {
    console.error(`  [SKIPPED] section failed: ${e.message}`);
    return null;
  }
}

(async () => {
  if (COMMIT) {
    console.log('!!! --commit passed: will DELETE flagged reviews + empty notifications in ~3s. Ctrl-C to abort. !!!');
    const until = Date.now() + 3000;
    while (Date.now() < until) { /* busy-wait 3s, no interactive prompt (runs non-interactively) */ }
  } else {
    console.log('=== DRY RUN — no data will be deleted. Pass --commit to delete flagged reviews/notifications only. ===');
  }

  const reviews = await runSection(
    '1. FAKE / SEEDED REVIEWS (deletable — no resolvable order or seed marker)',
    detectFakeReviews);
  if (reviews) { console.log(`  FLAGGED: ${reviews.ids.length}`); printIds(reviews.ids); }

  const notifs = await runSection(
    '2. EMPTY-CONTENT NOTIFICATIONS (deletable — title AND body empty)',
    detectEmptyNotifications);
  if (notifs) { console.log(`  FLAGGED: ${notifs.ids.length}`); printIds(notifs.ids); }

  const users = await runSection(
    '3. TEST / GIBBERISH USERS (report only — human review)',
    detectTestUsers);
  if (users) { console.log(`  FLAGGED: ${users.ids.length}`); printIds(users.ids); }

  const orders = await runSection(
    '4. SIMULATED ORDERS isSimulated==true (report only — may be intentional)',
    detectSimulatedOrders);
  if (orders) { console.log(`  FLAGGED: ${orders.ids.length}`); printIds(orders.ids); }

  const disputes = await runSection(
    '5. KNOWN-BAD DISPUTES (report only — human review)',
    detectBadDisputes);
  if (disputes) { console.log(`  FLAGGED: ${disputes.ids.length}`); printIds(disputes.ids); }

  // ── deletion (only sections 1 + 2, only with --commit) ──
  console.log('\n=== SUMMARY ===');
  if (!COMMIT) {
    const rc = reviews ? reviews.ids.length : 'n/a';
    const nc = notifs ? notifs.ids.length : 'n/a';
    console.log(`DRY RUN complete. Nothing deleted.`);
    console.log(`  Would delete with --commit: ${rc} review(s) + ${nc} notification(s).`);
    console.log(`  Never deleted by this script: users, orders, disputes (report only).`);
    process.exit(0);
  }

  let deletedReviews = 0;
  let deletedNotifs = 0;
  if (reviews && reviews.refs.length) {
    console.log(`\n  Deleting ${reviews.refs.length} flagged review(s)...`);
    try { deletedReviews = await batchDelete(reviews.refs, 'review'); }
    catch (e) { console.error(`  review deletion error: ${e.message}`); }
  }
  if (notifs && notifs.refs.length) {
    console.log(`\n  Deleting ${notifs.refs.length} empty notification(s)...`);
    try { deletedNotifs = await batchDelete(notifs.refs, 'notification'); }
    catch (e) { console.error(`  notification deletion error: ${e.message}`); }
  }

  console.log(`\nCOMMIT complete.`);
  console.log(`  Deleted ${deletedReviews} review(s) + ${deletedNotifs} notification(s).`);
  console.log(`  Users, orders, disputes were NOT touched (report only).`);
  process.exit(0);
})().catch((e) => { console.error('[audit] FATAL', e); process.exit(1); });
