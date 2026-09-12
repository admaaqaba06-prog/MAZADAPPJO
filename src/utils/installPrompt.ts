// Add-to-Home-Screen (A2HS) install-hint logic — pure + SSR-safe helpers.
//
// iOS Safari NEVER fires `beforeinstallprompt`, so the only way to help those
// users install is an INSTRUCTIONAL hint ("tap Share → Add to Home Screen").
// Android/Chromium DO fire `beforeinstallprompt`, which we can capture and
// replay with a real one-tap Install button. These helpers keep all the
// environment-sniffing in one testable place so the React component stays thin.

/** localStorage key for the install-hint dismissal record. Holds a JSON
 *  {count, at}; a legacy '1' from the permanent-dismissal era still parses —
 *  see readDismissal(). */
export const A2HS_DISMISSED_KEY = 'mazad_a2hs_dismissed';

/** The `beforeinstallprompt` event shape (not in the DOM lib types). */
export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/**
 * Is the app already running as an installed / standalone PWA?
 * Checks the display-mode media query AND iOS Safari's non-standard
 * `navigator.standalone`. Guarded so it never throws under SSR / test node.
 */
export function isStandalone(
  win: (Window & { navigator: Navigator & { standalone?: boolean } }) | undefined =
    typeof window !== 'undefined' ? (window as never) : undefined
): boolean {
  if (!win) return false;
  try {
    if (typeof win.matchMedia === 'function' && win.matchMedia('(display-mode: standalone)').matches) {
      return true;
    }
  } catch {
    /* matchMedia can throw on ancient engines — treat as not-standalone */
  }
  return win.navigator?.standalone === true;
}

/**
 * iOS device? Covers iPhone/iPod/iPad plus iPadOS 13+, which masquerades as
 * "Macintosh" but is the only Mac UA with a multi-touch screen.
 */
export function isIOS(ua: string, maxTouchPoints = 0): boolean {
  if (/iphone|ipad|ipod/i.test(ua)) return true;
  return /macintosh/i.test(ua) && maxTouchPoints > 1;
}

/**
 * iOS Safari specifically — NOT Chrome (CriOS), Firefox (FxiOS), Edge (EdgiOS)
 * or an in-app webview. Only real Safari can "Add to Home Screen", so the hint
 * would be wrong (or the glyph missing) in the other iOS browsers.
 */
export function isIOSSafari(ua: string, maxTouchPoints = 0): boolean {
  if (!isIOS(ua, maxTouchPoints)) return false;
  if (/crios|fxios|edgios|opios|mercury/i.test(ua)) return false;
  return /safari/i.test(ua);
}

// ---------------------------------------------------------------------------
// DISMISSAL (CR-04)
//
// This used to be a single '1' meaning "never ask again", set on the first
// dismissal. That is a reasonable default and the wrong one for this app: on
// iOS, installing to the home screen is the ONLY way the user can ever receive
// a web push, so every permanent dismissal is a user locked out of the free
// notification channel for good on the strength of one badly-timed tap.
//
// The replacement is a snooze with a hard stop: dismissing hides the sheet for
// 14 days, and the third dismissal makes it permanent. Three asks is the point
// at which "they have not got round to it" becomes "they have said no".
// ---------------------------------------------------------------------------

/** Dismissals before the hint is retired for good. */
export const A2HS_MAX_DISMISSALS = 3;

/** How long one dismissal buys, in ms. */
export const A2HS_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

export interface DismissalState {
  /** How many times the sheet has been dismissed. */
  count: number;
  /** Epoch ms of the most recent dismissal; 0 when never dismissed. */
  at: number;
}

const EMPTY_DISMISSAL: DismissalState = { count: 0, at: 0 };

