/**
 * common.js — shared config, PROD GUARD, Admin SDK init, and helpers for the
 * Mazad JO load-test harness.
 *
 * EVERY entry-point script (seed / bid-storm / report / teardown) MUST go
 * through loadConfig() + initAdmin() from here. loadConfig() hard-fails
 * (process.exit(1)) if anything smells like the production project:
 *
 *   1. LOADTEST_PROJECT_ID missing                       -> fail
 *   2. LOADTEST_PROJECT_ID in the prod blocklist          -> fail
 *      (blocklist = 'mazadjoapp' hardcoded + every project id found in the
 *       repo's .firebaserc at runtime, so the guard follows the repo config)
 *   3. Service-account json project_id in the blocklist   -> fail
 *   4. Service-account project_id != LOADTEST_PROJECT_ID  -> fail
 *      (prevents "throwaway id on the CLI, prod credentials in the env")
 *   5. LOADTEST_WEB_API_KEY equal to the prod web API key -> fail
 *      (the prod key is baked into src/services/firebase.ts)
 *
 * No credentials are ever hardcoded here: the service account comes from
 * GOOGLE_APPLICATION_CREDENTIALS (a path MJ supplies, never committed) and
 * the web API key from LOADTEST_WEB_API_KEY.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Prod identifiers, mirrored from the repo so the harness can never be aimed
// at the real project even by accident:
//   - project id  'mazadjoapp'  -> .firebaserc + src/services/firebase.ts:8
//   - web API key                -> src/services/firebase.ts:6 (public client key,
//     listed here ONLY as a blocklist entry, never used to authenticate anything)
const HARDCODED_PROD_PROJECT_IDS = ['mazadjoapp'];
const PROD_WEB_API_KEYS = ['AIzaSyDpGyYrneZqX578TcD95LogNPsDwOHX1EA'];

// Everything the harness creates carries this flag so teardown.js can find it.
const LOADTEST_FLAG = 'isLoadTest';

const USER_UID_PREFIX = 'loadtest-user-';
const AUCTION_ID_PREFIX = 'loadtest-lot-';
const MANIFEST_PATH = path.join(__dirname, 'seed-manifest.json');

function fail(msg) {
  console.error(`\n[loadtest] FATAL: ${msg}\n`);
  process.exit(1);
}

/** Collect every project id referenced by the repo's .firebaserc (if present). */
function firebasercProjectIds() {
  const ids = [];
  // __dirname = <repo>/scripts/loadtest — walk up to the repo root.
  const rcPath = path.join(__dirname, '..', '..', '.firebaserc');
  try {
    const rc = JSON.parse(fs.readFileSync(rcPath, 'utf8'));
    for (const v of Object.values(rc.projects || {})) {
      if (typeof v === 'string' && v) ids.push(v);
    }
  } catch (_) {
    // .firebaserc unreadable — the hardcoded blocklist still applies.
  }
  return ids;
}

/**
 * Validate env + prod guard. Returns { projectId, saPath, sa, webApiKey,
 * region, functionsBaseUrl }. Exits the process on any violation.
 */
function loadConfig({ requireWebApiKey = false } = {}) {
  const prodIds = new Set([...HARDCODED_PROD_PROJECT_IDS, ...firebasercProjectIds()]);

  const projectId = (process.env.LOADTEST_PROJECT_ID || '').trim();
  if (!projectId) {
    fail(
      'LOADTEST_PROJECT_ID is not set. Set it to your THROWAWAY Firebase project id.\n' +
      '         This harness refuses to run without an explicit project id.'
    );
  }
  if (prodIds.has(projectId)) {
    fail(
      `LOADTEST_PROJECT_ID="${projectId}" is a PRODUCTION project id ` +
      `(blocklisted via .firebaserc / hardcoded guard). NEVER run the load test ` +
      `against prod — create a throwaway project (see README.md).`
    );
  }

  const saPath = (process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim();
  if (!saPath) {
    fail('GOOGLE_APPLICATION_CREDENTIALS is not set. Point it at the THROWAWAY project\'s service-account json.');
  }
  let sa;
  try {
    sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));
  } catch (e) {
    fail(`Could not read/parse service account at GOOGLE_APPLICATION_CREDENTIALS=${saPath}: ${e.message}`);
  }
  if (!sa.project_id) {
    fail(`Service account json at ${saPath} has no project_id field.`);
  }
  if (prodIds.has(sa.project_id)) {
    fail(
      `The service account at ${saPath} belongs to PRODUCTION project "${sa.project_id}". ` +
      `Refusing to continue.`
    );
  }
  if (sa.project_id !== projectId) {
    fail(
      `Service-account project ("${sa.project_id}") does not match LOADTEST_PROJECT_ID ` +
      `("${projectId}"). Both must reference the same THROWAWAY project.`
    );
  }

  const webApiKey = (process.env.LOADTEST_WEB_API_KEY || '').trim();
  if (requireWebApiKey && !webApiKey) {
    fail(
      'LOADTEST_WEB_API_KEY is not set. It must be the THROWAWAY project\'s Web API key\n' +
      '         (Firebase console -> Project settings -> General, or `firebase apps:sdkconfig web`).\n' +
      '         It is needed to exchange custom tokens for ID tokens via the Auth REST API.'
    );
  }
  if (webApiKey && PROD_WEB_API_KEYS.includes(webApiKey)) {
    fail('LOADTEST_WEB_API_KEY is the PRODUCTION web API key (src/services/firebase.ts). Refusing to continue.');
  }

  const region = (process.env.LOADTEST_REGION || 'us-central1').trim();
  // functions/index.js uses gen-1 callables with no .region() override, so the
  // default deploy region is us-central1: https://<region>-<project>.cloudfunctions.net
  const functionsBaseUrl =
    (process.env.LOADTEST_FUNCTIONS_URL || `https://${region}-${projectId}.cloudfunctions.net`).replace(/\/+$/, '');

  return { projectId, saPath, sa, webApiKey, region, functionsBaseUrl };
}

