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
 * A language stored on the user document, or `null` when the document carries
 * no real preference.
 *
 * Junk counts as ABSENT, deliberately. `resolveLang` already treats `'fr'`,
 * `'EN'`, `7` and `{}` as Arabic, so such a value is not a preference anyone
 * expressed — it is noise, and letting a real local choice replace it is an
 * improvement rather than a loss.
 */
export function storedDocLanguage(docLanguage: unknown): Language | null {
  return docLanguage === 'en' || docLanguage === 'ar' ? docLanguage : null;
}

/**
 * Whether a signed-in user's document should ADOPT the language this browser
 * already holds.
 *
 * The gap this closes: someone switches the landing page to English, then signs
 * up. `setLanguage` only writes the user document when a session exists, so the
 * choice they made seconds earlier lived in `localStorage` alone and every
 * WhatsApp, email and notification kept arriving in Arabic until they toggled a
 * SECOND time while logged in.
 *
 * Only adopts when the document has NO language of its own. A document that
 * already says `'ar'` or `'en'` holds a deliberate choice — possibly made on
 * another device more recently than this browser's — and overwriting it with
 * whatever this `localStorage` happens to contain would trade one silent wrong
 * language for another. Server wins; absence does not.
 *
 * `storedLanguage` must be the RAW `localStorage` value, and `null` when the key
 * is absent. Absence is the signal that the visitor never chose: the app boots
 * to Arabic without writing the key, so a missing key is a default and a present
 * key is an expressed preference. Passing a defaulted `'ar'` here would make
 * every signed-in Arabic reader write the field once for no reason.
 */
export function shouldAdoptLocalLanguage(args: {
  session: LanguageSession | null | undefined;
  storedLanguage: unknown;
  docLanguage: unknown;
  alreadyAdopted?: boolean;
}): boolean {
  if (args.alreadyAdopted === true) return false;
  if (!canPersistLanguage(args.session)) return false;
  if (storedDocLanguage(args.docLanguage) !== null) return false;
  // Only an explicit, valid local choice is worth writing.
  return args.storedLanguage === 'en' || args.storedLanguage === 'ar';
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
