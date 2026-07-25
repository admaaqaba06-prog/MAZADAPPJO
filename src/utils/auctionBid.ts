export function validateCustomBid(amount: number, minNext: number):
  { ok: true; amount: number } | { ok: false; reason: 'too_low' | 'invalid' } {
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: 'invalid' };
  if (amount < minNext) return { ok: false, reason: 'too_low' };
  return { ok: true, amount };
}
export function resolveActiveAuctionId(
  activeAuctionId: string | null | undefined,
  liveAuctions: { id: string }[]
): string | null {
  if (activeAuctionId && liveAuctions.some(a => a.id === activeAuctionId)) return activeAuctionId;
  return liveAuctions[0]?.id ?? null;
}
