/**
 * The scheduled sweep that expires lapsed memberships.
 *
 * THE BUG THIS CLOSES: `subscriptionStatus` was a LATCH. subscriptionApproval.js
 * wrote 'active' at grant time and nothing ever wrote it again — no cron touched
 * subscriptions, and the value 'expired' existed in src/types.ts while nothing
 * in production ever produced it. So the stored flag drifted permanently out of
 * agreement with the expiry date sitting next to it, and every surface that read
 * the flag instead of deriving from the date inherited that lie.
 *
 * WHAT THIS IS NOT: this is not the bid gate. functions/index.js placeBid
 * already compares the expiry to the clock and already fails closed on an
 * unreadable one, and auctions/{id}/bids is `allow write: if false`, so an
 * expired member could never actually bid. This sweep does not close a hole —
 * it makes the STORED state true, so that admin counts, exports, and any future
 * reader that cannot recompute the date are not reading a stale 'active'.
 *
 * Modelled on paymentDefaultEnforcer's section A (lift elapsed cooldowns):
 * query the field that has passed, re-check in code, write with merge.
 *
 * THE PREDICATE IS MIRRORED, NOT REINVENTED. resolveExpirySweepAction answers
 * the same question as src/utils/membership.ts isActiveMember, and
 * subscriptionExpiry.test.js asserts the two agree across the CJS/ESM boundary.
 * Three copies of this rule already exist (placeBid, membership.ts, here); a
 * fourth that disagreed would recreate the original bug in a new place.
 */

/**
 * One stored expiry value → epoch ms, or null when it carries no usable date.
 *
 * Mirrors src/utils/membership.ts parseExpiryMs, INCLUDING its string handling.
 * Strings matter here even though the queries below can never return one (see
 * the note on findLapsedCandidates): a doc reached via the OTHER field may still
 * carry a string in this one, and taking the later of the two requires reading
 * both.
 */
function parseExpiryMs(raw) {
  if (raw === null || raw === undefined || raw === '') return null;

  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }

  if (typeof raw === 'object') {
    if (typeof raw.toMillis === 'function') {
      const ms = raw.toMillis();
      return typeof ms === 'number' && Number.isFinite(ms) && ms > 0 ? ms : null;
    }
    // A Timestamp that survived JSON (loses its methods, keeps its fields).
    if (typeof raw.seconds === 'number' && Number.isFinite(raw.seconds)) {
      const ms = raw.seconds * 1000;
      return ms > 0 ? ms : null;
    }
    return null;
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed === '') return null;
    // A numeric string is an epoch, not a date for the Date parser —
    // `new Date('1787600000000')` is Invalid Date in every engine.
    if (/^\d+$/.test(trimmed)) {
      const ms = Number(trimmed);
      return Number.isFinite(ms) && ms > 0 ? ms : null;
    }
    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

/**
 * The expiry that actually governs: whichever stored field is furthest in the
 * future. buildGrantFields writes both from one value, so the later of the two
 * is the one a renewal updated — and taking the max is what stops this sweep
 * from expiring a member whose renewal only landed in one field.
 */
