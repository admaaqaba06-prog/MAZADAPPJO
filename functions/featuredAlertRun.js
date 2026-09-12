'use strict';
// CR-03 — the featured broadcast. Same shape as dailyDigestRun: every
// dependency injected, so the run is tested against a fake Firestore.
//
// It reuses CR-02's plumbing on purpose — the same notifications_log, the same
// quiet hours, the same concurrency and retry, the same relay. What it does NOT
// share is the audience or the frequency rule: `notifyFeatured` is its own
// flag, so a user can keep featured alerts while muting the daily digest, or
// the reverse.
//
// It also does not share the digest's 24h per-user cap. That cap exists to stop
// a routine becoming a nuisance; this alert is governed instead by a hard limit
// on how often it can be SENT AT ALL (two per seven days), which is checked
// before a broadcast is allowed to start.

const { isQuietHours, logKey, toMs } = require('./dailyDigest');
const { mapWithConcurrency, sendWithRetry, readLogDocs } = require('./dailyDigestRun');
const {
  FEATURED_TYPE,
  renderFeaturedAlert,
  isFeaturedCapped,
  nextAllowedAt,
  validateReason,
} = require('./featuredAlert');
const { matchesInterests } = require('./dailyDigest');

const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Broadcast timestamps inside the window, read from the ledger. */
async function readRecentBroadcasts(db, nowMs, windowMs) {
  const cutoff = nowMs - windowMs;
  // Single-field range query — no composite index needed, which matters because
  // an index that has not been created yet fails CLOSED at runtime and the cap
  // would start throwing instead of capping.
  const snap = await db
    .collection('featuredBroadcasts')
    .where('at', '>=', cutoff)
    .get();
  const out = [];
  snap.forEach((d) => {
    const v = toMs((d.data() || {}).at);
    if (v !== null) out.push(v);
  });
  return out;
}

function newFeaturedSummary() {
  return {
    attempted: 0,
    sent: 0,
    failed: 0,
    skippedNoMatch: 0,
    skippedOptedOut: 0,
    skippedNoPhone: 0,
    skippedAlreadySent: 0,
  };
}

/**
 * Broadcast one featured auction.
 *
 * @param {object} deps
 * @param {string} deps.auctionId
 * @param {string} deps.reason        - required, validated by the caller too
 * @param {boolean} [deps.sendToAll]  - skip the interest filter ("ارسال للجميع")
 * @param {boolean} [deps.dryRun]
 */
async function runFeaturedAlert({
  db,
  auctionId,
  reason,
  sendToAll = false,
  dryRun = false,
  now = Date.now,
  send,
  resolveLang = () => 'ar',
  normalizePhone = (v) => (v ? String(v) : null),
  logger = console,
  concurrency = 5,
  sleep = realSleep,
  serverTimestamp = null,
  windowMs = require('./featuredAlert').FEATURED_WINDOW_MS,
} = {}) {
  const nowMs = now();
  const summary = newFeaturedSummary();
  const intended = [];

  const check = validateReason(reason);
  if (!check.ok) return { ...summary, refused: check.code, dryRun };

  // 1. Kill switch first, before anything that costs a read.
  const cfgSnap = await db.collection('config').doc('notifications').get();
  const cfg = (cfgSnap && cfgSnap.exists && cfgSnap.data()) || {};
  if (cfg.featuredEnabled === false) {
    logger.log('[featuredAlert] featuredEnabled=false — exiting without sending.');
    return { ...summary, refused: 'killSwitch', dryRun };
  }

  // 2. Quiet hours. An admin CAN press the button at 2am; the recipients did
  //    not agree to that, and "the admin was awake" is not consent.
  if (isQuietHours(nowMs)) {
    return { ...summary, refused: 'quietHours', dryRun };
  }

  // 3. The cap, re-checked here even though the callable already refused.
  //    Defence in depth, and it is the layer that survives someone wiring a
  //    second caller (a script, a trigger) straight into this function.
  const recent = await readRecentBroadcasts(db, nowMs, windowMs);
  if (isFeaturedCapped(recent, nowMs)) {
    return {
      ...summary,
      refused: 'capped',
      nextAllowedAt: nextAllowedAt(recent, nowMs),
      dryRun,
    };
  }

  const auctionSnap = await db.collection('auctions').doc(auctionId).get();
  if (!auctionSnap || !auctionSnap.exists) {
    return { ...summary, refused: 'auction_not_found', dryRun };
  }
  const auction = { id: auctionSnap.id, ...(auctionSnap.data() || {}) };
  if (auction.status !== 'live') {
    // Alerting on a lot nobody can bid on is worse than not alerting: it spends
    // one of only two weekly slots AND sends people to a dead page.
    return { ...summary, refused: 'auction_not_live', dryRun };
  }

  // 4. The audience: its OWN flag, independent of the daily digest.
  const userSnap = await db.collection('users').where('notifyFeatured', '==', true).get();
  const users = [];
  userSnap.forEach((doc) => users.push({ id: doc.id, ...(doc.data() || {}) }));

  await mapWithConcurrency(users, concurrency, async (user) => {
    summary.attempted++;

    if (user.notifyChannel === 'none') {
      summary.skippedOptedOut++;
      return;
    }

    const phone = normalizePhone(user.phoneNumber || user.phone);
    if (!phone) {
      summary.skippedNoPhone++;
      return;
    }

    // 5. Interest filter, unless the admin explicitly chose everyone.
    if (!sendToAll) {
      const interests = Array.isArray(user.interests) ? user.interests : [];
      if (!matchesInterests(auction.category, interests)) {
        summary.skippedNoMatch++;
        return;
      }
    }

    // 6. Same log, same never-twice rule as the digest.
    const key = logKey(user.id, auction.id, FEATURED_TYPE);
    const log = await readLogDocs(db, [key]);
    if (log.get(key)) {
      summary.skippedAlreadySent++;
      return;
    }

    const lang = resolveLang(user);
    const text = renderFeaturedAlert({ auction, reason: check.reason, lang });
    if (!text) {
      summary.skippedNoMatch++;
      return;
    }

    intended.push({ uid: user.id, phone, lang });

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

    const stamp = serverTimestamp ? serverTimestamp() : nowMs;
    try {
      await db.collection('notifications_log').doc(key).set({
        uid: user.id,
        auctionId: auction.id,
        type: FEATURED_TYPE,
        sentAt: stamp,
        channel: 'whatsapp',
      });
    } catch (e) {
      logger.error(`[featuredAlert] log write failed for ${user.id} AFTER a delivered send:`, e && e.message);
    }
  });

  logger.log(
    `[featuredAlert]${dryRun ? ' DRY RUN' : ''} auction=${auction.id} sendToAll=${sendToAll} ` +
      `attempted=${summary.attempted} sent=${summary.sent} failed=${summary.failed} ` +
      `noMatch=${summary.skippedNoMatch} optedOut=${summary.skippedOptedOut} ` +
      `noPhone=${summary.skippedNoPhone} alreadySent=${summary.skippedAlreadySent}`,
  );

  return { ...summary, auctionId: auction.id, sendToAll, dryRun, intended };
}

module.exports = { runFeaturedAlert, readRecentBroadcasts, newFeaturedSummary };
