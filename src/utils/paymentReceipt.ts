/**
 * Receipt-URL normalization for the Verify & Approve queues. The codebase
 * stores the CliQ receipt under five different field names depending on the
 * flow's era; every consumer used to repeat the fallback chain inline. This is
 * the one place that knows the chain.
 */
const RECEIPT_FIELDS = ['receiptUrl', 'paymentProofUrl', 'paymentProofImage', 'proofUrl', 'paymentImageUrl'] as const;

export function normalizeReceiptUrl(record: Record<string, any>): string | null {
  for (const f of RECEIPT_FIELDS) {
    const v = record?.[f];
    if (typeof v === 'string' && /^https?:\/\//i.test(v.trim())) return v.trim();
  }
  return null;
}

/**
 * Duplicate identity = the URL minus its query string: Firebase Storage
 * download tokens vary, the object path doesn't. Honest limitation: this
 * catches the SAME storage object referenced twice, not two separate uploads
 * of the same screenshot (no content hashing).
 */
export function receiptFingerprint(url: string | null): string | null {
  if (!url) return null;
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

/**
 * The Verify & Approve order-payments queue predicate: receipt attached, not
 * yet admin-verified, and in a reviewable status ('waiting_payment' covers the
 * buyer's self-claim flow, 'paid' covers legacy/manual-marked orders). Shared
 * by the section's queue and the dashboard's pending-count badge so the two
 * can never diverge.
 */
const ORDER_PAYMENT_REVIEW_STATUSES: readonly string[] = ['waiting_payment', 'paid'];

export function isPendingOrderPayment(order: Record<string, any>): boolean {
  return (
    !!normalizeReceiptUrl(order) &&
    order?.paymentVerified !== true &&
    ORDER_PAYMENT_REVIEW_STATUSES.includes(order?.status)
  );
}

export function findDuplicateFingerprints(records: { id: string; url: string | null }[]): Set<string> {
  const seen = new Map<string, Set<string>>(); // fingerprint -> record ids
  for (const r of records) {
    const fp = receiptFingerprint(r.url);
    if (!fp) continue;
    if (!seen.has(fp)) seen.set(fp, new Set());
    seen.get(fp)!.add(r.id);
  }
  return new Set([...seen.entries()].filter(([, ids]) => ids.size >= 2).map(([fp]) => fp));
}
