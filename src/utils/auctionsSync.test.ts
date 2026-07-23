import { describe, it, expect } from 'vitest';
import { syncAuctionsFromSnapshot, type AuctionDocChangeLike } from './auctionsSync';

// ---------------------------------------------------------------------------
// PF5 — identity-preserving auctions snapshot sync.
//
// The contract under test (money-adjacent — the live bid room renders from
// this output):
//   1. VALUE PARITY with today's full remap: for every scenario the result
//      must deep-equal `docs.map(mapDoc)` — the exact array the pre-PF5
//      `snap.forEach(mapAuctionDoc)` handler produced. This is the proof that
//      a changed lot carries EVERY field (currentPrice, currentBidderId,
//      endTime, status, totalBids, winnerId, …): the mapper spreads the whole
//      doc, and deep-equality over the whole array tolerates no dropped or
//      stale field.
//   2. IDENTITY PRESERVATION: any doc NOT in docChanges keeps its previous
//      object reference (`===`), so downstream memos/countdowns stop churning.
//   3. ORDER: the output order is exactly `docs` order (the snapshot's query
//      order — orderBy createdAt desc in prod), same as today's snap.forEach.
//   4. 'removed' docs are gone; 'added'/'modified' docs are freshly mapped.
// ---------------------------------------------------------------------------

/** Doc-shaped test double: mirrors QueryDocumentSnapshot {id, data()}. */
interface FakeDoc {
  id: string;
  data: Record<string, unknown>;
}

/** Mapped item: mirrors mapAuctionDoc's "id + spread of the WHOLE doc" shape. */
interface FakeItem {
  id: string;
  [key: string]: unknown;
}

const d = (id: string, data: Record<string, unknown> = {}): FakeDoc => ({ id, data });

/**
 * Mirrors mapAuctionDoc's structure: a new object per call, `id` plus a spread
 * of ALL doc fields (mapAuctionDoc ends in `...data`). Any field the server
 * writes flows through — nothing is hand-picked, exactly like production.
 */
const mapDoc = (doc: FakeDoc): FakeItem => ({ id: doc.id, ...doc.data });

/** Counting wrapper so tests can assert HOW MANY docs were remapped. */
const countingMapper = () => {
  const mappedIds: string[] = [];
  const fn = (doc: FakeDoc): FakeItem => {
    mappedIds.push(doc.id);
    return mapDoc(doc);
  };
  return { fn, mappedIds };
};

const change = (
  type: AuctionDocChangeLike<FakeDoc>['type'],
  doc: FakeDoc
): AuctionDocChangeLike<FakeDoc> => ({ type, doc });

const sync = (
  prev: readonly FakeItem[],
  docs: readonly FakeDoc[],
  changes: readonly AuctionDocChangeLike<FakeDoc>[],
  mapFn: (doc: FakeDoc) => FakeItem = mapDoc
) =>
  syncAuctionsFromSnapshot({
    prev,
    docs,
    changes,
    getId: (doc: FakeDoc) => doc.id,
    mapDoc: mapFn,
  });

/** The pre-PF5 behavior: full remap of every snapshot doc, in snapshot order. */
const fullRemap = (docs: readonly FakeDoc[]) => docs.map(mapDoc);

