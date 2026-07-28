/**
 * Pure resolver for a notification document's display content.
 *
 * Notification docs in the `notifications` collection carry per-language fields
 * (`titleAr`/`titleEn`, `descriptionAr`/`descriptionEn`) plus legacy flat
 * fields (`title`/`description`) written by older code paths.
 *
 * Rules:
 *  - Prefer the recipient `lang` fields.
 *  - If the recipient-language field is empty/missing, fall back to the OTHER
 *    language's field (so a doc that only has Arabic content still shows for an
 *    English recipient — and vice versa).
 *  - As a last resort, use the legacy flat field.
 *  - If nothing has content, return empty strings so the caller can drop the row.
 *
 * Empty-string and whitespace-only fields are treated as missing.
 */
export interface NotificationContentDoc {
  title?: string;
  titleAr?: string;
  titleEn?: string;
  description?: string;
  descriptionAr?: string;
  descriptionEn?: string;
}

function firstNonEmpty(...values: Array<string | undefined | null>): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return '';
}

export function resolveNotificationContent(
  doc: NotificationContentDoc,
  lang: 'ar' | 'en'
): { title: string; body: string } {
  const title = lang === 'ar'
    ? firstNonEmpty(doc.titleAr, doc.titleEn, doc.title)
    : firstNonEmpty(doc.titleEn, doc.titleAr, doc.title);

  const body = lang === 'ar'
    ? firstNonEmpty(doc.descriptionAr, doc.descriptionEn, doc.description)
    : firstNonEmpty(doc.descriptionEn, doc.descriptionAr, doc.description);

  return { title, body };
}
