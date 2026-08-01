// The Seller Center used to fabricate social proof.
//
// When a seller had no reviews, an `async` onSnapshot callback wrote three
// invented 5-star reviews into Firestore — made-up reviewer names, stock-photo
// avatars, invented purchase histories — with the comment "to make it feel rich
// and genuine". firestore.rules refused every write (a review's buyerId must
// equal the caller's uid), so nothing reached production; but because the awaits
// sat in an async handler with no catch, each refusal surfaced as an UNCAUGHT
// rejection — ~97 in ten seconds on a live Seller Center load.
//
// Source-text assertions: vitest here is environment: 'node' with no jsdom, so
// the component cannot be rendered. The house idiom, per
// src/components/order/SecondChanceCard.wiring.test.ts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('./SellerCenterView.tsx', import.meta.url), 'utf8');

describe('the Seller Center never fabricates reviews', () => {
  it('carries no seeded review ids or invented buyer ids', () => {
    expect(SRC).not.toMatch(/rev-seed-/);
    expect(SRC).not.toMatch(/buyer-seed-/);
  });

  it('has no defaultReviews array', () => {
    expect(SRC).not.toMatch(/defaultReviews/);
  });

  it('never writes to the reviews collection', () => {
    // The only legitimate review writer is the buyer, from OrderDetailsView.
    expect(SRC).not.toMatch(/setDoc\(\s*doc\(db,\s*['"]reviews['"]/);
    expect(SRC).not.toMatch(/addDoc\(\s*collection\(db,\s*['"]reviews['"]/);
  });
});

describe('the reviews snapshot handler cannot leak an unhandled rejection', () => {
  const handler = SRC.slice(
    SRC.indexOf("collection(db, 'reviews')"),
    SRC.indexOf('// 2.', SRC.indexOf("collection(db, 'reviews')")),
  );

  it('is not async — an async snapshot callback swallows its own rejections', () => {
    // `onSnapshot`'s error callback catches SUBSCRIPTION errors only. A rejected
    // await inside an async success handler bypasses it entirely and lands as an
    // uncaught rejection, which is exactly how this shipped.
    expect(handler).not.toMatch(/onSnapshot\([^,]+,\s*async/);
  });

  it('still reports subscription failures', () => {
    expect(handler).toMatch(/\(err\)/);
  });

  it('clears reviews on an empty snapshot rather than inventing them', () => {
    expect(handler).toMatch(/snap\.empty/);
    expect(handler).toMatch(/setReviews\(\[\]\)/);
  });
});
