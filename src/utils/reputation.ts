export interface Reputation { average: number | null; count: number; }
interface AnyReview { direction?: string; stars?: number; buyerId?: string; vendorId?: string; }

export function computeReputation(
  reviews: AnyReview[] | null | undefined,
  opts: { subjectField: 'buyerId' | 'vendorId'; subjectId: string; directions: string[] },
): Reputation {
  const rows = (reviews || []).filter(
    (r) => r && opts.directions.includes(r.direction || '') &&
      (r as any)[opts.subjectField] === opts.subjectId &&
      Number.isFinite(Number(r.stars)),
  );
  if (rows.length === 0) return { average: null, count: 0 };
  const sum = rows.reduce((a, r) => a + Number(r.stars), 0);
  return { average: sum / rows.length, count: rows.length };
}

export function buyerReputation(
  reviews: AnyReview[] | null | undefined, buyerId: string, opts?: { includeAdmin?: boolean },
): Reputation {
  const directions = opts?.includeAdmin
    ? ['seller_rates_buyer', 'mazad_rates_buyer'] : ['seller_rates_buyer'];
  return computeReputation(reviews, { subjectField: 'buyerId', subjectId: buyerId, directions });
}

export function sellerReputation(reviews: AnyReview[] | null | undefined, sellerId: string): Reputation {
  return computeReputation(reviews, { subjectField: 'vendorId', subjectId: sellerId, directions: ['buyer_rates_auction'] });
}
