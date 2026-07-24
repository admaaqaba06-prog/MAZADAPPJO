export type OptimisticBid =
  | { auctionId: string; price: number; bidderId: string; bidderName: string }
  | null;

const matches = (opt: OptimisticBid, auctionId: string): opt is Exclude<OptimisticBid, null> =>
  !!opt && opt.auctionId === auctionId;

/** Effective display price: the optimistic price wins only while it leads the doc. */
export function effectivePrice(docPrice: number, opt: OptimisticBid, auctionId: string): number {
  if (matches(opt, auctionId) && opt.price > docPrice) return opt.price;
  return docPrice;
}

/** True once the doc has caught up (or there's nothing/foreign to hold) — caller clears overlay. */
export function optimisticResolved(docPrice: number, opt: OptimisticBid, auctionId: string): boolean {
  if (!matches(opt, auctionId)) return true;
  return docPrice >= opt.price;
}
