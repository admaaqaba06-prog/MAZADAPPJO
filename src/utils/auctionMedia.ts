/**
 * Wave 2 (live-room UX): pure gallery-source resolver shared by the mobile
 * reel and the desktop media column.
 *
 * Order: video (if any) first, then the cover thumbnail (legacy `imageUrl`
 * fallback), then the ordered `mediaUrls` gallery, then any concierge extra
 * photos — de-duplicated by url and empty-safe, so a thumbnail that was also
 * written into `mediaUrls` never renders twice.
 */

export interface AuctionMediaItem {
  type: 'video' | 'image';
  url: string;
}

interface AuctionMediaSource {
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  /** Legacy field some older docs carry instead of thumbnailUrl. */
  imageUrl?: string | null;
  mediaUrls?: (string | null | undefined)[] | null;
  conciergePhotos?: (string | null | undefined)[] | null;
}

const clean = (url: unknown): string | null => {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  return trimmed === '' ? null : trimmed;
};

export function getAuctionMedia(
  auction: AuctionMediaSource | null | undefined
): AuctionMediaItem[] {
  if (!auction) return [];

  const items: AuctionMediaItem[] = [];
  const seen = new Set<string>();

  const push = (type: 'video' | 'image', rawUrl: unknown) => {
    const url = clean(rawUrl);
    if (!url || seen.has(url)) return;
    seen.add(url);
    items.push({ type, url });
  };

  push('video', auction.videoUrl);
  push('image', clean(auction.thumbnailUrl) ?? auction.imageUrl);
  for (const url of auction.mediaUrls ?? []) push('image', url);
  for (const url of auction.conciergePhotos ?? []) push('image', url);

  return items;
}
