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

export function validateDescription(raw: string | null | undefined, isAr: boolean): DescriptionCheck {
  // Nullish coerces to empty, not to the text "null"/"undefined".
  const text = String(raw ?? '').trim();
  if (text.length >= DESCRIPTION_MIN) return { ok: true };
  return {
    ok: false,
    message: isAr
      ? `اكتب وصفاً للمنتج لا يقل عن ${DESCRIPTION_MIN} حرفاً — الحالة، ما يشمله البيع، وأي عيب.`
      : `Write a description of at least ${DESCRIPTION_MIN} characters — condition, what's included, and any flaw.`,
  };
}

/**
 * Should the description section render at all?
 *
 * Four surfaces print a description directly beneath the title — the mobile
 * lot view, the details modal, the desktop bidding aside and the reels right
 * panel — and each carried its own inline copy of this rule. One predicate,
 * because four copies of a display rule is how they come to disagree.
 *
 * Measured against production on 2026-08-04, over 264 real (non-simulated)
 * auctions:
 *
 *   246  description is an exact echo of the title   → suppressed
 *    14  `معروض مميز: {title}` / `Premium Lot: …`     → suppressed (issue #216)
 *     3  title plus a trailing word ("… usd")        → KEPT
 *     2  a genuine spec list                         → KEPT
 *
 * Those last two are the only real descriptions in the database, which is why
 * this stays narrow: it suppresses what is provably machine-written or an exact
 * duplicate, and nothing else. A thin description is still the seller's.
 *
 * The fabricated prefixes are matched at the START only, and with the colon —
 * a real description opening with "معروض بحالة ممتازة" ("shown in excellent
 * condition") shares three letters with the fabrication and must survive.
 */
const FABRICATED_PREFIX = /^\s*(Premium Lot\s*:|معروض مميز\s*:)/;

export function isJunkDescription(
  description: string | null | undefined,
  title: string | null | undefined,
): boolean {
  const text = String(description ?? '').trim();
  if (!text) return true;
  if (FABRICATED_PREFIX.test(text)) return true;

  const heading = String(title ?? '').trim();
  // Whitespace-insensitive so a pasted copy carrying a stray newline or double
  // space still reads as the duplicate it is.
  const norm = (s: string) => s.replace(/\s+/g, ' ');
  return heading !== '' && norm(text) === norm(heading);
}
