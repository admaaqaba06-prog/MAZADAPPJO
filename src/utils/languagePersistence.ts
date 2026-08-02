/**
 * Persisting the language toggle to `users/{uid}.language`.
 *
 * Until this shipped, the toggle wrote ONLY to `localStorage`, which the server
 * cannot read. Cloud Functions pick a recipient's language with `resolveLang`
 * (`functions/messageCopy.js`) off the user doc, so every in-app, WhatsApp and
 * email message resolved to the Arabic default no matter what the customer had
 * chosen in the app. This module is the client half of that contract.
 *
 * Two rules the toggle must never break:
 *
 * 1. **The write is best-effort.** The UI has already switched by the time this
 *    runs; a failed write must not throw, must not reject, and must not leave
 *    the interface in the old language. The next toggle retries.
 * 2. **Signed out writes nothing.** A logged-out visitor's `currentUser.id` is
 *    the sentinel `'unauthenticated'` — truthy, and NOT a document anyone may
 *    write. `firestore.rules` would reject it, but the request should never
 *    leave the client in the first place.
 */

/** The only two values the server understands. */
export type Language = 'ar' | 'en';

/** The `currentUser.id` a logged-out session carries. Never a real document. */
export const UNAUTHENTICATED_ID = 'unauthenticated';

export interface LanguageSession {
  isAuthenticated?: boolean;
  userId?: string | null;
}

/**
 * The shape written to the user doc. Exactly one field, always.
 *
 * A type alias, NOT an interface: Firestore's `updateDoc` takes
 * `UpdateData<DocumentData>`, which carries an index signature, and TypeScript
 * only grants an implicit index signature to aliases. As an interface this
 * fails `tsc --noEmit`.
 */
export type LanguagePatch = {
  language: Language;
};

/**
 * Mirrors `resolveLang` in `functions/messageCopy.js`: English only on an exact
 * `'en'`, everything else Arabic. Guarantees the persisted value round-trips
 * through the server reader — `src/utils/languagePersistence.test.ts` runs both
 * implementations over the same inputs so they cannot drift.
 */
export function normalizeLanguage(lang: unknown): Language {
  return lang === 'en' ? 'en' : 'ar';
}

/** True only for a signed-in session holding a real user document id. */
export function canPersistLanguage(session: LanguageSession | null | undefined): boolean {
  if (!session || session.isAuthenticated !== true) return false;
  const uid = session.userId;
  if (typeof uid !== 'string') return false;
  const trimmed = uid.trim();
  return trimmed.length > 0 && trimmed !== UNAUTHENTICATED_ID;
}

/**
 * Fire-and-forget persistence of the language preference.
 *
 * Never throws and never returns a promise: the caller is a UI event handler
 * that has already flipped the language locally, and nothing it does afterwards
 * may depend on the network. A synchronous throw from `writeDoc`, a rejected
 * promise, or a `writeDoc` that returns something other than a promise are all
 * routed to `onError` and swallowed.
 *
 * @returns whether a write was attempted — false means signed out, which is not
 *          an error.
 */
export function persistLanguagePreference(
  session: LanguageSession | null | undefined,
  lang: unknown,
  writeDoc: (uid: string, patch: LanguagePatch) => unknown,
  onError?: (err: unknown) => void
): boolean {
  if (!canPersistLanguage(session)) return false;
  const uid = String(session!.userId).trim();
  const report = (err: unknown) => {
    try {
      if (onError) onError(err);
    } catch (_) {
      // Reporting a failure must not itself become a failure.
    }
  };
  try {
    const result = writeDoc(uid, { language: normalizeLanguage(lang) });
    // `.catch` rather than `await`: awaiting here would make the caller async
    // and hand an unhandled rejection back to the event handler.
    if (result && typeof (result as Promise<unknown>).catch === 'function') {
      (result as Promise<unknown>).catch(report);
    }
  } catch (err) {
    report(err);
  }
  return true;
}
