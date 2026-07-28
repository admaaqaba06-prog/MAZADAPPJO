export function normalizePaymentRef(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

export function isValidPaymentRef(raw: string): boolean {
  return normalizePaymentRef(raw).length >= 4;
}
