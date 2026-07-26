/** Bilingual label for an auction's `condition` (AuctionItem.condition).
 *
 * Fails CLOSED, the same way utils/viewing.ts does: only the two values we
 * actually recognise ('new' / 'used') produce a label. Unset, null, or anything
 * unrecognised returns null and the caller omits the chip entirely — a lot whose
 * condition we do not know must not be shown to a buyer as if we did.
 *
 * Extracted because the mobile chip row (MobileAuctionView) and the desktop
 * product-info row (DesktopLiveAuctionLayout) both render it, and two copies of
 * a buyer-facing label are two chances to drift. Matching is exact and
 * lowercase, mirroring what the sell forms write.
 */
export function conditionLabel(
  condition: string | null | undefined,
  isAr: boolean,
): string | null {
  if (condition === 'new') return isAr ? 'جديد' : 'New';
  if (condition === 'used') return isAr ? 'مستعمل' : 'Used';
  return null;
}
