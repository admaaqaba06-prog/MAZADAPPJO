/**
 * Why a listing was sent back, phrased as the seller's next action.
 *
 * `rejectionReason` has been written on every reject and cleared on every
 * resubmit since the review gate shipped — and rendered NOWHERE. The seller saw
 * only the badge "مرفوض / Rejected" and had to guess what to change, which is
 * the whole reason a partner review reported listings sitting rejected with
 * nothing done about them.
 *
 * Presets are stored as their key; anything else is historical free text and is
 * echoed unchanged, so the seller-side render works for every doc already in
 * the database.
 */
export interface RejectionPreset {
  key: string;
  ar: string;
  en: string;
}

export const REJECTION_PRESETS: readonly RejectionPreset[] = [
  { key: 'wrong_category', ar: 'صحّح التصنيف', en: 'Fix the category' },
  { key: 'bad_photos', ar: 'أضف صوراً واضحة للمنتج', en: 'Add clear photos of the product' },
  { key: 'bad_title', ar: 'اكتب اسماً وصفياً للمنتج', en: 'Write a descriptive product name' },
  { key: 'prohibited', ar: 'هذا الصنف غير مسموح', en: 'This item is not allowed' },
] as const;

export function rejectionPresetLabel(reason: string, isAr: boolean): string {
  const hit = REJECTION_PRESETS.find(p => p.key === reason);
  if (!hit) return reason;
  return isAr ? hit.ar : hit.en;
}