/** Initialize firebase-admin against the (guard-validated) throwaway project. */
function initAdmin(config) {
  // firebase-admin is a dependency of the repo root package.json — Node
  // resolves it upward from scripts/loadtest/. Run `npm install` at the repo
  // root if this throws MODULE_NOT_FOUND.
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(config.sa),
      projectId: config.projectId,
    });
  }
  return { admin, db: admin.firestore() };
}

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Nearest-rank percentile of a numeric array (returns null on empty). */
function percentile(values, p) {
  if (!values || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function filsToJod(fils) {
  return fils / 1000;
}

/**
 * Min-next-bid rule, replicated 1:1 from functions/index.js bidPricing():
 * the FIRST bid may equal the asking price; every later bid must clear
 * currentPrice + minIncrement. All math in integer fils.
 */
function bidPricing(auctionData) {
  const currentPriceFils = Math.round((auctionData.currentPrice || auctionData.startingPrice || 0) * 1000);
  const minIncrementFils = Math.round((auctionData.minIncrement || 10) * 1000);
  const totalBids = auctionData.totalBids || 0;
  const minRequiredFils = totalBids > 0 ? (currentPriceFils + minIncrementFils) : currentPriceFils;
  return { currentPriceFils, minIncrementFils, totalBids, minRequiredFils };
}

/**
 * Buyer's-premium math, replicated 1:1 from settleAuctionTxn
 * (functions/index.js:203-204): 5% premium computed in integer fils.
 */
function expectedOrderTotals(finalPriceJod) {
  const priceFils = Math.round(finalPriceJod * 1000);
  const premiumFils = Math.round(priceFils * 0.05);
  return {
    priceFils,
    premiumFils,
    totalDueFils: priceFils + premiumFils,
    buyersPremiumJod: premiumFils / 1000,
    totalDueJod: (priceFils + premiumFils) / 1000,
  };
}

function readManifest() {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch (_) {
    return null;
  }
}

function writeManifest(manifest) {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

/**
 * Run `fn(item, index)` over `items` with at most `limit` in flight at once.
 * Used for scaling seed/mint steps to thousands of users without either (a)
 * fully sequential setup (impractically slow at scale) or (b) fully unbounded
 * parallelism (risks tripping Google's own per-project API quotas, which would
 * look like an app failure but isn't one). Preserves each result's index.
 */
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Delete a list of document refs in chunks (Firestore batches cap at 500 writes). */
async function deleteRefsInBatches(db, refs) {
  let count = 0;
  for (let i = 0; i < refs.length; i += 450) {
    const chunk = refs.slice(i, i + 450);
    const batch = db.batch();
    chunk.forEach((ref) => batch.delete(ref));
    await batch.commit();
    count += chunk.length;
  }
  return count;
}

module.exports = {
  LOADTEST_FLAG,
  USER_UID_PREFIX,
  AUCTION_ID_PREFIX,
  MANIFEST_PATH,
  loadConfig,
  initAdmin,
  sleep,
  mapWithConcurrency,
  percentile,
  filsToJod,
  bidPricing,
  expectedOrderTotals,
  readManifest,
  writeManifest,
  deleteRefsInBatches,
  fail,
};
