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

/**
 * The body of a top-level `async function name(...)` in index.js, by brace
 * matching. Safe here because every brace inside these functions is balanced —
 * the template literals only ever use `${...}` and the comments only mention
 * balanced paths like `users/{uid}`. Each caller asserts on a landmark from
 * inside its own function, so a mis-slice cannot pass silently.
 */
function functionSource(name) {
  const start = SOURCE.indexOf(`async function ${name}(`);
  expect(start, `${name} is not defined in index.js`).toBeGreaterThan(-1);
  const open = SOURCE.indexOf('{', start);
  let depth = 0;
  for (let k = open; k < SOURCE.length; k++) {
    if (SOURCE[k] === '{') depth++;
    else if (SOURCE[k] === '}' && --depth === 0) return SOURCE.slice(open + 1, k);
  }
  throw new Error(`unterminated ${name}`);
}

/**
 * The `{ ... }` block belonging to the first statement in `src` containing
 * `needle`. Used to prove a guard actually SKIPS rather than merely logging —
 * an `if` that logs and falls through reads identically at a glance.
 */
function blockAfter(src, needle) {
  const at = src.indexOf(needle);
  expect(at, `${needle} not found`).toBeGreaterThan(-1);
  const open = src.indexOf('{', at);
  let depth = 0;
  for (let k = open; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}' && --depth === 0) return src.slice(open + 1, k);
  }
  throw new Error(`unterminated block after ${needle}`);
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

/**
 * REVIEW F3 — the 60s default is no longer enough headroom.
 *
 * Per defaulted lot the enforcer now does 4 reads + 2 writes plus a 5s-bounded
 * HTTP call, and a ≤50-doc un-notified retry sweep runs before any of it. A hung
 * n8n behind a sweep backlog could burn the whole minute before a single order
 * defaults — and a timeout also drops section A, the cooldown lift that un-bans
 * users.
 */
