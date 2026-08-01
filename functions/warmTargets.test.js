// The warmer is invisible when it breaks: a function silently dropped from the
// target list just goes back to 2-second cold starts with nothing failing. So
// the list and the short-circuit placement are both pinned.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { WARM_TARGETS, warmUrl } from './warmTargets.js';

const SRC = readFileSync(new URL('./index.js', import.meta.url), 'utf8');

// Slice on the real function boundary, never on a fixed character count: a
// `SRC.slice(start, start + 400)` window silently stops covering the line it is
// meant to pin as soon as anyone adds a comment above it.
function bodyOf(name) {
  const start = SRC.indexOf(`exports.${name} =`);
  expect(start, `${name} not found`).toBeGreaterThan(-1);
  const next = SRC.indexOf('\nexports.', start + 1);
  return SRC.slice(start, next === -1 ? SRC.length : next);
}

describe('WARM_TARGETS', () => {
  it('lists exactly the six admin callables behind Action Center buttons', () => {
    expect([...WARM_TARGETS].sort()).toEqual([
      'approveSubscription', 'approveWithdrawal', 'rejectSubscription',
      'rejectWithdrawal', 'sendFulfillmentNudge', 'verifyOrderPayment',
    ]);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(WARM_TARGETS)).toBe(true);
  });

  it('names only functions that actually exist', () => {
    for (const name of WARM_TARGETS) {
      expect(SRC.includes(`exports.${name} =`), name).toBe(true);
    }
  });
});

describe('every target short-circuits ABOVE its auth check', () => {
  // Below the auth check the line is useless: the ping would throw
  // `unauthenticated` and flood Cloud Logging, destroying the only signal that
  // would reveal a real unauthorised attempt.
  for (const name of WARM_TARGETS) {
    it(`${name} returns on __warm before its REAL auth gate`, () => {
      const body = bodyOf(name);

      const warmAt = body.indexOf('__warm');
      // The real gate is whichever comes FIRST: the shared `assertAdmin(context)`
      // helper (which throws `unauthenticated` itself, before anything else) or an
      // inline `context.auth` check. Comparing against `context.auth` alone is NOT
      // enough — four of the six gate on `await assertAdmin(context)` and only
      // mention context.auth much further down, so a __warm line parked between
      // the two would sit BELOW the real gate and still pass. Verified by mutant:
      // moving verifyOrderPayment's line under its assertAdmin survived the old
      // assertion, which is exactly the flood this test exists to prevent.
      const gateAt = Math.min(...[/assertAdmin\(/, /context\.auth/]
        .map((re) => { const m = body.match(re); return m ? m.index : Infinity; }));
      expect(warmAt, `${name} has no __warm short-circuit`).toBeGreaterThan(-1);
      expect(gateAt, `${name} has no auth gate`).toBeLessThan(body.length);
      expect(warmAt, `${name}'s __warm sits BELOW its real auth gate`).toBeLessThan(gateAt);
    });

    it(`${name}'s short-circuit reads and writes nothing`, () => {
      const line = (bodyOf(name).split('\n').find(l => l.includes('__warm')) || '').trim();
      // Whitelist, not denylist. The same line is mandated verbatim at all six
      // sites, so pin it exactly: a denylist of `db.` / `collection(` /
      // `transaction` waves through `admin.firestore().doc(...).set(...)`, a
      // `console.log(context.auth)`, or anything else smuggled onto the line.
      expect(line).toBe('if (data && data.__warm === true) return { warm: true };');
    });
  }
});

describe('warmUrl', () => {
  it('builds the callable endpoint from project and region', () => {
    expect(warmUrl('approveWithdrawal', 'mazadjoapp', 'us-central1'))
      .toBe('https://us-central1-mazadjoapp.cloudfunctions.net/approveWithdrawal');
  });

  it('throws on an unknown target rather than pinging a typo forever', () => {
    expect(() => warmUrl('nopeNotReal', 'mazadjoapp', 'us-central1')).toThrowError(/target/i);
  });
});

describe('the scheduled warmer is wired', () => {
  it('exists, runs every 5 minutes, and iterates the shared list', () => {
    const start = SRC.indexOf('exports.warmAdminCallables');
    expect(start).toBeGreaterThan(-1);
    const body = SRC.slice(start, start + 1200);
    expect(body).toMatch(/\.schedule\('every 5 minutes'\)/);
    expect(body).toMatch(/WARM_TARGETS/);
    // A re-typed literal here would silently drift from the pinned list.
    expect(body).not.toMatch(/\['approveWithdrawal'/);
    // ...but that only catches a re-type that happens to START with
    // approveWithdrawal. Mutation testing found a faithful re-type in source
    // order survives it, which is exactly the drift this guard exists to stop.
    // Pin the iteration itself: the loop must read the shared list.
    expect(body).toMatch(/WARM_TARGETS\.map\(/);
  });
});