/**
 * Read the dismissal record, migrating the legacy `'1'` value.
 *
 * A legacy '1' was a PERMANENT dismissal under the old rules, and those users
 * did tap it. Migrating it to `count: 1` at the CURRENT time — rather than
 * count: 3, or an epoch-0 timestamp that expires instantly — gives them the
 * full 14 days of quiet from the moment they upgrade, and at most two more
 * asks over the following month. Treating it as a fresh install would nag
 * people who already declined; treating it as permanent would write off the
 * push channel for the entire existing user base.
 */
export function readDismissal(
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined =
    typeof localStorage !== 'undefined' ? localStorage : undefined,
  now: number = Date.now(),
): DismissalState {
  if (!storage) return EMPTY_DISMISSAL;
  try {
    const raw = storage.getItem(A2HS_DISMISSED_KEY);
    if (!raw) return EMPTY_DISMISSAL;
    if (raw === '1') {
      const migrated: DismissalState = { count: 1, at: now };
      try {
        storage.setItem(A2HS_DISMISSED_KEY, JSON.stringify(migrated));
      } catch {
        /* best-effort — worst case it migrates again next load */
      }
      return migrated;
    }
    const parsed = JSON.parse(raw);
    const count = Number(parsed?.count);
    const at = Number(parsed?.at);
    if (!Number.isFinite(count) || !Number.isFinite(at)) return EMPTY_DISMISSAL;
    return { count: Math.max(0, Math.trunc(count)), at: Math.max(0, at) };
  } catch {
    // Corrupt value, or storage that throws on read (Safari private mode).
    // Showing the hint is the safe failure here: it is dismissible.
    return EMPTY_DISMISSAL;
  }
}

/** Record a dismissal. Never throws (private mode / quota). */
export function persistDismissal(
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined =
    typeof localStorage !== 'undefined' ? localStorage : undefined,
  now: number = Date.now(),
): DismissalState {
  const prev = readDismissal(storage, now);
  const next: DismissalState = { count: prev.count + 1, at: now };
  if (!storage) return next;
  try {
    storage.setItem(A2HS_DISMISSED_KEY, JSON.stringify(next));
  } catch {
    /* best-effort — a failed write just means the hint may reappear next visit */
  }
  return next;
}

/**
 * Retire the hint for good because the app was INSTALLED.
 *
 * Distinct from persistDismissal on purpose: an install is not a dismissal,
 * and counting it as one would spend a strike on the single outcome the sheet
 * exists to produce. It writes the terminal count directly, so a user who
 * later uninstalls is not asked again either — they have seen the flow and
 * chosen; the sheet has nothing left to teach them.
 */
export function persistInstalled(
  storage: Pick<Storage, 'setItem'> | undefined =
    typeof localStorage !== 'undefined' ? localStorage : undefined,
  now: number = Date.now(),
): void {
  if (!storage) return;
  try {
    storage.setItem(A2HS_DISMISSED_KEY, JSON.stringify({ count: A2HS_MAX_DISMISSALS, at: now }));
  } catch {
    /* best-effort */
  }
}

/** Is the hint currently suppressed — snoozed, or retired for good? */
export function isSuppressed(state: DismissalState, now: number = Date.now()): boolean {
  if (state.count >= A2HS_MAX_DISMISSALS) return true;
  if (state.count === 0) return false;
  // A clock that has moved BACKWARDS since the dismissal (timezone change,
  // manual clock edit) would make the elapsed time negative and re-show the
  // sheet immediately. Clamp so a weird clock cannot turn into a nag.
  const elapsed = now - state.at;
  if (elapsed < 0) return true;
  return elapsed < A2HS_SNOOZE_MS;
}

/** Convenience: read + evaluate in one call. */
export function isDismissed(
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined =
    typeof localStorage !== 'undefined' ? localStorage : undefined,
  now: number = Date.now(),
): boolean {
  return isSuppressed(readDismissal(storage, now), now);
}

