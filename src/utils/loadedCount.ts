/**
 * Counts taken from a PAGINATED list, stated honestly.
 *
 * THE BUG THIS EXISTS FOR. The Discover feed loads live lots a page at a time
 * (`PAGE = 24` in discoverQuery.ts) and two places rendered `liveItems.length`
 * as if it were the number of live auctions: the "مباشر الآن" section badge and
 * the spotlight strip. With more than 24 live lots, both sat on 24 forever —
 * the count never moved, no matter how many lots were actually running, because
 * it was reporting how many had been FETCHED.
 *
 * It is the same defect AppContext.tsx already documents for the admin auction
 * directory: "a silent cap reads as 'this is everything'". There it was solved
 * with a true server count. Here it cannot be, and the reason is worth writing
 * down so nobody tries:
 *
 *   The live section is `where(status == 'live')` on the server MINUS
 *   `isAwaitingFirstBidDoc` applied in the browser. Lots awaiting their first
 *   bid are live by status but belong to a different section. A
 *   getCountFromServer on `status == 'live'` therefore counts lots this section
 *   does not show, and the predicate that excludes them reads four fields —
 *   including absent ones, which Firestore equality cannot match. A count query
 *   here would be confidently wrong, which is worse than the cap.
 *
 * So these render what is actually known: an exact number once everything is
 * loaded, and a floor ("24+") while more remain. Never a number we cannot
 * stand behind.
 */

/**
 * Badge form. `24` when the list is complete, `24+` when more remain.
 *
 * Returned as a plain string; render it inside `dir="ltr"` so the `+` stays on
 * the right of the digits in an RTL layout.
 */
export function loadedCountBadge(loaded: number, hasMore: boolean): string {
  const n = Math.max(0, Math.floor(Number(loaded) || 0));
  return hasMore ? `${n}+` : String(n);
}

/**
 * Arabic counted nouns, which do not work the way English plurals do — the same
 * trap as `arabicHours` in constants/cliqGateway.ts. The previous code here was
 * `length === 1 ? 'مزاد' : 'مزادات'`, which produces «2 مزادات» and
 * «11 مزادات», both wrong.
 *
 *   1      مزاد واحد   -> bare singular, no numeral
 *   2      مزادان      -> the dual, no numeral
 *   3-10   N مزادات    -> plural
 *   11+    N مزاداً     -> singular again after the numeral
 */
export function arabicAuctions(n: number): string {
  if (n === 1) return 'مزاد واحد';
  if (n === 2) return 'مزادان';
  if (n >= 3 && n <= 10) return `${n} مزادات`;
  return `${n} مزاداً`;
}

/**
 * The spotlight strip's sentence.
 *
 * When more remain, the count is a floor and the sentence says so rather than
 * appending a bare `+` to an Arabic counted noun — «أكثر من 24 مزاد» reads, and
 * «24+ مزادات» does not. The numeral form after «أكثر من» is the singular.
 */
export function liveNowPhrase(loaded: number, hasMore: boolean, isAr: boolean): string {
  const n = Math.max(0, Math.floor(Number(loaded) || 0));
  if (!isAr) {
    const noun = n === 1 ? 'auction' : 'auctions';
    return hasMore ? `Live now — ${n}+ ${noun}` : `Live now — ${n} ${noun}`;
  }
  return hasMore
    ? `مباشر الآن — أكثر من ${n} مزاد`
    : `مباشر الآن — ${arabicAuctions(n)}`;
}
