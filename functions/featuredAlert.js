'use strict';
// CR-03 — the featured-auction alert. PURE logic, no firebase deps (root Vitest
// loads this directly, same rule as notify.js and dailyDigest.js).
//
// This is a DIFFERENT product from the daily digest, not a variant of it. The
// digest is a routine you can ignore; this is an interruption that claims a lot
// is worth stopping for. The whole design follows from that one sentence:
//
//   - a REQUIRED reason, because "featured" on its own says nothing and an
//     alert that says nothing is the one people mute;
//   - a hard cap of two per seven days, enforced server-side where the UI
//     cannot route around it — the third alert in a week is what teaches
//     people the second one was noise;
//   - copy that does not look like the digest, so the two are distinguishable
//     at a glance in a WhatsApp list.
//
// WHY THIS IS NOT A FIRESTORE TRIGGER on `isFeatured`. The spec says "setting
// the flag triggers the broadcast", and a trigger is the obvious way to read
// that. It cannot give the admin the BLOCKING message the same spec requires:
// by the time a trigger runs, the write has already happened, so the cap could
// only be reported after the fact — or worse, enforced by silently discarding
// a send the admin believes went out. The cap lives in the callable, which is
// also what makes it unbypassable from the UI.

const { formatAmmanClock, money, auctionUrl, toMs, startingPriceUnits, OPT_OUT_AR, OPT_OUT_EN } = require('./dailyDigest');

/** notifications_log type for this alert. Distinct from the digest's. */
const FEATURED_TYPE = 'featured_alert';

/** At most this many featured alerts inside the window. */
const FEATURED_MAX_PER_WINDOW = 2;

/** The window the cap is measured over. */
const FEATURED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** A reason the admin must actually write. */
const REASON_MIN = 3;
const REASON_MAX = 120;

/**
 * Is a featured reason usable?
 *
 * Required, and required to be SHORT: it goes into a WhatsApp message directly
 * below the product name, and an admin pasting a paragraph turns the alert into
 * the thing it exists not to be.
 */
function validateReason(raw) {
  const reason = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (reason.length < REASON_MIN) return { ok: false, code: 'reason_required', reason: '' };
  if (reason.length > REASON_MAX) return { ok: false, code: 'reason_too_long', reason: '' };
  return { ok: true, reason };
}

/**
 * Timestamps of broadcasts still inside the window, newest first.
 * Anything outside it, or unparseable, is dropped rather than guessed at.
 */
function recentBroadcasts(broadcastTimes, nowMs) {
  const cutoff = nowMs - FEATURED_WINDOW_MS;
  return (broadcastTimes || [])
    .map((t) => toMs(t))
    .filter((t) => typeof t === 'number' && Number.isFinite(t) && t > cutoff && t <= nowMs)
    .sort((a, b) => b - a);
}

/** Has the cap been reached? */
function isFeaturedCapped(broadcastTimes, nowMs) {
  return recentBroadcasts(broadcastTimes, nowMs).length >= FEATURED_MAX_PER_WINDOW;
}

/**
 * When the next alert becomes allowed — the moment the OLDEST of the capping
 * sends falls out of the window. Null when nothing is blocking.
 */
function nextAllowedAt(broadcastTimes, nowMs) {
  const recent = recentBroadcasts(broadcastTimes, nowMs);
  if (recent.length < FEATURED_MAX_PER_WINDOW) return null;
  // recent is newest-first; the one that frees a slot is the Nth newest.
  const blocking = recent[FEATURED_MAX_PER_WINDOW - 1];
  return blocking + FEATURED_WINDOW_MS;
}

/** Amman-local date, for a message a human reads. */
function formatAmmanDate(ms) {
  const d = new Date(ms + 3 * 60 * 60 * 1000);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

/**
 * The blocking message the admin sees. Names the DATE, not just "you are
 * capped": a refusal without a next-allowed time reads as a bug and invites
 * someone to go looking for a way around it.
 */
function capMessage(nextAllowedMs, lang = 'ar') {
  const when = nextAllowedMs ? `${formatAmmanDate(nextAllowedMs)} ${formatAmmanClock(nextAllowedMs)}` : '';
  return lang === 'en'
    ? `Featured alerts are capped at ${FEATURED_MAX_PER_WINDOW} per 7 days, and both have been used. The next one is allowed on ${when}. The cap is what keeps the alert meaningful — it cannot be overridden here.`
    : `تنبيهات المزادات المميزة محدودة بـ ${FEATURED_MAX_PER_WINDOW} كل ٧ أيام، والاثنين انبعتوا. أقرب تنبيه جاي بتاريخ ${when}. السقف هو الي بيخلي التنبيه له قيمة — ما بينحايد من هون.`;
}

/**
 * The alert body. Deliberately NOT shaped like the digest: one lot, a 🔥
 * header, and the admin's reason as its own line directly under the name.
 *
 * Someone scanning a WhatsApp list should be able to tell these two apart
 * without opening either.
 */
function renderFeaturedAlert({ auction, reason, lang = 'ar' }) {
  if (!auction) return null;
  const isAr = lang !== 'en';
  const title = String(auction.title || '').trim() || (isAr ? 'قطعة مميزة' : 'Featured listing');
  const clean = String(reason ?? '').trim();
  if (!clean) return null;

  const endMs = toMs(auction.endsAt);
  const when = endMs
    ? (isAr ? `بينتهي ${formatAmmanClock(endMs)}` : `ends ${formatAmmanClock(endMs)}`)
    : (isAr ? 'بينتهي قريباً' : 'ending soon');

  const lines = [
    isAr ? '🔥 مزاد مميز' : '🔥 Featured auction',
    '',
    title,
    clean,
    '',
    `${isAr ? 'يبدأ من' : 'from'} ${money(startingPriceUnits(auction), isAr)} · ${when}`,
    auctionUrl(auction.id),
    '',
    isAr ? OPT_OUT_AR : OPT_OUT_EN,
  ];
  return lines.join('\n');
}

module.exports = {
  FEATURED_TYPE,
  FEATURED_MAX_PER_WINDOW,
  FEATURED_WINDOW_MS,
  REASON_MIN,
  REASON_MAX,
  validateReason,
  recentBroadcasts,
  isFeaturedCapped,
  nextAllowedAt,
  capMessage,
  formatAmmanDate,
  renderFeaturedAlert,
};
