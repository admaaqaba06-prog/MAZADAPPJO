/**
 * The rate limiter's state must be SERVER-ONLY.
 *
 * The counters live on `users/{uid}`, and that document is self-writable: the
 * update rule lets `request.auth.uid == userId` change their own doc, gated only
 * by a denylist of fields. Anything NOT on that denylist is one browser-console
 * call from being rewritten by the very person it constrains —
 *
 *   updateDoc(doc(db, 'users', myUid), { bidRateLimit: {} })
 *
 * — which resets the hourly count, the daily count and any live cooldown. That
 * is the whole limiter, bypassed from frontend state, which is precisely what it
 * exists to prevent. Cloud Functions bypass rules entirely, so denylisting the
 * keys costs the limiter nothing.
 *
 * Asserted against the rules SOURCE rather than the emulator: the rules test
 * evaluator needs a JRE, which is not a dependency of this repo's `npm test`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

/** The `match /users/{userId}` block, to the start of the next top-level match. */
const usersBlock = (() => {
  const start = rules.indexOf('match /users/{userId}');
  expect(start, 'the users rules block moved or was renamed').toBeGreaterThan(-1);
  const end = rules.indexOf('match /auctions/{auctionId}', start);
  return rules.slice(start, end);
})();

/**
 * The self-update denylist array, as source text.
 *
 * Anchored inside `allow update:` on purpose. `allow create:` has its OWN
 * hasAny([...]) denylist a few lines earlier, and anchoring on the first
 * `request.auth.uid == userId` in the block lands on the CREATE one — which
 * would assert against the wrong list and pass while the update rule stayed
 * wide open.
 */
const selfUpdateDenylist = (() => {
  const update = usersBlock.indexOf('allow update:');
  expect(update, 'the users update rule moved').toBeGreaterThan(-1);
  const anchor = usersBlock.indexOf('request.auth.uid == userId &&', update);
  expect(anchor, 'the self-update clause moved').toBeGreaterThan(-1);
  const open = usersBlock.indexOf('hasAny([', anchor);
  expect(open, 'the self-update denylist moved').toBeGreaterThan(-1);
  return usersBlock.slice(open, usersBlock.indexOf('])', open));
})();

describe('bidding rate-limit state cannot be reset by the user it limits', () => {
  it('bidRateLimit is denylisted for self-writes', () => {
    expect(selfUpdateDenylist).toContain("'bidRateLimit'");
  });

  it('lastBidAt is denylisted too', () => {
    // The burst guard reads this. It pre-dates the limiter and was
    // self-resettable the whole time.
    expect(selfUpdateDenylist).toContain("'lastBidAt'");
  });

  it('the existing privilege flags are still denylisted — nothing was traded away', () => {
    for (const key of ['role', 'isAdmin', 'isBlocked', 'isVerified', 'isSeller', 'wonCount']) {
      expect(selfUpdateDenylist, `${key} fell off the denylist`).toContain(`'${key}'`);
    }
  });

  it('the users doc is still self-writable in general — this is a field lock, not a lockout', () => {
    // Profile edits (name, avatar, language, fcmToken…) must keep working.
    expect(usersBlock).toContain('request.auth.uid == userId &&');
    expect(usersBlock).toContain('allow update:');
  });

  it('the fields the limiter writes are exactly the fields that are locked', () => {
    // Drift guard: if placeBid starts writing a THIRD field of limiter state,
    // that field is unlocked until it is added here too.
    const index = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
    const placeBid = index.slice(index.indexOf('exports.placeBid'), index.indexOf('exports.releaseEscrow'));
    const writes = placeBid.match(/transaction\.update\(userRef, \{([^}]*)\}/gs) ?? [];
    expect(writes.length).toBeGreaterThan(0);
    const written = new Set();
    for (const w of writes) {
      for (const m of w.matchAll(/^\s*(\w+):/gm)) written.add(m[1]);
    }
    expect(written).toEqual(new Set(['lastBidAt', 'bidRateLimit']));
    for (const key of written) {
      expect(selfUpdateDenylist, `placeBid writes ${key} but it is self-writable`).toContain(`'${key}'`);
    }
  });
});
