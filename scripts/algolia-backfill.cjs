#!/usr/bin/env node
/**
 * algolia-backfill.cjs — one-time (idempotent) seed of the Algolia `auctions`
 * index from Firestore, plus the index settings the search UI depends on.
 *
 * Normal steady-state sync is the onAuctionWriteAlgolia Cloud Function (fires on
 * every auction write). This script is for the INITIAL fill (before the trigger
 * has seen every existing lot) and for reapplying index settings. Safe to re-run
 * — saveObjects upserts by objectID and setSettings is declarative.
 *
 * KEY HYGIENE: the Algolia ADMIN/write key is read from the ALGOLIA_ADMIN_KEY
 * env var — NEVER hardcoded. Same key that lives as a Firebase secret for the
 * trigger; here it's an env var for a manual local run.
 *
 * AUTH (Firestore): needs a mazadjoapp service-account key, same approach as
 * scripts/admin/unblock-user.cjs:
 *   export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/key.json
 *   export ALGOLIA_ADMIN_KEY=... # Algolia admin API key (NOT the search key)
 *   node scripts/algolia-backfill.cjs
 */
'use strict';

const { algoliasearch } = require('algoliasearch');
const {
  isIndexable,
  buildAlgoliaRecord,
  ALGOLIA_APP_ID,
  ALGOLIA_INDEX,
} = require('../functions/algoliaSync');

// firebase-admin isn't a root dependency of this app; the loadtest harness
// vendors a known-good v11. Resolve from there, then fall back to root — the
// exact loader scripts/admin/unblock-user.cjs uses.
function loadAdmin() {
  const path = require('path');
  const candidates = [
    '../loadtest/node_modules/firebase-admin',
    '../functions/node_modules/firebase-admin',
    'firebase-admin',
  ];
  for (const c of candidates) {
    try { return require(c.startsWith('.') ? path.join(__dirname, c) : c); }
    catch (e) { if (process.env.DEBUG_ADMIN_LOAD) console.error('  loader miss', c, '::', e.message.split('\n')[0]); }
  }
  console.error('firebase-admin not found. Run `npm i` in scripts/loadtest or functions, or `npm i firebase-admin` at repo root.');
  process.exit(1);
}

const ALGOLIA_ADMIN_KEY = process.env.ALGOLIA_ADMIN_KEY;
if (!ALGOLIA_ADMIN_KEY) {
  console.error('Set ALGOLIA_ADMIN_KEY (Algolia admin API key) in the environment first. Refusing to run without it.');
  process.exit(1);
}
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS to a mazadjoapp service-account key path first.');
  process.exit(1);
}

const admin = loadAdmin();
admin.initializeApp(); // uses GOOGLE_APPLICATION_CREDENTIALS
const db = admin.firestore();

const client = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_ADMIN_KEY);

const INDEX_SETTINGS = {
  searchableAttributes: ['title', 'description', 'category', 'sellerName'],
  attributesForFaceting: ['filterOnly(status)', 'category'],
  customRanking: ['asc(endsAt)'], // ending-soon first
};

// Algolia recommends batches of ~1000 objects per saveObjects call.
const BATCH_SIZE = 1000;

async function main() {
  console.log(`[algolia-backfill] applying index settings to "${ALGOLIA_INDEX}"...`);
  await client.setSettings({ indexName: ALGOLIA_INDEX, indexSettings: INDEX_SETTINGS });
  console.log('[algolia-backfill] settings applied.');

  console.log('[algolia-backfill] reading auctions...');
  const snap = await db.collection('auctions').get();
  console.log(`[algolia-backfill] ${snap.size} auction doc(s) read.`);

  const records = [];
  let skipped = 0;
  snap.forEach((doc) => {
    const data = doc.data();
    if (isIndexable(data)) {
      records.push(buildAlgoliaRecord(doc.id, data));
    } else {
      skipped += 1;
    }
  });

  console.log(`[algolia-backfill] ${records.length} indexable, ${skipped} skipped (not live/upcoming or simulated).`);

  let indexed = 0;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const objects = records.slice(i, i + BATCH_SIZE);
    await client.saveObjects({ indexName: ALGOLIA_INDEX, objects });
    indexed += objects.length;
    console.log(`[algolia-backfill] indexed ${indexed}/${records.length}...`);
  }

  console.log(`[algolia-backfill] DONE. Indexed ${indexed} record(s) into "${ALGOLIA_INDEX}". Skipped ${skipped}.`);
  process.exit(0);
}

main().catch((e) => { console.error('[algolia-backfill] FATAL', e); process.exit(1); });
