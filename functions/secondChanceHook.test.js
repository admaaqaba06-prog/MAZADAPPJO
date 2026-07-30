// The enforcer hook's PLACEMENT, which no unit test can reach.
//
// Two ways to get this wrong, both invisible to a behavioural test:
//   1. Opening offers INSIDE the batch loop. Finding the runner-up needs a bids
//      subcollection query; a query inside a write batch is not how the batch
//      API works, and mixing them makes the default itself fail.
//   2. Letting a second-chance failure escape. paymentDefaultEnforcer also
//      unblocks users whose ban cooldown expired — if it throws, orders stop
//      defaulting AND bans stop lifting.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(HERE, 'index.js'), 'utf8');

function enforcerSource() {
  const start = SOURCE.indexOf('exports.paymentDefaultEnforcer');
  expect(start).toBeGreaterThan(-1);
  const rest = SOURCE.slice(start + 1);
  const next = rest.indexOf('\nexports.');
  return next === -1 ? rest : rest.slice(0, next);
}

/** Every call to `name` in the enforcer, wrapped or not. */
function callsTo(name) {
  return enforcerSource().match(new RegExp(`\\b${name}\\(`, 'g')) || [];
}

/**
 * Calls to `name` that sit ALONE inside their own try block, with the catch
 * attached to that same block.
 *
 * Deliberately not "is there a try and a catch somewhere nearby": the enforcer
 * has its own outer `} catch (err) {` a few lines below the hook, so a
 * proximity check passes even with the wrapper deleted (it did — that is why
 * this replaced it). Requiring the call to be the entire try body is the one
 * shape that cannot be satisfied by an unrelated try/catch in the vicinity.
 */
function wrappedCallsTo(name) {
  return enforcerSource().match(
    new RegExp(`try\\s*\\{\\s*await ${name}\\([^)]*\\);\\s*\\}\\s*catch`, 'g'),
  ) || [];
}

describe('paymentDefaultEnforcer — second-chance hook placement', () => {
  const body = enforcerSource();

  it('opens offers only after the batch has committed', () => {
    const commitAt = body.indexOf('batch.commit()');
    const hookAt = body.indexOf('openSecondChanceOffers');
    expect(commitAt).toBeGreaterThan(-1);
    expect(hookAt).toBeGreaterThan(commitAt);
  });

  it('opens offers inside the per-buyer loop, not once at the end', () => {
    // A single deferred pass loses lots permanently: if a later buyer's
    // `batch.commit()` throws, control leaves for the outer catch while the
    // earlier buyers' orders are already `defaulted` — and a `defaulted` order
    // never re-enters the `waiting_payment` query that feeds this function.
    // Their second chance would be forfeited with no way back.
    const commits = body.match(/await batch\.commit\(\);/g) || [];
    expect(commits.length).toBe(2); // per-buyer loop + the no-buyer loop
    expect(callsTo('openSecondChanceOffers').length).toBe(commits.length);
  });

  it('wraps EVERY hook call so a failure can never break defaulting or unblocking', () => {
    const calls = callsTo('openSecondChanceOffers');
    expect(calls.length).toBeGreaterThan(0);
    expect(wrappedCallsTo('openSecondChanceOffers').length).toBe(calls.length);
  });

  it('sweeps for un-notified offers above the early return, or it never runs', () => {
    // An offer written but never announced is only rescuable on a LATER run,
    // and those runs are overwhelmingly ones where nothing new defaults — so a
    // sweep placed below `if (snap.empty) return null;` would be dead code
    // exactly when it is needed.
    const sweepAt = body.indexOf('retryUnnotifiedSecondChanceOffers');
    const earlyReturnAt = body.indexOf('if (snap.empty) return null;');
    expect(sweepAt).toBeGreaterThan(-1);
    expect(earlyReturnAt).toBeGreaterThan(-1);
    expect(sweepAt).toBeLessThan(earlyReturnAt);
  });
});
