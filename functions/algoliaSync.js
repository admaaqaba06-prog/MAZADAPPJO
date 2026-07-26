/**
 * algoliaSync — Firestore → Algolia mirror for the `auctions` search index.
 *
 * The client ships a PUBLIC search-only key; the ADMIN/write key is a Firebase
 * secret (`ALGOLIA_ADMIN_KEY`, defineSecret) used ONLY here + the backfill
 * script — it is NEVER in client code or hardcoded anywhere.
 *
 * We index only PUBLIC, non-simulated inventory that a shopper can actually act
 * on: status in ['live','upcoming']. Anything else (processing/rejected/ended/
 * completed/reserve_not_met, or a simulated lot) is deleted from the index on
 * the write that transitions it out — so search never surfaces a dead or fake
 * lot.
 *
 * algoliasearch is v5 (flattened API, NOT v4 — there is no initIndex). Verified
 * method shapes against the installed package:
 *   client.saveObject({ indexName, body })
 *   client.deleteObject({ indexName, objectID })
 *   client.saveObjects({ indexName, objects })   // batch (used by backfill)
 *   client.setSettings({ indexName, indexSettings })
 *
 * The pure helpers (isIndexable, buildAlgoliaRecord) carry NO dependency on
 * firebase/algolia so they are unit-testable in isolation and reused by the
 * backfill script.
 */
'use strict';

// firebase-functions / algoliasearch are only present in the Cloud Functions
// runtime (functions/node_modules), NOT in the repo-root unit-test env. The pure
// helpers below (isIndexable/buildAlgoliaRecord/resolveEndMs) intentionally have
// no firebase/algolia dependency, so guard these requires: when they're absent
// the module still LOADS for its pure-helper tests and only the cloud-function
// export is skipped. In the deployed runtime they resolve normally.
let functions, defineSecret, algoliasearch, ALGOLIA_ADMIN_KEY;
try {
  functions = require('firebase-functions');
  ({ defineSecret } = require('firebase-functions/params'));
  ({ algoliasearch } = require('algoliasearch'));
} catch (_) {
  functions = null;
}

// App ID + index name are PUBLIC, non-secret constants (they also ship in the
// client). Only the admin key is a secret.
const ALGOLIA_APP_ID = 'O45I2Z57QS';
const ALGOLIA_INDEX = 'auctions';
if (defineSecret) ALGOLIA_ADMIN_KEY = defineSecret('ALGOLIA_ADMIN_KEY');

/**
 * isIndexable — only public, non-simulated, live/upcoming lots are searchable
 * inventory. Everything else is either not-yet-public (processing), rejected,
 * already over (ended/completed/reserve_not_met), or fake (simulated) and must
 * NOT appear in search results. Null-safe: a missing doc is not indexable.
 */
function isIndexable(data) {
  return !!data && data.isSimulated !== true && ['live', 'upcoming'].includes(data.status);
}

/**
 * resolveEndMs — collapse an auction's end time to a sortable epoch-ms number.
 * Prefers the numeric `endTime` (post-migration lots carry it), then the
 * `endsAt` Firestore Timestamp / {seconds} / ISO string. Mirrors the closer's
 * resolution logic (index.js) so search sorts by the SAME clock. Returns 0 when
 * absent so a malformed doc still yields a stable, dependency-free number
 * (customRanking asc(endsAt) needs a number, never a Timestamp object).
 */
function resolveEndMs(data) {
  if (typeof data.endTime === 'number') return data.endTime;
  const endsAt = data.endsAt;
  if (endsAt != null) {
    if (typeof endsAt === 'number') return endsAt;
    if (typeof endsAt.toMillis === 'function') return endsAt.toMillis();
    if (typeof endsAt.seconds === 'number') return endsAt.seconds * 1000;
    const parsed = Date.parse(endsAt);
    if (!Number.isNaN(parsed)) return parsed;
  }
  if (data.endTime != null) {
    if (typeof data.endTime.toMillis === 'function') return data.endTime.toMillis();
    const parsed = Date.parse(data.endTime);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

/**
 * buildAlgoliaRecord — the indexed object for one auction. Dependency-free +
 * null-safe. Mirrors the client-side `algoliaHitToAuction` shape so a hit maps
 * cleanly back to an AuctionItem. Price is normalized to JOD units (from
 * integer fils when present); endTime + endsAt are the SAME sortable epoch-ms
 * number (customRanking is asc(endsAt), ending-soon first).
 */
function buildAlgoliaRecord(id, data) {
  const d = data || {};
  const endMs = resolveEndMs(d);
  return {
    objectID: id,
    id,
    title: d.title ?? '',
    description: d.description ?? '',
    category: d.category ?? '',
    condition: d.condition ?? '',
    status: d.status,
    currentPrice: d.currentPriceFils != null ? d.currentPriceFils / 1000 : (d.currentPrice ?? 0),
    endTime: endMs,
    endsAt: endMs,
    sellerName: d.sellerName ?? '',
    thumbnailUrl: d.thumbnailUrl ?? '',
  };
}

/**
 * onAuctionWriteAlgolia — the Firestore mirror trigger.
 * On any write to auctions/{id}: delete from the index if the doc is gone OR no
 * longer indexable (transitioned out of live/upcoming, or flagged simulated);
 * otherwise upsert the record. A transient Algolia error is LOGGED and
 * swallowed — never thrown — so a failed index write can't spin the Cloud
 * Function into an infinite retry storm (the per-minute backfill/next-write
 * reconciles it). deleteObject on a non-existent objectID is a safe Algolia
 * no-op.
 */
// Only registered in the Cloud Functions runtime (where firebase-functions +
// algoliasearch resolve); skipped in the pure-helper unit-test env.
if (functions && algoliasearch && ALGOLIA_ADMIN_KEY) {
  exports.onAuctionWriteAlgolia = functions
    .runWith({ secrets: [ALGOLIA_ADMIN_KEY] })
    .firestore.document('auctions/{auctionId}')
    .onWrite(async (change, context) => {
      const id = context.params.auctionId;
      const after = change.after.exists ? change.after.data() : null;
      try {
        const client = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_ADMIN_KEY.value());
        if (!after || !isIndexable(after)) {
          await client.deleteObject({ indexName: ALGOLIA_INDEX, objectID: id });
        } else {
          await client.saveObject({ indexName: ALGOLIA_INDEX, body: buildAlgoliaRecord(id, after) });
        }
      } catch (err) {
        // Swallow — never throw (avoids infinite Cloud Functions retry storms).
        console.error('[algoliaSync] index write failed for', id, err);
      }
      return null;
    });
}

module.exports.isIndexable = isIndexable;
module.exports.buildAlgoliaRecord = buildAlgoliaRecord;
module.exports.resolveEndMs = resolveEndMs;
module.exports.ALGOLIA_APP_ID = ALGOLIA_APP_ID;
module.exports.ALGOLIA_INDEX = ALGOLIA_INDEX;
