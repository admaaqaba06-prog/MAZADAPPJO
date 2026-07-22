import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Tests the module-scope bid-bot manager (start/stop/stopAll, pending guard,
 * noop/error auto-stop, safety cap, toggle-off subscription).
 *
 * The vitest environment is `node` (no jsdom), so `window` is stubbed with a
 * real EventTarget (same pattern as useSimulatorEnabled.test.ts) and the
 * `simulateBid` callable is mocked at the firebase-service boundary. Fake
 * timers drive the intervals; module state is fresh per test via resetModules.
 */

const { simulateBidMock } = vi.hoisted(() => ({
  simulateBidMock: vi.fn(),
}));

vi.mock('../services/firebase', () => ({
  getCallableFunction: vi.fn(async () => simulateBidMock),
}));

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
  vi.useFakeTimers();
  simulateBidMock.mockReset();
  simulateBidMock.mockResolvedValue({ data: { currentPrice: 100 } });
  originalWindow = g.window;
  originalLocalStorage = g.localStorage;
  g.window = new EventTarget();
  g.localStorage = makeLocalStorageStub();
});

afterEach(() => {
  vi.useRealTimers();
  g.window = originalWindow;
  g.localStorage = originalLocalStorage;
});

async function loadManager() {
  return await import('./simBotManager');
}

/** Flush the immediate first tick (async callable round-trip). */
async function flush() {
  await vi.advanceTimersByTimeAsync(0);
}

describe('startBot / isBotRunning', () => {
  it('start → running, snapshot exposes the pace, first bid fires immediately', async () => {
    const m = await loadManager();
    const messages: string[] = [];
    m.startBot('a1', 'fast', { onMessage: (_id, msg) => messages.push(msg) });
    await flush();

    expect(m.isBotRunning('a1')).toBe(true);
    expect(m.getBotsSnapshot()).toEqual({ a1: 'fast' });
    expect(simulateBidMock).toHaveBeenCalledTimes(1);
    expect(simulateBidMock).toHaveBeenCalledWith({ auctionId: 'a1' });
    expect(messages[0]).toBe('Bot running (fast)');
  });

  it('double-start is a no-op (one interval per auction, no re-notify)', async () => {
    const m = await loadManager();
    const listener = vi.fn();
    m.subscribeBots(listener);

    m.startBot('a1', 'slow');
    await flush();
    const callsAfterFirst = listener.mock.calls.length;
    const snapshotAfterFirst = m.getBotsSnapshot();

    m.startBot('a1', 'fast'); // ignored — already running
    await flush();
    expect(listener.mock.calls.length).toBe(callsAfterFirst);
    expect(m.getBotsSnapshot()).toBe(snapshotAfterFirst); // same reference
    expect(m.getBotsSnapshot()).toEqual({ a1: 'slow' });
    expect(simulateBidMock).toHaveBeenCalledTimes(1); // no duplicate immediate tick
  });

  it('interval keeps ticking at the configured pace', async () => {
    const m = await loadManager();
    m.startBot('a1', 'fast');
    await flush(); // immediate tick
    await vi.advanceTimersByTimeAsync(m.PACE_MS.fast * 3);
    expect(simulateBidMock).toHaveBeenCalledTimes(4);
  });
});

describe('stopBot / stopAllBots', () => {
  it('stop clears the bot, notifies subscribers, and delivers the reason', async () => {
    const m = await loadManager();
    const messages: string[] = [];
    const listener = vi.fn();
    m.subscribeBots(listener);
    m.startBot('a1', 'fast', { onMessage: (_id, msg) => messages.push(msg) });
    await flush();

    m.stopBot('a1', 'Bot stopped (test)');
    expect(m.isBotRunning('a1')).toBe(false);
    expect(m.getBotsSnapshot()).toEqual({});
    expect(messages).toContain('Bot stopped (test)');

    // Interval is really cleared: no further callable calls.
    const calls = simulateBidMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(m.PACE_MS.fast * 3);
    expect(simulateBidMock).toHaveBeenCalledTimes(calls);
  });

  it('stopBot on an unknown id is a silent no-op', async () => {
    const m = await loadManager();
    const listener = vi.fn();
    m.subscribeBots(listener);
    m.stopBot('nope', 'reason');
    expect(listener).not.toHaveBeenCalled();
  });

  it('stopAllBots clears every bot', async () => {
    const m = await loadManager();
    m.startBot('a1', 'fast');
    m.startBot('a2', 'slow');
    await flush();
    expect(Object.keys(m.getBotsSnapshot()).sort()).toEqual(['a1', 'a2']);

    m.stopAllBots('Bot stopped (cleanup)');
    expect(m.getBotsSnapshot()).toEqual({});
    expect(m.isBotRunning('a1')).toBe(false);
    expect(m.isBotRunning('a2')).toBe(false);

    const calls = simulateBidMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(m.PACE_MS.slow * 3);
    expect(simulateBidMock).toHaveBeenCalledTimes(calls);
  });
});