describe('paymentDefaultEnforcer — runtime budget', () => {
  /** The declaration only, up to `.onRun(` — never the body. */
  function declaration() {
    const start = SOURCE.indexOf('exports.paymentDefaultEnforcer');
    expect(start).toBeGreaterThan(-1);
    const onRunAt = SOURCE.indexOf('.onRun(', start);
    expect(onRunAt).toBeGreaterThan(start);
    return SOURCE.slice(start, onRunAt);
  }

  it('declares an extended timeout rather than inheriting the 60s default', () => {
    expect(declaration()).toMatch(/\.runWith\(\{[^}]*timeoutSeconds:\s*540\b/);
  });

  it('keeps the 30-minute schedule — the timeout is headroom, not a slower cadence', () => {
    expect(declaration()).toContain(".schedule('every 30 minutes')");
  });
});

/**
 * REVIEW F1 (server half) — never open an offer to a BANNED runner-up.
 *
 * secondChanceRespond refuses `buyer_accept` from a blocked account, and the
 * payment-default ban MINIMUM is 48h against a 24h offer window, so such an
 * offer is deterministically doomed: an Accept button the server will always
 * refuse, while the lot is held out of auto-relist for 24h on behalf of someone
 * who can never take it.
 */
describe('openSecondChanceOffers — the banned runner-up', () => {
  const body = functionSource('openSecondChanceOffers');

  it('is the function this test thinks it is', () => {
    // Landmark check, so a mis-sliced body cannot make the rest vacuously pass.
    expect(body).toContain('pickRunnerUp(bids, order.buyerId)');
    expect(body).toContain('buildOfferRecord(');
  });

  it("reads the runner-up's user doc and asks the SHARED ban helper", () => {
    // Same helper placeBid and the accept path use, so there is exactly one
    // answer to "is this account restricted".
    expect(body).toMatch(/collection\('users'\)\.doc\(runnerUp\.bidderId\)/);
    expect(body).toContain('isEffectivelyBlocked(');
  });

  it('decides BEFORE the offer is built or written to the auction', () => {
    const banAt = body.indexOf('isEffectivelyBlocked(');
    const buildAt = body.indexOf('buildOfferRecord(');
    const writeAt = body.indexOf('secondChanceOffer: offer');
    expect(banAt).toBeGreaterThan(-1);
    expect(buildAt).toBeGreaterThan(-1);
    expect(writeAt).toBeGreaterThan(-1);
    expect(banAt).toBeLessThan(buildAt);
    expect(banAt).toBeLessThan(writeAt);
  });

  it('SKIPS the lot — logging and falling through would fix nothing', () => {
    // The whole defect is an offer that gets opened anyway. An `if` that only
    // logs looks identical at a glance and ships the same bug.
    expect(blockAfter(body, 'isEffectivelyBlocked(')).toContain('continue;');
  });

  it('logs the skip distinguishably from "there was no runner-up at all"', () => {
    // Two very different operational stories: nobody else bid, versus somebody
    // did and we chose not to offer. Confusing them hides the second entirely.
    expect(body).toMatch(/has no runner-up/);
    expect(body).toMatch(/is blocked — no offer opened/);
  });

  it('never cascades to a third bidder — a second chance is one-shot', () => {
    // The spec's "One offer only". A skipped lot follows today's relist path,
    // which IS the documented no-qualifying-bidder behaviour.
    //
    // Comments are stripped first: the ones explaining WHY `pickRunnerUp` is not
    // handed `undefined` mention the call by name and would otherwise count.
    const code = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code.match(/pickRunnerUp\(/g) || []).toHaveLength(1);
    expect(code).not.toContain('__sc2');
  });
});

/**
 * REVIEW F2 — the audit row must survive a failed announcement.
 *
 * `second_chance_opened` is how the first fully automatic sale path in the
 * system is watched (docs/BACKLOG.md). Written after the notify, a throw at the
 * `notifiedAt` stamp loses it for an offer that DID go live — losing the record
 * exactly when something went wrong, which is backwards.
 */
describe('openSecondChanceOffers — audit before announce', () => {
  const body = functionSource('openSecondChanceOffers');

  it('writes the system_health row BEFORE notifying anyone', () => {
    const auditAt = body.indexOf("type: 'second_chance_opened'");
    const notifyAt = body.indexOf('notifySecondChanceOffer(');
    expect(auditAt).toBeGreaterThan(-1);
    expect(notifyAt).toBeGreaterThan(-1);
    expect(auditAt).toBeLessThan(notifyAt);
  });

  it('still writes it only AFTER the offer is actually on the auction', () => {
    // The row claims an offer exists. Writing it before the update would
    // announce one that a failed write never created.
    const offerWriteAt = body.indexOf('secondChanceOffer: offer');
    const auditAt = body.indexOf("type: 'second_chance_opened'");
    expect(offerWriteAt).toBeGreaterThan(-1);
    expect(offerWriteAt).toBeLessThan(auditAt);
  });
});

/**
 * REVIEW F4 — an offer with no recipient must not be announced OR stamped.
 *
 * A `pending_seller` offer on a lot with no `sellerId` (legacy/imported doc)
 * would otherwise notify nobody, stamp `notifiedAt` as though it had been
 * announced, and hold the lot out of relist for 24h for an offer nobody can see
 * or accept. The decline path already guards this; the asymmetry was the bug.
 */
describe('notifySecondChanceOffer — no recipient, no announcement', () => {
  const body = functionSource('notifySecondChanceOffer');

  it('is the function this test thinks it is', () => {
    expect(body).toContain("event: 'below_reserve_offer'");
  });

  it('guards the empty uid', () => {
    expect(body).toMatch(/if \(!uid\)/);
  });

  it('guards BEFORE both the notify and the notifiedAt stamp', () => {
    const guardAt = body.indexOf('if (!uid)');
    const notifyAt = body.indexOf('await notify(');
    const stampAt = body.indexOf("'secondChanceOffer.notifiedAt'");
    expect(guardAt).toBeGreaterThan(-1);
    expect(notifyAt).toBeGreaterThan(-1);
    expect(stampAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(notifyAt);
    expect(guardAt).toBeLessThan(stampAt);
  });

  it('leaves notifiedAt UNSTAMPED so the retry sweep can still find the offer', () => {
    // Stamping it would disguise a never-announced offer as announced — the
    // precise state `notifiedAt: null` is written explicitly to make findable.
    const guard = blockAfter(body, 'if (!uid)');
    expect(guard).not.toContain('notifiedAt');
    expect(guard).toMatch(/throw new Error\(/);
  });
});
