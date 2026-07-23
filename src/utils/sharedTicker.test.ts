import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  subscribeToSharedTicker,
  __getTickerInternals,
  secondsLeftAt,
} from './sharedTicker';

describe('sharedTicker subscription logic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Every test must leave the ticker empty (module-level singleton).
    expect(__getTickerInternals().listenerCount).toBe(0);
    expect(__getTickerInternals().running).toBe(false);
    vi.useRealTimers();
  });

  it('starts the interval on first subscribe and stops on last unsubscribe', () => {
    expect(__getTickerInternals().running).toBe(false);
    const unsub = subscribeToSharedTicker(() => {});
    expect(__getTickerInternals().running).toBe(true);
    expect(__getTickerInternals().listenerCount).toBe(1);
    unsub();
    expect(__getTickerInternals().running).toBe(false);
    expect(__getTickerInternals().listenerCount).toBe(0);
  });

  it('uses ONE interval regardless of subscriber count', () => {
    const spy = vi.spyOn(globalThis, 'setInterval');
    const unsubs = Array.from({ length: 80 }, () => subscribeToSharedTicker(() => {}));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(__getTickerInternals().listenerCount).toBe(80);
    unsubs.forEach(u => u());
    expect(__getTickerInternals().running).toBe(false);
    spy.mockRestore();
  });

  it('notifies all subscribers once per second with a timestamp', () => {
    const a = vi.fn();
    const b = vi.fn();
    const ua = subscribeToSharedTicker(a);
    const ub = subscribeToSharedTicker(b);

    vi.advanceTimersByTime(1000);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(typeof a.mock.calls[0][0]).toBe('number');

    vi.advanceTimersByTime(3000);
    expect(a).toHaveBeenCalledTimes(4);
    expect(b).toHaveBeenCalledTimes(4);

    ua();
    ub();
  });

  it('a listener can unsubscribe itself from inside its own tick', () => {
    let unsub: () => void = () => {};
    const fn = vi.fn(() => unsub());
    unsub = subscribeToSharedTicker(fn);

    vi.advanceTimersByTime(2000);
    expect(fn).toHaveBeenCalledTimes(1); // second tick never reaches it
    expect(__getTickerInternals().running).toBe(false);
  });

  it('unsubscribe is idempotent and never drops other listeners', () => {
    const a = vi.fn();
    const ua = subscribeToSharedTicker(() => {});
    const ub = subscribeToSharedTicker(a);
    ua();
    ua(); // double-unsubscribe must be a no-op
    vi.advanceTimersByTime(1000);
    expect(a).toHaveBeenCalledTimes(1);
    ub();
  });

  it('one throwing listener does not starve the others', () => {
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const good = vi.fn();
    const u1 = subscribeToSharedTicker(bad);
    const u2 = subscribeToSharedTicker(good);
    vi.advanceTimersByTime(1000);
    expect(good).toHaveBeenCalledTimes(1);
    u1();
    u2();
  });

  it('restarts cleanly after going idle', () => {
    const first = subscribeToSharedTicker(() => {});
    first();
    const fn = vi.fn();
    const second = subscribeToSharedTicker(fn);
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
    second();
  });
});

describe('secondsLeftAt', () => {
  it('returns whole seconds remaining, floored', () => {
    expect(secondsLeftAt(10_000, 0)).toBe(10);
    expect(secondsLeftAt(10_999, 0)).toBe(10);
    expect(secondsLeftAt(1_000, 0)).toBe(1);
  });

  it('clamps at 0 once the deadline passed', () => {
    expect(secondsLeftAt(1_000, 1_000)).toBe(0);
    expect(secondsLeftAt(1_000, 5_000)).toBe(0);
  });

  it('returns null when there is no deadline (no fabricated 120s default)', () => {
    expect(secondsLeftAt(null, 5_000)).toBeNull();
    expect(secondsLeftAt(undefined, 5_000)).toBeNull();
    expect(secondsLeftAt(0, 5_000)).toBeNull();
  });
});
