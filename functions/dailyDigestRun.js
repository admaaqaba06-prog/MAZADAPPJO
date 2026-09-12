'use strict';
// CR-02 — the run itself. Firestore-shaped, but every dependency is INJECTED
// (db, clock, sender, logger), so the whole thing is exercised in tests with
// fakes: no emulator, no project, no network, no waiting for 19:00.
//
// The decisions live in dailyDigest.js. This file is the order they happen in,
// and the order is the part that carries the risk:
//
//   kill switch -> quiet hours -> fresh live lots -> per user:
//     opted out? -> phone? -> 24h cap? -> interest match? -> already sent?
//       -> render -> send (retry) -> log
//
// Every gate is BEFORE the send, and the cap is read from the log rather than
// inferred from the schedule, because the scheduler is exactly the thing that
// cannot be trusted: a retried invocation, a manual run, and a redeploy all
// re-enter this function on the same day.

const {
  DIGEST_TYPE,
  isQuietHours,
  isFresh,
  toMs,
  pickForUser,
  logKey,
  isCapped,
  excludeAlreadySent,
  renderDigest,
  newRunSummary,
} = require('./dailyDigest');

/** Per-user cap marker, stored in notifications_log alongside the send rows. */
function capKey(uid) {
  return logKey(uid, '_cap', DIGEST_TYPE);
}

/**
 * Run `fn` over `items` with at most `limit` in flight.
 *
 * A digest for a few thousand users is a few thousand HTTP calls to a relay
 * whose own failure rate has been measured around 60% (see postOtpToRelay).
 * Firing them all at once is how you turn a slow relay into a dead one — and
 * the failures would then look like our bug, not its.
 */
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = new Array(Math.max(1, Math.min(limit, items.length))).fill(0).map(async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Sleep that a test can make instant by injecting its own. */
const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Try a send up to `attempts` times with exponential backoff.
 *
 * Returns a boolean, never throws: one recipient's failure must not take the
 * run down with it. That is not defensiveness — with a flaky relay, an
 * uncaught rejection partway through means everyone after that user in the
 * list silently gets nothing, and the run summary would report success for the
 * ones it did reach.
 */
async function sendWithRetry(send, payload, { attempts = 3, baseDelayMs = 500, sleep = realSleep, logger = console } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const ok = await send(payload);
      if (ok) return true;
    } catch (e) {
      logger.warn(`[dailyDigest] send threw for ${payload.uid} (attempt ${attempt}):`, e && e.message);
    }
    if (attempt < attempts) await sleep(baseDelayMs * 2 ** (attempt - 1));
  }
  return false;
}

/** Read several log docs, using getAll when the driver offers it. */
async function readLogDocs(db, ids) {
  if (ids.length === 0) return new Map();
  const col = db.collection('notifications_log');
  const refs = ids.map((id) => col.doc(id));
  let snaps;
  if (typeof db.getAll === 'function') {
    snaps = await db.getAll(...refs);
  } else {
    snaps = await Promise.all(refs.map((r) => r.get()));
  }
  const out = new Map();
  snaps.forEach((s, i) => out.set(ids[i], s && s.exists ? (s.data() || {}) : null));
  return out;
}

/**
 * @param {object} deps
 * @param {FirebaseFirestore.Firestore} deps.db
 * @param {() => number} [deps.now]      - injectable clock
 * @param {(p) => Promise<boolean>} deps.send - ({uid, phone, text, lang}) => delivered?
 * @param {boolean} [deps.dryRun]        - compute and record the run, send nothing
 * @param {(u) => string} [deps.resolveLang]
 */