describe('syncAuctionsFromSnapshot (PF5 merge helper)', () => {
  // -------------------------------------------------------------- first load
  it('first load: empty prev + all-added changes maps every doc in snapshot order', () => {
    const docs = [d('a', { currentPrice: 10 }), d('b', { currentPrice: 20 }), d('c', { currentPrice: 30 })];
    const changes = docs.map((doc) => change('added', doc));
    const result = sync([], docs, changes);

    expect(result).toEqual(fullRemap(docs));
    expect(result.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('empty snapshot (all docs removed) yields an empty array', () => {
    const prev = fullRemap([d('a'), d('b')]);
    const result = sync(prev, [], [change('removed', d('a')), change('removed', d('b'))]);
    expect(result).toEqual([]);
  });

  // ---------------------------------------------------------------- modified
  it('modified: ONLY the changed doc is remapped; every sibling keeps its exact previous reference', () => {
    const docs0 = [d('a', { currentPrice: 10 }), d('b', { currentPrice: 20 }), d('c', { currentPrice: 30 })];
    const prev = sync([], docs0, docs0.map((doc) => change('added', doc)));

    const bBid = d('b', { currentPrice: 25 });
    const docs1 = [docs0[0], bBid, docs0[2]];
    const { fn, mappedIds } = countingMapper();
    const result = sync(prev, docs1, [change('modified', bBid)], fn);

    // Only the bid-on lot was remapped.
    expect(mappedIds).toEqual(['b']);
    // Untouched lots: SAME reference (this is what stops downstream churn).
    expect(result[0]).toBe(prev[0]);
    expect(result[2]).toBe(prev[2]);
    // Changed lot: fresh object with the new value.
    expect(result[1]).not.toBe(prev[1]);
    expect(result[1].currentPrice).toBe(25);
    // Value parity with the old full remap.
    expect(result).toEqual(fullRemap(docs1));
  });

  it('MONEY-ADJACENT: a modified lot carries EVERY field the room reads — nothing hand-picked, nothing stale', () => {
    const before = d('hot', {
      currentPrice: 100,
      currentBidderId: 'u1',
      currentBidderName: 'Aisha',
      endTime: 1_000_000,
      endsAt: 1_000_000,
      status: 'live',
      totalBids: 4,
      minIncrement: 5,
      winnerId: null,
      viewersCount: 12,
    });
    const cold = d('cold', { currentPrice: 7, status: 'live' });
    const prev = sync([], [before, cold], [change('added', before), change('added', cold)]);

    // A bid in the snipe window: price, bidder, totals AND the anti-snipe
    // endTime extension all change at once — plus a brand-new field the
    // server started writing (winnerId). ALL must flow through.
    const after = d('hot', {
      currentPrice: 105,
      currentBidderId: 'u2',
      currentBidderName: 'Omar',
      endTime: 1_015_000, // +15s anti-snipe extension
      endsAt: 1_015_000,
      status: 'live',
      totalBids: 5,
      minIncrement: 5,
      winnerId: 'u2',
      viewersCount: 13,
    });
    const result = sync(prev, [after, cold], [change('modified', after)]);

    // Byte-for-byte the same item today's full remap would produce.
    expect(result[0]).toEqual(mapDoc(after));
    // And explicitly, every room-critical field:
    expect(result[0].currentPrice).toBe(105);
    expect(result[0].currentBidderId).toBe('u2');
    expect(result[0].currentBidderName).toBe('Omar');
    expect(result[0].endTime).toBe(1_015_000);
    expect(result[0].endsAt).toBe(1_015_000);
    expect(result[0].status).toBe('live');
    expect(result[0].totalBids).toBe(5);
    expect(result[0].winnerId).toBe('u2');
    // Whole-array parity with the pre-PF5 handler.
    expect(result).toEqual(fullRemap([after, cold]));
    // Sibling untouched.
    expect(result[1]).toBe(prev[1]);
  });

  it('status flip live→completed on a modified doc flows through (win detection reads this)', () => {
    const live = d('a', { status: 'live', currentPrice: 50, winnerId: null });
    const prev = sync([], [live], [change('added', live)]);

    const done = d('a', { status: 'completed', currentPrice: 50, winnerId: 'u9' });
    const result = sync(prev, [done], [change('modified', done)]);

    expect(result[0].status).toBe('completed');
    expect(result[0].winnerId).toBe('u9');
    expect(result).toEqual(fullRemap([done]));
  });

  it('a field REMOVED from the doc disappears from the remapped item (no stale merge residue)', () => {
    const withBidder = d('a', { currentPrice: 10, currentBidderId: 'u1' });
    const prev = sync([], [withBidder], [change('added', withBidder)]);

    // Server rewrote the doc without currentBidderId (e.g. reset). A merge
    // that patched fields onto the old object would leave 'u1' behind — the
    // full remap must not.
    const reset = d('a', { currentPrice: 10 });
    const result = sync(prev, [reset], [change('modified', reset)]);

    expect(result[0]).toEqual({ id: 'a', currentPrice: 10 });
    expect('currentBidderId' in result[0]).toBe(false);
  });

  // ------------------------------------------------------------------- added
  it('added: a new drop lands at its snapshot position (top, createdAt desc); siblings keep identity', () => {
    const docs0 = [d('b', { n: 2 }), d('c', { n: 3 })];
    const prev = sync([], docs0, docs0.map((doc) => change('added', doc)));

    const fresh = d('a', { n: 1 });
    const docs1 = [fresh, ...docs0]; // newest-first: new doc arrives at index 0
    const { fn, mappedIds } = countingMapper();
    const result = sync(prev, docs1, [change('added', fresh)], fn);

    expect(mappedIds).toEqual(['a']);
    expect(result.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(result[1]).toBe(prev[0]);
    expect(result[2]).toBe(prev[1]);
    expect(result).toEqual(fullRemap(docs1));
  });

  // ----------------------------------------------------------------- removed
  it('removed: the doc is gone from the result; survivors keep identity and snapshot order', () => {
    const docs0 = [d('a', { n: 1 }), d('b', { n: 2 }), d('c', { n: 3 })];
    const prev = sync([], docs0, docs0.map((doc) => change('added', doc)));

    const docs1 = [docs0[0], docs0[2]]; // 'b' left the query window
    const { fn, mappedIds } = countingMapper();
    const result = sync(prev, docs1, [change('removed', docs0[1])], fn);

    expect(mappedIds).toEqual([]); // nothing remapped at all
    expect(result.map((i) => i.id)).toEqual(['a', 'c']);
    expect(result[0]).toBe(prev[0]);
    expect(result[1]).toBe(prev[2]);
    expect(result).toEqual(fullRemap(docs1));
  });

  it('removed + modified in one snapshot batch', () => {
    const docs0 = [d('a', { n: 1 }), d('b', { n: 2 }), d('c', { n: 3 })];
    const prev = sync([], docs0, docs0.map((doc) => change('added', doc)));

    const cNew = d('c', { n: 33 });
    const docs1 = [docs0[0], cNew];
    const result = sync(prev, docs1, [change('removed', docs0[1]), change('modified', cNew)]);

    expect(result.map((i) => i.id)).toEqual(['a', 'c']);
    expect(result[0]).toBe(prev[0]);
    expect(result[1].n).toBe(33);
    expect(result).toEqual(fullRemap(docs1));
  });

  // -------------------------------------------------------------------- order
  it('order always follows the snapshot docs order, even when a modified doc moved position', () => {
    const docs0 = [d('a', { n: 1 }), d('b', { n: 2 }), d('c', { n: 3 })];
    const prev = sync([], docs0, docs0.map((doc) => change('added', doc)));

    // 'c' modified and the query now orders it first.
    const cNew = d('c', { n: 30 });
    const docs1 = [cNew, docs0[0], docs0[1]];
    const result = sync(prev, docs1, [change('modified', cNew)]);

    expect(result.map((i) => i.id)).toEqual(['c', 'a', 'b']);
    expect(result[1]).toBe(prev[0]);
    expect(result[2]).toBe(prev[1]);
    expect(result).toEqual(fullRemap(docs1));
  });

  // ------------------------------------------------------ identity semantics
  it('an unchanged lot keeps its client-patched object (resolved videoUrl survives sibling churn)', () => {
    const docs0 = [d('a', { videoUrl: 'blob:x' }), d('b', { currentPrice: 1 })];
    const prev0 = sync([], docs0, docs0.map((doc) => change('added', doc)));

    // The async video resolver patched lot 'a' in place (new object, resolved URL).
    const patchedA = { ...prev0[0], videoUrl: 'idb://resolved' };
    const prev1 = [patchedA, prev0[1]];

    // A bid lands on 'b' — 'a' must keep the PATCHED object, not be re-derived.
    const bNew = d('b', { currentPrice: 2 });
    const result = sync(prev1, [docs0[0], bNew], [change('modified', bNew)]);

    expect(result[0]).toBe(patchedA);
    expect(result[0].videoUrl).toBe('idb://resolved');
    expect(result[1].currentPrice).toBe(2);
  });

  it('no effective change (empty docChanges) returns the previous array reference itself', () => {
    const docs0 = [d('a', { n: 1 }), d('b', { n: 2 })];
    const prev = sync([], docs0, docs0.map((doc) => change('added', doc)));

    const result = sync(prev, docs0, []);
    expect(result).toBe(prev);
  });

  // ---------------------------------------------------------------- defensive
  it('DEFENSIVE: a snapshot doc missing from both prev and changes is still mapped fresh — a lot is never dropped', () => {
    // Should be impossible per Firestore's contract (initial snapshot lists
    // every doc as 'added'), but the bid room must never lose a lot if the
    // contract is ever violated.
    const known = d('a', { n: 1 });
    const prev = sync([], [known], [change('added', known)]);

    const ghost = d('ghost', { currentPrice: 99 });
    const result = sync(prev, [known, ghost], []);

    expect(result.map((i) => i.id)).toEqual(['a', 'ghost']);
    expect(result[0]).toBe(prev[0]);
    expect(result[1]).toEqual({ id: 'ghost', currentPrice: 99 });
  });

  it('a doc both removed and re-listed keeps working (fresh map wins, nothing stale)', () => {
    // Pathological batch: 'a' appears as removed but is still in docs (e.g. a
    // consolidation edge). The helper must prefer the live snapshot: since the
    // removal dropped the prior reference, the doc is mapped fresh from docs.
    const a0 = d('a', { n: 1 });
    const prev = sync([], [a0], [change('added', a0)]);

    const a1 = d('a', { n: 2 });
    const result = sync(prev, [a1], [change('removed', a0)]);

    expect(result).toEqual([{ id: 'a', n: 2 }]);
    expect(result[0]).not.toBe(prev[0]);
  });

  it('duplicate prev entries with the same id do not corrupt the map (last write wins, output follows docs)', () => {
    const a = d('a', { n: 1 });
    const stale = { id: 'a', n: 0 };
    const current = { id: 'a', n: 1 };
    const result = sync([stale, current], [a], []);
    expect(result).toEqual([current]);
    expect(result[0]).toBe(current);
  });
});
