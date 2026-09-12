import { describe, it, expect } from 'vitest';
import {
  isIOS,
  isIOSSafari,
  isStandalone,
  isDismissed,
  persistDismissal,
  persistInstalled,
  readDismissal,
  isSuppressed,
  noteSession,
  markInstallEarned,
  hasInstallEarnedFlag,
  hasEarnedPrompt,
  resolveInstallMode,
  A2HS_DISMISSED_KEY,
  A2HS_MAX_DISMISSALS,
  A2HS_SNOOZE_MS,
} from './installPrompt';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1';
const IPAD_MASQ_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const MAC_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';

describe('isIOS', () => {
  it('detects iPhone Safari', () => expect(isIOS(IPHONE_SAFARI)).toBe(true));
  it('detects iPadOS masquerading as Mac when it has touch', () =>
    expect(isIOS(IPAD_MASQ_MAC, 5)).toBe(true));
  it('does NOT treat a real touchless Mac as iOS', () =>
    expect(isIOS(MAC_SAFARI, 0)).toBe(false));
  it('is false on Android', () => expect(isIOS(ANDROID_CHROME)).toBe(false));
});

describe('isIOSSafari', () => {
  it('is true for real iPhone Safari', () => expect(isIOSSafari(IPHONE_SAFARI)).toBe(true));
  it('is false for Chrome on iOS (CriOS) — it cannot Add to Home Screen', () =>
    expect(isIOSSafari(IPHONE_CHROME)).toBe(false));
  it('is true for iPadOS Safari masquerading as Mac (with touch)', () =>
    expect(isIOSSafari(IPAD_MASQ_MAC, 5)).toBe(true));
  it('is false on Android Chrome', () => expect(isIOSSafari(ANDROID_CHROME)).toBe(false));
});

describe('isStandalone', () => {
  it('is false when no window (SSR)', () => expect(isStandalone(undefined)).toBe(false));
  it('is true when display-mode media query matches', () => {
    const win = {
      matchMedia: (q: string) => ({ matches: q.includes('standalone') }),
      navigator: {},
    } as never;
    expect(isStandalone(win)).toBe(true);
  });
  it('is true via iOS navigator.standalone even without matchMedia match', () => {
    const win = {
      matchMedia: () => ({ matches: false }),
      navigator: { standalone: true },
    } as never;
    expect(isStandalone(win)).toBe(true);
  });
  it('is false in a normal browser tab', () => {
    const win = {
      matchMedia: () => ({ matches: false }),
      navigator: { standalone: false },
    } as never;
    expect(isStandalone(win)).toBe(false);
  });
});

