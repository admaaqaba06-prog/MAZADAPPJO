import { describe, it, expect } from 'vitest';
import { formatCountdown, stepPrice, driftWatchers, antiSnipe } from './heroSim';

describe('formatCountdown', () => {
  it('zero-pads seconds under a minute', () => {
    expect(formatCountdown(7)).toBe('00:07');
    expect(formatCountdown(38)).toBe('00:38');
  });

  it('formats minutes and seconds', () => {
    expect(formatCountdown(605)).toBe('10:05');
  });

  it('never goes negative', () => {
    expect(formatCountdown(-5)).toBe('00:00');
    expect(formatCountdown(0)).toBe('00:00');
  });
});

describe('stepPrice', () => {
  it('adds one step to the price', () => {
    expect(stepPrice(4850, 25)).toBe(4875);
  });
});

describe('antiSnipe', () => {
  it('extends when under 12 seconds', () => {
    expect(antiSnipe(7)).toBe(15);
  });

  it('leaves the countdown alone above the window', () => {
    expect(antiSnipe(30)).toBe(30);
  });

  it('honors an explicit bumpTo within the window', () => {
    expect(antiSnipe(3, 20)).toBe(20);
  });
});

describe('driftWatchers', () => {
  it('stays near the input and never negative', () => {
    for (let r = 0; r <= 1; r += 0.1) {
      const out = driftWatchers(1420, () => r);
      expect(out).toBeGreaterThanOrEqual(0);
      expect(Math.abs(out - 1420)).toBeLessThanOrEqual(4);
    }
  });

  it('clamps to zero for small counts', () => {
    expect(driftWatchers(1, () => 0)).toBe(0);
    expect(driftWatchers(0, () => 0)).toBe(0);
  });
});
