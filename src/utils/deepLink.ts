export function buildAuctionUrl(auctionId: string, origin: string): string {
  const base = origin.replace(/\/+$/, '');
  return `${base}/auction/${encodeURIComponent(auctionId)}`;
}

/** Legacy reader: pull the auction id from a `?auction=<id>` query string. Kept
 *  so old shared links (and anything still passing a search string) resolve. */
export function parseAuctionIdFromSearch(search: string): string | null {
  if (!search) return null;
  const params = new URLSearchParams(search);
  const id = params.get('auction');
  const trimmed = id?.trim();
  return trimmed ? trimmed : null;
}

/** Pull the auction id from a `/auction/<id>` pathname (the current scheme). */
export function parseAuctionIdFromPath(pathname: string): string | null {
  if (!pathname) return null;
  const m = pathname.match(/^\/auction\/([^/]+)\/?$/);
  if (!m) return null;
  const id = decodeURIComponent(m[1]).trim();
  return id ? id : null;
}
