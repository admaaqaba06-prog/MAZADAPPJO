/**
 * Human-readable order references — the server twin.
 *
 * `src/utils/orderRef.ts` is the client twin and MUST keep IDENTICAL
 * char-mapping logic (alphabet, format, validation, normalization). Only the
 * default RNG source differs by platform: `crypto.randomInt` here,
 * browser `crypto.getRandomValues` on the client.
 *
 * The alphabet deliberately excludes 0 O 1 I L so a ref read off a screen or a
 * WhatsApp message can't be mistyped into a different-but-valid ref.
 */
const crypto = require('crypto');

const ORDER_REF_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

const ORDER_REF_RE = /^MZ-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}$/;

const cryptoPick = (max) => crypto.randomInt(max);

/**
 * Build a ref: `'MZ-' + 5 chars` drawn from ORDER_REF_ALPHABET.
 * `pick` is injectable so reservation/collision tests can force a fixed ref.
 */
function generateOrderRef(pick = cryptoPick) {
  let out = '';
  for (let i = 0; i < 5; i++) {
    out += ORDER_REF_ALPHABET[pick(ORDER_REF_ALPHABET.length)];
  }
  return 'MZ-' + out;
}

function isValidOrderRef(s) {
  return ORDER_REF_RE.test(s);
}

/**
 * Coerce user-typed input toward a canonical ref: trim, uppercase, strip
 * spaces, ensure a single `MZ-` prefix.
 */
function normalizeOrderRefInput(s) {
  let v = String(s).trim().toUpperCase().replace(/\s+/g, '');
  // Strip any leading MZ / MZ- (spaces are already gone, so `mz 7k3qp` → `MZ7K3QP`
  // must have its bare `MZ` recognized as the prefix, and `MZ-MZ-` collapses to one).
  v = v.replace(/^(MZ-?)+/, '');
  return 'MZ-' + v;
}

/** What to show a user: the ref if present, else a short id fallback. */
function displayOrderRef(order) {
  if (typeof order.orderRef === 'string' && order.orderRef.length > 0) {
    return order.orderRef;
  }
  return '#' + String(order.id || '').substring(0, 8).toUpperCase();
}

module.exports = {
  ORDER_REF_ALPHABET,
  generateOrderRef,
  isValidOrderRef,
  normalizeOrderRefInput,
  displayOrderRef,
};
