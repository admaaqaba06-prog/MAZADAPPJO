/**
 * Theme preference persistence.
 *
 * Deliberately mirrors `languagePersistence.ts` function for function: it is the
 * same problem (a preference chosen before sign-in must survive sign-in without
 * clobbering the account's own value) and it was solved once already. A second,
 * differently-shaped solution to an identical problem is how the two drift.
 */
export type Theme = 'dark' | 'light';

export type ThemeSession = { isAuthenticated?: boolean; userId?: unknown };
export type ThemePatch = { theme: Theme };

export const THEME_STORAGE_KEY = 'mazad.theme';

/**
 * Dark, for everyone, including a first visit. `prefers-color-scheme` is
 * ignored ON PURPOSE — following the OS would leave some first-time visitors on
 * light, which is the inconsistency this feature exists to remove.
 */
export const DEFAULT_THEME: Theme = 'dark';

const UNAUTHENTICATED_ID = 'unauthenticated';

/** Anything that is not exactly 'light' or 'dark' resolves to the default. */
export function normalizeTheme(theme: unknown): Theme {
  return theme === 'light' || theme === 'dark' ? theme : DEFAULT_THEME;
}

/** True only for a signed-in session holding a real user document id. */
export function canPersistTheme(session: ThemeSession | null | undefined): boolean {
  if (!session || session.isAuthenticated !== true) return false;
  const uid = session.userId;
  if (typeof uid !== 'string') return false;
  const trimmed = uid.trim();
  return trimmed.length > 0 && trimmed !== UNAUTHENTICATED_ID;
}

/**
 * A theme stored on the user document, or null when the document carries no
 * real preference. Junk counts as ABSENT — nobody expressed it, so letting a
 * real local choice replace it is an improvement rather than a loss.
 */
export function storedDocTheme(docTheme: unknown): Theme | null {
  return docTheme === 'light' || docTheme === 'dark' ? docTheme : null;
}

/**
 * Whether a signed-in user's document should ADOPT the theme this browser holds.
 *
 * `storedTheme` must be the RAW localStorage value, and null when the key is
 * absent. Absence is the signal the visitor never chose: the app boots dark
 * without writing the key, so a missing key is a default and a present key is an
 * expressed preference. Adopting a defaulted value would make every visitor
 * write the field once for no reason.
 *
 * Only adopts when the document has NO theme of its own — a document that
 * already says 'light' or 'dark' holds a deliberate choice, possibly made on
 * another device more recently than this browser's. Server wins; absence does not.
 */
export function shouldAdoptLocalTheme(args: {
  session: ThemeSession | null | undefined;
  storedTheme: unknown;
  docTheme: unknown;
  alreadyAdopted?: boolean;
}): boolean {
  if (args.alreadyAdopted === true) return false;
  if (!canPersistTheme(args.session)) return false;
  if (storedDocTheme(args.docTheme) !== null) return false;
  return args.storedTheme === 'light' || args.storedTheme === 'dark';
}

/**
 * Fire-and-forget persistence. Never throws, never returns a promise: the caller
 * is a UI handler that has already flipped the theme locally, and nothing it
 * does afterwards may depend on the network.
 *
 * @returns whether a write was attempted — false means signed out, not an error.
 */
export function persistThemePreference(
  session: ThemeSession | null | undefined,
  theme: unknown,
  writeDoc: (uid: string, patch: ThemePatch) => unknown,
  onError?: (err: unknown) => void,
): boolean {
  if (!canPersistTheme(session)) return false;
  const uid = String(session!.userId).trim();
  const report = (err: unknown) => {
    try {
      if (onError) onError(err);
    } catch (_) {
      // Reporting a failure must not itself become a failure.
    }
  };
  try {
    const result = writeDoc(uid, { theme: normalizeTheme(theme) });
    // `.catch` rather than `await`: awaiting would make the caller async and put
    // the network on the path of a UI toggle that has already applied.
    if (result && typeof (result as Promise<unknown>).catch === 'function') {
      (result as Promise<unknown>).catch(report);
    }
  } catch (err) {
    report(err);
  }
  return true;
}
