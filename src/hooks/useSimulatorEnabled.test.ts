import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Tests the non-React core of useSimulatorEnabled (read/write/subscribe).
 * The vitest environment is `node` (no jsdom in this repo), so we stub
 * `window` with a real EventTarget and `localStorage` with an in-memory
 * store — the exact same API surface the helpers touch. The hook itself is
 * a thin useSyncExternalStore binding over these helpers, so this covers
 * the behavior without needing a DOM renderer.
 */

function makeLocalStorageStub() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
  };
}

const g = globalThis as any;
let originalWindow: any;
let originalLocalStorage: any;

beforeEach(() => {
  vi.resetModules();
  originalWindow = g.window;
  originalLocalStorage = g.localStorage;
  g.window = new EventTarget();
  g.localStorage = makeLocalStorageStub();
});

afterEach(() => {
  g.window = originalWindow;
  g.localStorage = originalLocalStorage;
});

async function loadModule() {
  return await import('./useSimulatorEnabled');
}

describe('readSimulatorEnabled', () => {
  it('defaults to false when the key is unset', async () => {
    const { readSimulatorEnabled } = await loadModule();
    expect(readSimulatorEnabled()).toBe(false);
  });

  it("returns true only for the exact value '1'", async () => {
    const { readSimulatorEnabled, SIMULATOR_ENABLED_KEY } = await loadModule();
    g.localStorage.setItem(SIMULATOR_ENABLED_KEY, '1');
    expect(readSimulatorEnabled()).toBe(true);
    g.localStorage.setItem(SIMULATOR_ENABLED_KEY, '0');
    expect(readSimulatorEnabled()).toBe(false);
    g.localStorage.setItem(SIMULATOR_ENABLED_KEY, 'true');
    expect(readSimulatorEnabled()).toBe(false);
  });

  it('returns false when localStorage throws', async () => {
    const { readSimulatorEnabled } = await loadModule();
    g.localStorage = {
      getItem: () => {
        throw new Error('denied');
      },
    };
    expect(readSimulatorEnabled()).toBe(false);
  });
});

describe('writeSimulatorEnabled', () => {
  it("persists '1'/'0' and round-trips through read", async () => {
    const { writeSimulatorEnabled, readSimulatorEnabled, SIMULATOR_ENABLED_KEY } = await loadModule();
    writeSimulatorEnabled(true);
    expect(g.localStorage.getItem(SIMULATOR_ENABLED_KEY)).toBe('1');
    expect(readSimulatorEnabled()).toBe(true);
    writeSimulatorEnabled(false);
    expect(g.localStorage.getItem(SIMULATOR_ENABLED_KEY)).toBe('0');
    expect(readSimulatorEnabled()).toBe(false);
  });

  it('broadcasts the toggle event with the new value in detail', async () => {
    const { writeSimulatorEnabled, SIMULATOR_TOGGLE_EVENT } = await loadModule();
    const seen: any[] = [];
    g.window.addEventListener(SIMULATOR_TOGGLE_EVENT, (e: any) => seen.push(e.detail));
    writeSimulatorEnabled(true);
    writeSimulatorEnabled(false);
    expect(seen).toEqual([{ enabled: true }, { enabled: false }]);
  });

  it('still broadcasts when localStorage.setItem throws', async () => {
    const { writeSimulatorEnabled, SIMULATOR_TOGGLE_EVENT } = await loadModule();
    g.localStorage = {
      setItem: () => {
        throw new Error('quota');
      },
      getItem: () => null,
    };
    const onToggle = vi.fn();
    g.window.addEventListener(SIMULATOR_TOGGLE_EVENT, onToggle);
    expect(() => writeSimulatorEnabled(true)).not.toThrow();
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

describe('subscribeSimulatorEnabled', () => {
  it('fires on toggle writes and stops after unsubscribe', async () => {
    const { subscribeSimulatorEnabled, writeSimulatorEnabled } = await loadModule();
    const onChange = vi.fn();
    const unsubscribe = subscribeSimulatorEnabled(onChange);

    writeSimulatorEnabled(true);
    expect(onChange).toHaveBeenCalledTimes(1);

    unsubscribe();
    writeSimulatorEnabled(false);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('also fires on cross-tab storage events', async () => {
    const { subscribeSimulatorEnabled } = await loadModule();
    const onChange = vi.fn();
    subscribeSimulatorEnabled(onChange);
    g.window.dispatchEvent(new Event('storage'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
