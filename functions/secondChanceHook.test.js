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

describe('paymentDefaultEnforcer — second-chance hook placement', () => {
  const body = enforcerSource();

  it('opens offers only after the batch has committed', () => {
    const commitAt = body.indexOf('batch.commit()');
    const hookAt = body.indexOf('openSecondChanceOffers');
    expect(commitAt).toBeGreaterThan(-1);
    expect(hookAt).toBeGreaterThan(commitAt);
  });

  it('wraps the hook so a failure can never break defaulting or unblocking', () => {
    const hookAt = body.indexOf('openSecondChanceOffers');
    const slice = body.slice(Math.max(0, hookAt - 200), hookAt + 300);
    expect(slice).toMatch(/try\s*\{/);
    expect(slice).toMatch(/catch/);
  });
});
