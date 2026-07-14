export function buildAuctionUrl(auctionId: string, origin: string): string {
  const base = origin.replace(/\/+$/, '');
  return `${base}/?auction=${encodeURIComponent(auctionId)}`;
}

export function parseAuctionIdFromSearch(search: string): string | null {
  if (!search) return null;
  const params = new URLSearchParams(search);
  const id = params.get('auction');
  const trimmed = id?.trim();
  return trimmed ? trimmed : null;
}
