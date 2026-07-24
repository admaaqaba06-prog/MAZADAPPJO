import { describe, it, expect } from 'vitest';
import {
  isIOS,
  isIOSSafari,
  isStandalone,
  isDismissed,
  persistDismissal,
  resolveInstallMode,
  A2HS_DISMISSED_KEY,
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

  it('round-trips a dismissal under the documented key', () => {
    const store = makeStore();
    expect(isDismissed(store)).toBe(false);
    persistDismissal(store);
    expect(store.getItem(A2HS_DISMISSED_KEY)).toBe('1');
    expect(isDismissed(store)).toBe(true);
  });

  it('is false (never throws) with no storage', () => {
    expect(isDismissed(undefined)).toBe(false);
    expect(() => persistDismissal(undefined)).not.toThrow();
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
