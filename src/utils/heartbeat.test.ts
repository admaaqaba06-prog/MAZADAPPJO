import { describe, it, expect } from 'vitest';
import { nextHeartbeatDelayMs, HEARTBEAT_MIN_MS, HEARTBEAT_MAX_MS } from './heartbeat';

describe('nextHeartbeatDelayMs', () => {
  it('exposes an 8-12 minute window', () => {
    expect(HEARTBEAT_MIN_MS).toBe(8 * 60 * 1000);
    expect(HEARTBEAT_MAX_MS).toBe(12 * 60 * 1000);
  });

  it('returns the lower bound when rand() is 0', () => {
    expect(nextHeartbeatDelayMs(() => 0)).toBe(HEARTBEAT_MIN_MS);
  });

  it('returns the upper bound when rand() approaches 1', () => {
    // Largest double below 1.
    expect(nextHeartbeatDelayMs(() => 1 - Number.EPSILON)).toBe(HEARTBEAT_MAX_MS);
  });

  it('lands at the midpoint for rand() = 0.5', () => {
    const mid = HEARTBEAT_MIN_MS + (HEARTBEAT_MAX_MS - HEARTBEAT_MIN_MS) / 2;
    expect(nextHeartbeatDelayMs(() => 0.5)).toBe(mid);
  });

  it('always stays within [MIN, MAX] across the real RNG', () => {
    for (let i = 0; i < 5000; i++) {
      const d = nextHeartbeatDelayMs();
      expect(d).toBeGreaterThanOrEqual(HEARTBEAT_MIN_MS);
      expect(d).toBeLessThanOrEqual(HEARTBEAT_MAX_MS);
    }
  });

  it('produces spread-out values (not lockstep) across clients', () => {
    const samples = new Set<number>();
    for (let i = 0; i < 200; i++) samples.add(nextHeartbeatDelayMs());
    // With a 240s span at ms resolution, 200 draws should be almost all unique.
    expect(samples.size).toBeGreaterThan(150);
  });
});