async function runDailyDigest({
  db,
  now = Date.now,
  send,
  dryRun = false,
  resolveLang = () => 'ar',
  normalizePhone = (v) => (v ? String(v) : null),
  logger = console,
  concurrency = 5,
  sleep = realSleep,
  serverTimestamp = null,
} = {}) {
  const nowMs = now();
  const summary = newRunSummary();
  const intended = [];

  // 1. KILL SWITCH FIRST, before any query. The point of it is to stop a send
  //    without a redeploy, so anything that costs money or time has to come
  //    after it — including the reads.
  const cfgSnap = await db.collection('config').doc('notifications').get();
  const cfg = (cfgSnap && cfgSnap.exists && cfgSnap.data()) || {};
  if (cfg.dailyEnabled === false) {
    logger.log('[dailyDigest] dailyEnabled=false — exiting without sending.');
    return { ...summary, skipped: 'killSwitch', dryRun };
  }

  // 2. Quiet hours. Checked here and not only at schedule time: a retried or
  //    manually triggered invocation can land at 03:00 with a perfectly valid
  //    cron behind it.
  if (isQuietHours(nowMs)) {
    logger.log('[dailyDigest] inside quiet hours (23:00-09:00 Amman) — exiting.');
    return { ...summary, skipped: 'quietHours', dryRun };
  }

  // 3. The candidate lots: live, created in the last 24h.
  //    `status` is filtered in the query; freshness is re-checked in memory
  //    because createdAt is written in several shapes across the corpus
  //    (Timestamp, number, {seconds}) and a range query would silently drop
  //    every row whose type does not match the cursor's.
  const auctionSnap = await db
    .collection('auctions')
    .where('status', '==', 'live')
    .get();

  const fresh = [];
  auctionSnap.forEach((doc) => {
    const d = doc.data() || {};
    const createdAtMs = toMs(d.createdAt);
    if (!isFresh(createdAtMs, nowMs)) return;
    fresh.push({ id: doc.id, createdAtMs, ...d });
  });

  if (fresh.length === 0) {
    logger.log('[dailyDigest] no new live auctions in the last 24h — nothing to send.');
    return { ...summary, reason: 'noFreshAuctions', dryRun };
  }

  // 4. Subscribers. `notifyDaily == true` is the query; everything else is a
  //    per-user gate below.
  const userSnap = await db.collection('users').where('notifyDaily', '==', true).get();
  const users = [];
  userSnap.forEach((doc) => users.push({ id: doc.id, ...(doc.data() || {}) }));

  await mapWithConcurrency(users, concurrency, async (user) => {
    summary.attempted++;

    // Belt to the query's braces. A user can be opted out by channel without
    // notifyDaily having been rewritten — CR-01 writes both, but a hand edit
    // or a partial migration may not.
    if (user.notifyChannel === 'none') {
      summary.skippedOptedOut++;
      return;
    }

    const phone = normalizePhone(user.phoneNumber || user.phone);
    if (!phone) {
      summary.skippedNoPhone++;
      return;
    }

    const interests = Array.isArray(user.interests) ? user.interests : [];
    const { picks: matched, overflow } = pickForUser(fresh, interests);
    if (matched.length === 0) {
      // The no-fallback rule. Nothing else is sent in its place.
      summary.skippedNoMatch++;
      return;
    }

    // 5. The log is the source of truth for BOTH caps: one digest per 24h, and
    //    never the same lot twice. Read together so a user costs one round trip.
    const ids = [capKey(user.id), ...matched.map((a) => logKey(user.id, a.id, DIGEST_TYPE))];
    const log = await readLogDocs(db, ids);

    const capDoc = log.get(ids[0]);
    if (isCapped(capDoc ? toMs(capDoc.sentAt) : null, nowMs)) {
      summary.skippedCapped++;
      return;
    }

    const alreadySent = matched
      .filter((a) => log.get(logKey(user.id, a.id, DIGEST_TYPE)))
      .map((a) => a.id);
    const picks = excludeAlreadySent(matched, alreadySent);
    if (picks.length === 0) {
      summary.skippedAlreadySent++;
      return;
    }

    const lang = resolveLang(user);
    const text = renderDigest({ picks, overflow, lang });
    if (!text) {
      summary.skippedNoMatch++;
      return;
    }

    intended.push({ uid: user.id, phone, auctionIds: picks.map((a) => a.id), lang });

    // 6. DRY RUN STOPS HERE — before the send AND before the per-recipient log
    //    rows. Writing those would mark every recipient as messaged, so the
    //    real run that follows would skip all of them: a rehearsal that
    //    silently cancels the performance. The run summary is still recorded
    //    by the caller, which is what makes the rehearsal reviewable.
    if (dryRun) {
      summary.sent++;
      return;
    }

    const delivered = await sendWithRetry(send, { uid: user.id, phone, text, lang }, { sleep, logger });
    if (!delivered) {
      summary.failed++;
      return;
    }
    summary.sent++;

    // 7. Log AFTER a confirmed delivery. Logging before would make a failed
    //    send permanent — the lot is marked as seen and never retried, so the
    //    user simply never hears about it.
    const stamp = serverTimestamp ? serverTimestamp() : nowMs;
    const batch = db.batch();
    const col = db.collection('notifications_log');
    for (const a of picks) {
      batch.set(col.doc(logKey(user.id, a.id, DIGEST_TYPE)), {
        uid: user.id,
        auctionId: a.id,
        type: DIGEST_TYPE,
        sentAt: stamp,
        channel: 'whatsapp',
      });
    }
    batch.set(col.doc(capKey(user.id)), {
      uid: user.id,
      type: DIGEST_TYPE,
      kind: 'cap',
      sentAt: stamp,
      auctionCount: picks.length,
    });
    try {
      await batch.commit();
    } catch (e) {
      // The message IS delivered at this point. A failed log write means the
      // user may get one of these lots again tomorrow — annoying, and far
      // better than failing the run or pretending nothing was sent.
      logger.error(`[dailyDigest] log write failed for ${user.id} AFTER a delivered send:`, e && e.message);
    }
  });

  logger.log(
    `[dailyDigest]${dryRun ? ' DRY RUN' : ''} attempted=${summary.attempted} sent=${summary.sent} ` +
      `failed=${summary.failed} noMatch=${summary.skippedNoMatch} capped=${summary.skippedCapped} ` +
      `noPhone=${summary.skippedNoPhone} optedOut=${summary.skippedOptedOut} ` +
      `alreadySent=${summary.skippedAlreadySent} freshLots=${fresh.length}`,
  );
  if (dryRun) {
    for (const r of intended) {
      logger.log(`[dailyDigest] DRY RUN would send to ${r.uid} (${r.phone}): ${r.auctionIds.join(', ')}`);
    }
  }

  return { ...summary, freshLots: fresh.length, dryRun, intended };
}

module.exports = { runDailyDigest, sendWithRetry, mapWithConcurrency, readLogDocs, capKey };