// ---------------------------------------------------------------------------
// WHEN THE SHEET HAS EARNED THE RIGHT TO APPEAR (CR-04)
//
// Not on first page load. A visitor who has seen one screen has no idea yet
// whether they want this on their home screen, and asking then is the ask most
// likely to be dismissed — which, under the rules above, spends one of only
// three chances.
// ---------------------------------------------------------------------------

/** localStorage: how many distinct sessions this browser has opened. */
export const A2HS_SESSIONS_KEY = 'mazad_a2hs_sessions';
/** sessionStorage: marks this session as already counted. */
export const A2HS_SESSION_MARK_KEY = 'mazad_a2hs_session_counted';
/** localStorage: the user did something that signals real intent (a first bid). */
export const A2HS_EARNED_KEY = 'mazad_a2hs_earned';

/**
 * Count this session exactly once. Returns the running total.
 *
 * The sessionStorage mark is what makes it once-per-session rather than
 * once-per-mount: React StrictMode double-invokes effects in development, and
 * a route change that remounts the shell would otherwise inflate the count and
 * show the sheet on the first visit after all.
 */
export function noteSession(
  local: Pick<Storage, 'getItem' | 'setItem'> | undefined =
    typeof localStorage !== 'undefined' ? localStorage : undefined,
  session: Pick<Storage, 'getItem' | 'setItem'> | undefined =
    typeof sessionStorage !== 'undefined' ? sessionStorage : undefined,
): number {
  if (!local) return 0;
  try {
    const prev = Math.max(0, Math.trunc(Number(local.getItem(A2HS_SESSIONS_KEY)) || 0));
    if (session && session.getItem(A2HS_SESSION_MARK_KEY) === '1') return prev;
    const next = prev + 1;
    local.setItem(A2HS_SESSIONS_KEY, String(next));
    if (session) session.setItem(A2HS_SESSION_MARK_KEY, '1');
    return next;
  } catch {
    return 0;
  }
}

/** Flag a meaningful action (CR-04 names the first bid). Idempotent. */
export function markInstallEarned(
  local: Pick<Storage, 'setItem'> | undefined =
    typeof localStorage !== 'undefined' ? localStorage : undefined,
): void {
  if (!local) return;
  try {
    local.setItem(A2HS_EARNED_KEY, '1');
  } catch {
    /* best-effort */
  }
}

/** Has a meaningful action been recorded? */
export function hasInstallEarnedFlag(
  local: Pick<Storage, 'getItem'> | undefined =
    typeof localStorage !== 'undefined' ? localStorage : undefined,
): boolean {
  if (!local) return false;
  try {
    return local.getItem(A2HS_EARNED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * The trigger rule: a meaningful action, OR the second session onwards.
 * Never the first page load of a first visit.
 */
export function hasEarnedPrompt(params: { sessionCount: number; didMeaningfulAction: boolean }): boolean {
  return params.didMeaningfulAction || params.sessionCount >= 2;
}

export type InstallMode = 'native' | 'ios' | null;

/**
 * The single source of truth for what (if anything) to show. ALL gating
 * conditions live here so they can be tested without a DOM:
 *  - already installed / standalone  → never show
 *  - snoozed, or dismissed 3 times   → never show
 *  - has not earned the ask yet      → never show (first load of a first visit)
 *  - a captured beforeinstallprompt  → 'native' (real one-tap Install button)
 *  - iOS Safari (no prompt event)    → 'ios' (instructional hint)
 *  - anything else                   → null
 */
export function resolveInstallMode(params: {
  standalone: boolean;
  dismissed: boolean;
  hasDeferredPrompt: boolean;
  iosSafari: boolean;
  /** Defaults to true so an older call site keeps its previous behaviour. */
  earned?: boolean;
}): InstallMode {
  const { standalone, dismissed, hasDeferredPrompt, iosSafari, earned = true } = params;
  if (standalone || dismissed) return null;
  if (!earned) return null;
  if (hasDeferredPrompt) return 'native';
  if (iosSafari) return 'ios';
  return null;
}
