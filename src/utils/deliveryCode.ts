/**
 * Wave 3 — delivery-code twin (client).
 *
 * `functions/deliveryCode.js` is the server twin and owns generation. This file
 * MUST keep IDENTICAL validation + normalization: the buyer types the code into
 * the confirm form and the server compares NORMALIZED forms, so any drift here
 * rejects a correct code on a genuinely delivered order.
 *
 * No generator lives here on purpose — a client-drawn delivery code would be a
 * code the buyer knows without ever having seen the parcel.
 */
const DELIVERY_CODE_RE = /^DC-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}$/;

export function isValidDeliveryCode(s: unknown): boolean {
  return typeof s === 'string' && DELIVERY_CODE_RE.test(s);
}

export function normalizeDeliveryCodeInput(s: unknown): string {
  let v = String(s).trim().toUpperCase().replace(/[\s-]+/g, '');
  v = v.replace(/^(DC)+/, '');
  return 'DC-' + v;
}
