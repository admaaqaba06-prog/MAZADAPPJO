// Jordanian mobile numbers are 9 digits national, starting with 7 (07XXXXXXXX locally).
// Normalize common input shapes to E.164: +9627XXXXXXXX.
export function toE164Jordan(input: string): string | null {
  if (!input) return null;
  let d = input.replace(/[^\d]/g, ''); // strip spaces, +, dashes
  // strip international prefix down to the national number...
  if (d.startsWith('00962')) d = d.slice(5);
  else if (d.startsWith('962')) d = d.slice(3);
  // ...then strip a local leading 0 (handles both "0791..." and "+962 0791...") — NOT else-if
  if (d.startsWith('0')) d = d.slice(1);
  // national mobile must now be 9 digits starting with 7
  if (!/^7\d{8}$/.test(d)) return null;
  return `+962${d}`;
}
