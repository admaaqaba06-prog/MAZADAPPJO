/**
 * Human-readable order references — the client twin.
 *
 * `functions/orderRef.js` is the server twin and MUST keep IDENTICAL char-mapping
 * logic (alphabet, format, validation, normalization). Only the default RNG
 * source differs by platform: browser `crypto.getRandomValues` here,
 * `crypto.randomInt` on the server.
 *
 * The alphabet deliberately excludes 0 O 1 I L so a ref read off a screen or a
 * WhatsApp message can't be mistyped into a different-but-valid ref.
 */
export const ORDER_REF_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

const ORDER_REF_RE = /^MZ-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}$/;

/** Injectable index picker: returns an int in [0, max). */
export type IndexPicker = (max: number) => number;

const cryptoPick: IndexPicker = (max) =>
  crypto.getRandomValues(new Uint32Array(1))[0] % max;

/**
 * Build a ref: `'MZ-' + 5 chars` drawn from ORDER_REF_ALPHABET.
 * `pick` is injectable so reservation/collision tests can force a fixed ref.
 */
export function generateOrderRef(pick: IndexPicker = cryptoPick): string {
  let out = '';
  for (let i = 0; i < 5; i++) {
    out += ORDER_REF_ALPHABET[pick(ORDER_REF_ALPHABET.length)];
  }
  return 'MZ-' + out;
}

export function isValidOrderRef(s: string): boolean {
  return ORDER_REF_RE.test(s);
}

/**
 * Coerce user-typed input toward a canonical ref: trim, uppercase, strip
 * spaces, ensure a single `MZ-` prefix.
 */
export function normalizeOrderRefInput(s: string): string {
  let v = String(s).trim().toUpperCase().replace(/\s+/g, '');
  // Strip any leading MZ / MZ- (spaces are already gone, so `mz 7k3qp` → `MZ7K3QP`
  // must have its bare `MZ` recognized as the prefix, and `MZ-MZ-` collapses to one).
  v = v.replace(/^(MZ-?)+/, '');
  return 'MZ-' + v;
}

/** What to show a user: the ref if present, else a short id fallback. */
export function displayOrderRef(order: { orderRef?: string; id?: string }): string {
  if (typeof order.orderRef === 'string' && order.orderRef.length > 0) {
    return order.orderRef;
  }
  return '#' + String(order.id || '').substring(0, 8).toUpperCase();
}