function effectiveExpiryMs(user) {
  if (!user) return null;
  const a = parseExpiryMs(user.subscriptionExpiry);
  const b = parseExpiryMs(user.subscriptionExpiresAt);
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

/**
 * The ONE explicit exemption from needing a date. Mirrors
 * src/utils/membership.ts isLifetimeMembership: matched on the tier/plan LABEL
 * and not on "has no expiry", because the entire point is to tell a deliberate
 * permanent grant apart from a missing field. Treating absence as permission is
 * the bug this policy exists to close.
 */
function isLifetimeMembership(user) {
  if (!user) return false;
  return [user.subscriptionTier, user.subscriptionPlan].some(
    (l) => typeof l === 'string' && ['lifetime', 'permanent'].includes(l.trim().toLowerCase()),
  );
}

/**
 * THE SERVER-SIDE MEMBERSHIP GATE. May this account bid?
 *
 * placeBid carried this rule inline as its own copy of the arithmetic. Now it
 * calls this, so the gate and the sweep cannot drift apart: the job that writes
 * 'expired' and the check that refuses a bid are the same predicate, and
 * src/utils/membership.ts isActiveMember is the third mirror, bound to this one
 * by the parity tests in subscriptionExpiry.test.js.
 *
 * FAILS CLOSED on a missing or unreadable expiry. An account we cannot verify
 * is not entitled to bid — that is a data problem for support, not a licence.
 *
 * ONE DELIBERATE BEHAVIOUR CHANGE vs the inline version it replaces: a lifetime
 * grant now outranks a stored date entirely. The old inline check refused a
 * 'lifetime' account that also carried a past expiry, while the client's mirror
 * honoured it — a divergence on a path nothing can currently reach, since every
 * tier in subscriptionTiers.js has a finite durationDays and a lifetime grant
 * can only arrive by deliberate admin write. Resolved toward the documented
 * intent (a permanent grant has no date by design) so all three copies agree.
 */
function isActiveMember(user, nowMs) {
  if (!user) return false;
  if (user.subscriptionStatus !== 'active') return false;
  if (isLifetimeMembership(user)) return true;
  const expiry = effectiveExpiryMs(user);
  if (expiry === null) return false;
  return expiry > nowMs;
}

/**
 * What the sweep should do with one user document.
 *
 *   'not_active'    — not our business; the sweep only ever demotes FROM active.
 *   'active'        — a live membership, or a permanent grant. Leave alone.
 *   'needs_support' — claims active, carries no readable date. NOT expired.
 *   'expire'        — a real date, and it has passed.
 *
 * 'needs_support' IS THE IMPORTANT ONE. It would be easy to treat a missing
 * expiry as a lapse and sweep it, and that would silently revoke every account
 * whose expiry field never got written — a data problem turned into a
 * cancellation. Absence of a date is not evidence of a lapse. The account is
 * reported for a human instead, and placeBid independently refuses it in the
 * meantime, so nothing is granted that we cannot verify.
 *
 * REACHED VIA A CORRUPT EPOCH, not a missing one. A doc with no expiry field is
 * absent from both inequality indexes and never arrives here at all (see
 * findLapsedCandidates). What does arrive is a stored 0 or a negative number:
 * the index counts it as `<= now`, parseExpiryMs correctly refuses it as a
 * date, and without this branch it would be swept as though it had lapsed.
 */
function resolveExpirySweepAction(user, nowMs) {
  if (!user || user.subscriptionStatus !== 'active') return 'not_active';
  if (isLifetimeMembership(user)) return 'active';
  const expiry = effectiveExpiryMs(user);
  if (expiry === null) return 'needs_support';
  // `<= nowMs`, matching placeBid's `subExpiryMs <= Date.now()` exactly: an
  // expiry landing on this instant is spent.
  return expiry <= nowMs ? 'expire' : 'active';
}

/**
 * Candidate docs, from two queries unioned by id.
 *
 * TWO QUERIES BECAUSE THERE ARE TWO FIELDS, and Firestore cannot order by the
 * max of them. Each query finds accounts whose own field has passed; the
 * in-code predicate then decides using BOTH, so a doc found by a stale
 * `subscriptionExpiresAt` is still spared when `subscriptionExpiry` shows a
 * live renewal.
 *
 * KNOWN AND ACCEPTED GAP: a legacy expiry stored as an ISO STRING is invisible
 * to both queries — Firestore orders by type first, so a string is never
 * returned by a numeric or Timestamp inequality. Such an account keeps a stale
 * 'active' flag. It is not a security gap: placeBid parses strings and refuses
 * the bid, and the client derives the badge from the same string and shows
 * Expired. Only the stored flag stays wrong, which is exactly what a backfill
 * is for rather than a permanently type-juggling cron.
 */
async function findLapsedCandidates(deps) {
  const { db, Timestamp, now } = deps;
  const nowMs = now();
  const users = db.collection('users');

  const [byTimestamp, byNumber] = await Promise.all([
    users
      .where('subscriptionStatus', '==', 'active')
      .where('subscriptionExpiresAt', '<=', Timestamp.fromMillis(nowMs))
      .get(),
    users
      .where('subscriptionStatus', '==', 'active')
      .where('subscriptionExpiry', '<=', nowMs)
      .get(),
  ]);

  const byId = new Map();
  for (const doc of [...byTimestamp.docs, ...byNumber.docs]) {
    // An account matching both queries must be considered once, not twice —
    // otherwise the run summary double-counts it and the audit row lies.
    if (!byId.has(doc.id)) byId.set(doc.id, doc);
  }
  return [...byId.values()];
}

/**
 * Expire every membership whose date has passed.
 *
 * NEVER THROWS PER DOC. One unwritable user document must not stop the rest of
 * the sweep — the next run would hit the same doc and stall forever in the same
 * place. Failures are counted and logged, and the run reports them.
 *
 * IDEMPOTENT: the write flips `subscriptionStatus` off 'active', which is the
 * equality clause in both queries, so an already-expired account is not seen
 * again.
 */
async function expireLapsedSubscriptions(deps) {
  const { db, FieldValue, now } = deps;
  const nowMs = now();

  const candidates = await findLapsedCandidates(deps);

  let expired = 0;
  let needsSupport = 0;
  let failed = 0;
  const needsSupportIds = [];

  for (const doc of candidates) {
    const user = doc.data() || {};
    const action = resolveExpirySweepAction(user, nowMs);

    if (action === 'needs_support') {
      needsSupport += 1;
      // Capped: the details string goes into a health row a human reads, and
      // a systemic write failure could otherwise produce thousands of ids.
      if (needsSupportIds.length < 20) needsSupportIds.push(doc.id);
      console.warn(
        `[subscriptionExpirySweep] ${doc.id} claims active with no readable expiry — left alone for support`,
      );
      continue;
    }

    if (action !== 'expire') continue;

    try {
      // MERGE, and the expiry fields are deliberately NOT cleared: the account
      // screen shows "Expired" above the date it lapsed on, and a badge with no
      // date beneath it tells the member nothing about what to renew from.
      await doc.ref.set(
        {
          subscriptionStatus: 'expired',
          subscriptionExpiredAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      expired += 1;
      console.log(`[subscriptionExpirySweep] expired ${doc.id}`);
    } catch (e) {
      failed += 1;
      console.error(
        `[subscriptionExpirySweep] could not expire ${doc.id} (non-fatal):`,
        e && e.message,
      );
    }
  }

  const summary = { scanned: candidates.length, expired, needsSupport, failed };

  // ONLY LOG A RUN THAT DID SOMETHING. This sweep runs every 60 minutes; a row
  // per quiet run would bury the interesting ones — and #287 is a fresh lesson
  // in what happens when the health board fills with reassuring noise.
  if (expired > 0 || needsSupport > 0 || failed > 0) {
    const parts = [`${expired} expired`];
    if (needsSupport > 0) {
      parts.push(`${needsSupport} unreadable expiry (${needsSupportIds.join(', ')})`);
    }
    if (failed > 0) parts.push(`${failed} write failures`);
    try {
      await db.collection('system_health').add({
        type: 'subscription_expiry_sweep',
        title: `Subscription sweep — ${expired} expired`,
        details: `Scanned ${candidates.length} candidate(s): ${parts.join('; ')}.`,
        source: 'subscriptionExpirySweep',
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (e) {
      // An unwritable audit row must not fail a sweep that already did its work.
      console.error('[subscriptionExpirySweep] audit row failed (non-fatal):', e && e.message);
    }
  }

  return summary;
}

module.exports = {
  parseExpiryMs,
  effectiveExpiryMs,
  isLifetimeMembership,
  isActiveMember,
  resolveExpirySweepAction,
  findLapsedCandidates,
  expireLapsedSubscriptions,
};
