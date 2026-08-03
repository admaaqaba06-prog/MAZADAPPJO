/**
 * What the sign-in screen's activity block is allowed to show.
 *
 * Pure and props-shaped so the panel that consumes it can be rendered in a node
 * test (vitest here is `environment: 'node'` — no jsdom).
 *
 * The sign-in screen is the first full-attention moment the product gets, which
 * makes it the surface most likely to grow invented content. It shows real
 * inventory or it shows nothing.
 */
import type { LandingAuction, LandingAuctionsState } from '../landing/useLandingAuctions';

export const PANEL_LOT_CAP = 3;

/**
 * A lot the panel can render without inventing anything.
 *
 * Deliberately NOT `LandingAuction`: that type carries `endTime`, `totalBids`,
 * `isFeatured` and more, and a component cannot render a countdown from a field
 * it was never given. The narrow shape is the guarantee.
 */
export interface PanelLot {
  id: string;
  title: string;
  imageUrl: string;
  currentPrice: number;
}

export interface PanelActivity {
  /**
   * Every live lot the query returned — NOT the number rendered. States the size
   * of the marketplace, so it is never padded, rounded, or reduced to the
   * handful that happen to carry an image.
   */
  count: number;
  lots: PanelLot[];
}

/**
 * A card missing its image, title or price reads as broken, and a broken card on
 * this screen implies a broken marketplace. Skip it rather than render it.
 *
 * A price of ZERO is renderable: an opening lot with no bids yet is real
 * inventory, and most of this marketplace's lots are exactly that.
 */
export function isRenderableLot(lot: LandingAuction): boolean {
  if (!lot) return false;
  const hasImage = typeof lot.imageUrl === 'string' && lot.imageUrl.trim() !== '';
  const hasTitle = typeof lot.title === 'string' && lot.title.trim() !== '';
  const hasPrice = typeof lot.currentPrice === 'number' && Number.isFinite(lot.currentPrice);
  return hasImage && hasTitle && hasPrice;
}

/**
 * `null` means RENDER NOTHING.
 *
 * Loading, empty, errored and nothing-renderable all collapse to that one
 * signal, deliberately. If the panel could tell "still coming" from "none" it
 * would eventually grow a skeleton, and a skeleton promises content that may
 * never arrive. One signal makes that impossible rather than merely discouraged.
 *
 * `PanelLot` carries no clock. Measured on production 2026-08-03: 149 lots are
 * `status: 'live'` and only 4 hold a future `endTime`, so a countdown would be
 * absent or wrong on ~97% of inventory.
 */
export function selectPanelActivity(
  state: LandingAuctionsState,
  cap: number = PANEL_LOT_CAP
): PanelActivity | null {
  if (!state) return null;
  if (state.isLoading || state.isError || state.isEmpty) return null;

  const all = Array.isArray(state.auctions) ? state.auctions : [];
  if (all.length === 0) return null;

  const lots = all
    .filter(isRenderableLot)
    .slice(0, cap)
    .map((l) => ({
      id: l.id,
      title: l.title.trim(),
      imageUrl: l.imageUrl,
      currentPrice: l.currentPrice,
    }));

  // A count with no lots under it looks like a failed render, not a busy market.
  if (lots.length === 0) return null;

  return { count: all.length, lots };
}
