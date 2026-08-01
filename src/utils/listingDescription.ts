/**
 * The floor under a seller-written auction description.
 *
 * Measured 2026-08-01: of 115 real auctions, ZERO carried a real description.
 * 13 held the string `Premium Lot: {title}` that ListingWizardView invented
 * because it had no input field, and the other 102 held pasted product names.
 * Mobile's `التفاصيل` section was not broken — it was faithfully rendering a
 * duplicate of the title.
 *
 * MJ chose required-with-a-minimum over optional-but-prompted, with the risk
 * stated: a seller who does not want to write one will type filler to clear the
 * floor. The minimum guarantees SOMETHING, not quality. 20 characters is low
 * enough for one honest sentence and already excludes a bare product name —
 * `iPhone 17 pro max` is 17.
 */
export const DESCRIPTION_MIN = 20;

export interface DescriptionCheck {
  ok: boolean;
  /** Present only when `ok` is false; the exact string the caller shows. */
  message?: string;
}

export function validateDescription(raw: string, isAr: boolean): DescriptionCheck {
  const text = String(raw ?? '').trim();
  if (text.length >= DESCRIPTION_MIN) return { ok: true };
  return {
    ok: false,
    message: isAr
      ? `اكتب وصفاً للمنتج لا يقل عن ${DESCRIPTION_MIN} حرفاً — الحالة، ما يشمله البيع، وأي عيب.`
      : `Write a description of at least ${DESCRIPTION_MIN} characters — condition, what's included, and any flaw.`,
  };
}