describe('auto-stop', () => {
  it('a {noop} response stops the bot with the server reason', async () => {
    simulateBidMock.mockResolvedValue({ data: { noop: true, reason: 'auction ended' } });
    const m = await loadManager();
    const messages: string[] = [];
    m.startBot('a1', 'fast', { onMessage: (_id, msg) => messages.push(msg) });
    await flush(); // immediate tick gets the noop

    expect(m.isBotRunning('a1')).toBe(false);
    expect(messages).toContain('Bot stopped (auction ended)');
  });

  it('a callable error stops the bot', async () => {
    simulateBidMock.mockRejectedValue(new Error('boom'));
    const m = await loadManager();
    const messages: string[] = [];
    m.startBot('a1', 'fast', { onMessage: (_id, msg) => messages.push(msg) });
    await flush();

    expect(m.isBotRunning('a1')).toBe(false);
    expect(messages).toContain('Bot stopped (error: boom)');
  });
});

describe('pending guard', () => {
  it('never stacks calls while one is in flight', async () => {
    let release!: () => void;
    simulateBidMock.mockImplementation(
      () => new Promise((resolve) => {
        release = () => resolve({ data: { currentPrice: 1 } });
      })
    );
    const m = await loadManager();
    m.startBot('a1', 'fast');
    await flush(); // immediate tick — now hanging in flight

    await vi.advanceTimersByTimeAsync(m.PACE_MS.fast * 3); // 3 more ticks fire, all skip
    expect(simulateBidMock).toHaveBeenCalledTimes(1);

    release();
    await vi.advanceTimersByTimeAsync(m.PACE_MS.fast); // next tick proceeds
    expect(simulateBidMock).toHaveBeenCalledTimes(2);
  });
});

describe('safety cap', () => {
  it('hard-stops after MAX_TICKS ticks so a forgotten bot cannot run forever', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const m = await loadManager();
    const messages: string[] = [];
    m.startBot('a1', 'fast', { onMessage: (_id, msg) => messages.push(msg) });
    await vi.advanceTimersByTimeAsync(m.PACE_MS.fast * (m.MAX_TICKS + 2));

    expect(m.isBotRunning('a1')).toBe(false);
    expect(messages).toContain('Bot stopped (safety cap reached)');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('safety cap'));
    warn.mockRestore();
  });
});

describe('master-toggle-off subscription', () => {
  it('stops all bots when the simulator toggle goes off', async () => {
    const sim = await import('../hooks/useSimulatorEnabled');
    sim.writeSimulatorEnabled(true);
    const m = await loadManager();
    const messages: string[] = [];
    m.startBot('a1', 'fast', { onMessage: (_id, msg) => messages.push(msg) });
    m.startBot('a2', 'slow');
    await flush();
    expect(Object.keys(m.getBotsSnapshot()).length).toBe(2);

    sim.writeSimulatorEnabled(false); // broadcasts the toggle event
    expect(m.getBotsSnapshot()).toEqual({});
    expect(messages).toContain('Bot stopped (simulator off)');
  });

  it('registers the toggle listener exactly once across many starts (no leak)', async () => {
    const sim = await import('../hooks/useSimulatorEnabled');
    const addSpy = vi.spyOn(g.window, 'addEventListener');
    const m = await loadManager();
    m.startBot('a1', 'fast');
    m.startBot('a2', 'fast');
    m.stopAllBots();
    m.startBot('a3', 'fast');
    await flush();

    const toggleRegistrations = addSpy.mock.calls.filter(
      ([type]) => type === sim.SIMULATOR_TOGGLE_EVENT
    );
    expect(toggleRegistrations.length).toBe(1);
    m.stopAllBots();
  });
});
