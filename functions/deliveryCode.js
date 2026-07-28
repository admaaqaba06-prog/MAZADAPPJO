/**
 * Wave 3 — delivery codes: the string the seller writes on the parcel, which
 * must be legible in BOTH the seller's dispatch photo and the buyer's receipt
 * photo. Same code out, same code in — that match is the proof the network
 * produces for itself, with no admin in the loop.
 *
 * `src/utils/deliveryCode.ts` is the client twin and MUST keep IDENTICAL
 * validation + normalization: the buyer types the code and the server compares
 * normalized forms, so a disagreement would reject a correct code. Only this
 * file generates — the client never draws a code.
 *
 * The alphabet excludes 0 O 1 I: this code is handwritten on a box and read
 * back off a phone photo, so a glyph pair that can be confused would produce a
 * mismatch on a genuinely delivered order. It is byte-identical to
 * ORDER_REF_ALPHABET in orderRef.js — both codes can end up on the same parcel,
 * so they must share one glyph set. (Uppercase L is kept, as it is there.)
 *
 * The `DC-` prefix is deliberately NOT `MZ-` (the order reference, orderRef.js)
 * — the two appear on the same parcel and must never be mistaken for each other.
 */
const crypto = require('crypto');

const DELIVERY_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

const DELIVERY_CODE_RE = /^DC-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}$/;

const cryptoPick = (max) => crypto.randomInt(max);

/**
 * Build a code: `'DC-' + 5 chars` drawn from DELIVERY_CODE_ALPHABET.
 * `pick` is injectable so tests can force a fixed code.
 */
function generateDeliveryCode(pick = cryptoPick) {
  let out = '';
  for (let i = 0; i < 5; i++) {
    out += DELIVERY_CODE_ALPHABET[pick(DELIVERY_CODE_ALPHABET.length)];
  }
  return 'DC-' + out;
}

function isValidDeliveryCode(s) {
  return typeof s === 'string' && DELIVERY_CODE_RE.test(s);
}

/**
 * Coerce buyer-typed input toward a canonical code: trim, uppercase, strip
 * spaces and dashes, ensure a single `DC-` prefix. Never throws — junk in
 * yields a non-matching string, which the caller compares and rejects.
 */
function normalizeDeliveryCodeInput(s) {
  let v = String(s).trim().toUpperCase().replace(/[\s-]+/g, '');
  v = v.replace(/^(DC)+/, '');
  return 'DC-' + v;
}

module.exports = {
  DELIVERY_CODE_ALPHABET,
  generateDeliveryCode,
  isValidDeliveryCode,
  normalizeDeliveryCodeInput,
};
