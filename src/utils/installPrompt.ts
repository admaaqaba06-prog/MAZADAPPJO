// Add-to-Home-Screen (A2HS) install-hint logic — pure + SSR-safe helpers.
//
// iOS Safari NEVER fires `beforeinstallprompt`, so the only way to help those
// users install is an INSTRUCTIONAL hint ("tap Share → Add to Home Screen").
// Android/Chromium DO fire `beforeinstallprompt`, which we can capture and
// replay with a real one-tap Install button. These helpers keep all the
// environment-sniffing in one testable place so the React component stays thin.

/** localStorage key for a permanent user dismissal of the install hint. */
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

/** Has the user permanently dismissed the hint before? SSR/quota-safe. */
export function isDismissed(
  storage: Pick<Storage, 'getItem'> | undefined =
    typeof localStorage !== 'undefined' ? localStorage : undefined
): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(A2HS_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

/** Persist a permanent dismissal. Never throws (private mode / quota). */
export function persistDismissal(
  storage: Pick<Storage, 'setItem'> | undefined =
    typeof localStorage !== 'undefined' ? localStorage : undefined
): void {
  if (!storage) return;
  try {
    storage.setItem(A2HS_DISMISSED_KEY, '1');
  } catch {
    /* best-effort — a failed write just means the hint may reappear next visit */
  }
}

export type InstallMode = 'native' | 'ios' | null;

/**
 * The single source of truth for what (if anything) to show. ALL gating
 * conditions live here so they can be tested without a DOM:
 *  - already installed / standalone  → never show
 *  - previously dismissed            → never show
 *  - a captured beforeinstallprompt  → 'native' (real one-tap Install button)
 *  - iOS Safari (no prompt event)    → 'ios' (instructional hint)
 *  - anything else                   → null
 */
export function resolveInstallMode(params: {
  standalone: boolean;
  dismissed: boolean;
  hasDeferredPrompt: boolean;
  iosSafari: boolean;
}): InstallMode {
  const { standalone, dismissed, hasDeferredPrompt, iosSafari } = params;
  if (standalone || dismissed) return null;
  if (hasDeferredPrompt) return 'native';
  if (iosSafari) return 'ios';
  return null;
}
