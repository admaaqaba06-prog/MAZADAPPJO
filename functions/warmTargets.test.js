// The warmer is invisible when it breaks: a function silently dropped from the
// target list just goes back to 2-second cold starts with nothing failing. So
// the list and the short-circuit placement are both pinned.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { WARM_TARGETS, warmUrl, buildWarmPlan } from './warmTargets.js';

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

describe('buildWarmPlan', () => {
  // The warmer's loop is source text and cannot be asserted on properly. The
  // plan CAN be: every question about what gets pinged is answered here, as a
  // value, so a dropped or mangled target is an ordinary failing unit test.
  const plan = buildWarmPlan('mazadjoapp', 'us-central1');

  it('pings every target, once, in list order', () => {
    expect(plan.map(p => p.name)).toEqual([...WARM_TARGETS]);
  });

  it('builds a well-formed callable URL for each', () => {
    for (const { name, url } of plan) {
      expect(url, name).toBe(`https://us-central1-mazadjoapp.cloudfunctions.net/${name}`);
    }
  });

  it('honours the region it is given', () => {
    const eu = buildWarmPlan('mazadjoapp', 'europe-west1');
    expect(eu[0].url).toBe(`https://europe-west1-mazadjoapp.cloudfunctions.net/${WARM_TARGETS[0]}`);
  });

  it('sends the exact callable envelope and nothing else', () => {
    // firebase-functions v4 `isValidRequest` requires a `data` key and rejects
    // extra top-level keys outright — a rejected ping never reaches the handler,
    // so the container stays cold and no test or log would say so. Deep-equal,
    // not a shape check: an added key must fail here.
    for (const { name, body } of plan) {
      expect(body, name).toEqual({ data: { __warm: true } });
    }
  });
});

describe('the scheduled warmer is wired', () => {
  it('exists, runs every 5 minutes, and iterates the shared plan', () => {
    const body = bodyOf('warmAdminCallables');
    expect(body).toMatch(/\.schedule\('every 5 minutes'\)/);
    // A re-typed literal here would silently drift from the pinned list.
    expect(body).not.toMatch(/\['approveWithdrawal'/);
    // ...but that only catches a re-type that happens to START with
    // approveWithdrawal; a faithful re-type in source order survives it. Pin
    // the iteration itself: what to ping comes from buildWarmPlan, never from
    // a list assembled here.
    expect(body).toMatch(/buildWarmPlan\(projectId, region\)/);
    expect(body).toMatch(/plan\.map\(/);
    // The loop body opens straight into the try/fetch. A per-target `if (name
    // === '...') return true;` skip — the realistic "this one is noisy" edit —
    // has nowhere to sit without breaking this.
    expect(body).toMatch(/plan\.map\(async \(\{ name, url, body \}\) => \{\s*try \{/);
  });

  it('bounds the ping so a stall cannot time the function out', () => {
    // Not a style point. Promise.all parked on a hung socket runs out
    // timeoutSeconds, and Cloud Functions logs THAT at error severity — the
    // log pollution this whole function exists to avoid, arriving by a route
    // the try/catch never sees. Matches pollN8nHealth's bound in this file.
    const body = bodyOf('warmAdminCallables');
    expect(body).toMatch(/signal: AbortSignal\.timeout\(\d+\)/);
  });

  it('never throws: every ping failure is caught and counted', () => {
    // A scheduled function that throws pollutes the error log it exists to
    // keep clean, so the catch is load-bearing, not defensive habit.
    const body = bodyOf('warmAdminCallables');
    expect(body).toMatch(/\} catch \(e\) \{/);
    expect(body).toMatch(/console\.warn/);
    expect(body).not.toMatch(/throw /);
  });

  it('skips quietly when the project id is missing', () => {
    // Without the guard, warmUrl builds `https://us-central1-undefined...` and
    // all six pings fail forever — six warn lines every five minutes, which is
    // the same log flood by another name.
    const body = bodyOf('warmAdminCallables');
    expect(body).toMatch(/if \(!projectId\) \{/);
    expect(body).toMatch(/return null;/);
  });

  it('targets us-central1, with the env read as an expected-unset fallback', () => {
    // NOT "reads the deployed region": FUNCTION_REGION is a legacy Node 8
    // runtime variable, removed on Node 10+. On this Node 20 1st-gen
    // deployment it is almost certainly unset, so the literal is what is
    // actually used and the env read does not self-correct on a region change.
    // The old name asserted a property that does not hold. What this pins is
    // that the fallback literal matches where this project actually deploys —
    // a wrong literal 404s every ping and reports it as one warn line while
    // cold starts quietly come back.
    const body = bodyOf('warmAdminCallables');
    expect(body).toMatch(/process\.env\.FUNCTION_REGION \|\| 'us-central1'/);
  });
});