describe('dismissal persistence', () => {
  const makeStore = () => {
    const map = new Map<string, string>();
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
    };
  };

  const T0 = 1_700_000_000_000;

  it('round-trips a dismissal under the documented key', () => {
    const store = makeStore();
    expect(isDismissed(store, T0)).toBe(false);
    persistDismissal(store, T0);
    expect(JSON.parse(store.getItem(A2HS_DISMISSED_KEY) as string)).toEqual({ count: 1, at: T0 });
    expect(isDismissed(store, T0)).toBe(true);
  });

  it('snoozes for 14 days rather than for ever', () => {
    // The old behaviour was permanent on the first tap. On iOS an installed
    // app is the ONLY way the user can ever receive a web push, so a single
    // badly-timed dismissal used to cost them that channel permanently.
    const store = makeStore();
    persistDismissal(store, T0);
    expect(isDismissed(store, T0 + A2HS_SNOOZE_MS - 1)).toBe(true);
    expect(isDismissed(store, T0 + A2HS_SNOOZE_MS + 1)).toBe(false);
  });

  it('stops asking permanently after the third dismissal', () => {
    const store = makeStore();
    let at = T0;
    for (let i = 0; i < A2HS_MAX_DISMISSALS; i++) {
      persistDismissal(store, at);
      at += A2HS_SNOOZE_MS * 2;
    }
    expect(readDismissal(store, at).count).toBe(A2HS_MAX_DISMISSALS);
    // Far past any snooze window — three refusals is a no.
    expect(isDismissed(store, at + A2HS_SNOOZE_MS * 100)).toBe(true);
  });

  it('migrates a legacy permanent dismissal into a snooze, not a fresh start', () => {
    // Those users really did tap dismiss. Re-asking them immediately would be
    // a nag; treating it as terminal would write off the entire existing user
    // base. One strike spent, 14 days of quiet from the upgrade.
    const store = makeStore();
    store.setItem(A2HS_DISMISSED_KEY, '1');
    expect(readDismissal(store, T0)).toEqual({ count: 1, at: T0 });
    expect(isDismissed(store, T0)).toBe(true);
    expect(isDismissed(store, T0 + A2HS_SNOOZE_MS + 1)).toBe(false);
    // And the migration is written back, so it does not re-baseline every load.
    expect(store.getItem(A2HS_DISMISSED_KEY)).not.toBe('1');
  });

  it('treats an install as terminal without spending a dismissal', () => {
    const store = makeStore();
    persistInstalled(store, T0);
    expect(readDismissal(store, T0).count).toBe(A2HS_MAX_DISMISSALS);
    expect(isDismissed(store, T0 + A2HS_SNOOZE_MS * 100)).toBe(true);
  });

  it('does not re-show when the clock has moved backwards', () => {
    // A timezone change or a manually corrected clock makes the elapsed time
    // negative, which would otherwise read as "the snooze expired".
    const store = makeStore();
    persistDismissal(store, T0);
    expect(isDismissed(store, T0 - A2HS_SNOOZE_MS * 5)).toBe(true);
  });

  it('shows the hint when the stored value is corrupt', () => {
    // Failing open is right here: the sheet is dismissible, and failing closed
    // would silently retire it for anyone whose storage got mangled.
    const store = makeStore();
    store.setItem(A2HS_DISMISSED_KEY, '{not json');
    expect(isSuppressed(readDismissal(store, T0), T0)).toBe(false);
  });

  it('is false (never throws) with no storage', () => {
    expect(isDismissed(undefined)).toBe(false);
    expect(() => persistDismissal(undefined)).not.toThrow();
    expect(() => persistInstalled(undefined)).not.toThrow();
  });
});

describe('when the ask is earned', () => {
  const makeStore = () => {
    const map = new Map<string, string>();
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
    };
  };

  it('never on the first page load of a first visit', () => {
    expect(hasEarnedPrompt({ sessionCount: 1, didMeaningfulAction: false })).toBe(false);
  });

  it('from the second session onwards', () => {
    expect(hasEarnedPrompt({ sessionCount: 2, didMeaningfulAction: false })).toBe(true);
  });

  it('immediately after a meaningful action, even in session one', () => {
    expect(hasEarnedPrompt({ sessionCount: 1, didMeaningfulAction: true })).toBe(true);
  });

  it('counts a session once, not once per mount', () => {
    // StrictMode double-invokes effects in development, and a remount of the
    // shell would otherwise inflate the count enough to show the sheet on a
    // first visit after all.
    const local = makeStore();
    const session = makeStore();
    expect(noteSession(local, session)).toBe(1);
    expect(noteSession(local, session)).toBe(1);
    expect(noteSession(local, session)).toBe(1);
    // A genuinely new session: same localStorage, fresh sessionStorage.
    expect(noteSession(local, makeStore())).toBe(2);
  });

  it('round-trips the meaningful-action flag', () => {
    const local = makeStore();
    expect(hasInstallEarnedFlag(local)).toBe(false);
    markInstallEarned(local);
    expect(hasInstallEarnedFlag(local)).toBe(true);
  });

  it('never throws without storage', () => {
    expect(noteSession(undefined, undefined)).toBe(0);
    expect(hasInstallEarnedFlag(undefined)).toBe(false);
    expect(() => markInstallEarned(undefined)).not.toThrow();
  });
});

describe('resolveInstallMode', () => {
  const base = { standalone: false, dismissed: false, hasDeferredPrompt: false, iosSafari: false };

  it('shows nothing when already standalone', () =>
    expect(resolveInstallMode({ ...base, standalone: true, iosSafari: true })).toBeNull());
  it('shows nothing when previously dismissed', () =>
    expect(resolveInstallMode({ ...base, dismissed: true, hasDeferredPrompt: true })).toBeNull());
  it('prefers native one-tap when beforeinstallprompt was captured', () =>
    expect(resolveInstallMode({ ...base, hasDeferredPrompt: true })).toBe('native'));
  it('falls back to the iOS instructional hint', () =>
    expect(resolveInstallMode({ ...base, iosSafari: true })).toBe('ios'));
  it('shows nothing on a desktop browser with no prompt and no iOS', () =>
    expect(resolveInstallMode(base)).toBeNull());
});
