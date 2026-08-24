// The live room must never render a DIFFERENT lot than the one asked for.
//
// THE BUG. `LiveStreamView` resolved the active lot as:
//
//   const activeAuction = docLot ?? feedLive.find(a => a.id === activeAuctionId) ?? feedLive[0];
//
// `feedLive[0]` is whatever sits first in the ending-soon feed — a different
// auction. That fallback was written for two real cases: the placeholder id
// AppContext seeds (`'auction-rolex'`, not a real doc) when the room opens with
// no lot, and an id that no longer resolves. But `useAuctionDoc` returned `null`
// while a lot was still LOADING too, and null is null — so every deep link,
// refresh and shared link rendered the wrong auction's title, description,
// condition and price. The id-sync effect then wrote that other lot's id into
// `activeAuctionId`, so the substitution stuck instead of flickering.
//
// `useAuctionDoc` also swallowed absence outright: the snapshot handler opened
// with `if (!snap.exists()) return;`, so a missing doc never notified anything
// and was indistinguishable from one still in flight.
//
// THE FIX. `useAuctionDocState` reports which of the three null-ish states you
// are in ('idle' | 'loading' | 'found' | 'missing'), and the room only accepts
// the feed substitute once loading has resolved.
//
// Source-text assertions: vitest here is `environment: 'node'` with no jsdom, so
// neither the hook nor the room can be rendered. The house idiom, per
// src/components/desktopDescription.wiring.test.ts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const ROOM = readFileSync(new URL('./LiveStreamView.tsx', import.meta.url), 'utf8');
const HOOK = readFileSync(new URL('../hooks/useAuctionDoc.ts', import.meta.url), 'utf8');

/**
 * The expression the room resolves the active lot with, sliced from its
 * declaration to the following statement so it stays anchored if the comment
 * above it changes.
 */
function activeAuctionExpression(): string {
  const at = ROOM.indexOf('const activeAuction =');
  if (at === -1) throw new Error('`const activeAuction =` not found — was it renamed?');
  const end = ROOM.indexOf(';', at);
  if (end === -1) throw new Error('the activeAuction declaration never terminates');
  return ROOM.slice(at, end + 1);
}

describe('the live room resolves the lot it was asked for', () => {
  it('does not substitute the first feed lot while the requested one is loading', () => {
    const expr = activeAuctionExpression();
    // The feed fallback must be gated on the load having finished. An
    // ungated `?? feedLive[0]` is the bug.
    expect(expr).toContain('feedLive[0]');
    expect(expr).toMatch(/docStatus\s*===\s*'loading'/);
  });

  it('reads the doc through the state-aware hook, not the collapsing one', () => {
    // `useAuctionDoc` flattens loading/missing/idle to null, which is what made
    // the substitution invisible. The room must take the status too.
    expect(ROOM).toMatch(/useAuctionDocState\(activeAuctionId\)/);
    expect(ROOM).toMatch(/import \{ useAuctionDocState \}/);
  });

  it('renders a loading state rather than "no live auctions"', () => {
    // Falling through to the empty branch told someone with a good link that the
    // auction does not exist.
    expect(ROOM).toContain('live-stream-loading');
    const at = ROOM.indexOf('live-stream-loading');
    const emptyAt = ROOM.indexOf('no-live-stream-fallback');
    expect(at, 'the loading branch must be checked BEFORE the empty branch').toBeLessThan(emptyAt);
  });
});

describe('useAuctionDoc distinguishes loading from missing', () => {
  it('exposes the four states', () => {
    expect(HOOK).toMatch(/AuctionDocStatus\s*=\s*'idle'\s*\|\s*'loading'\s*\|\s*'found'\s*\|\s*'missing'/);
    expect(HOOK).toMatch(/export function useAuctionDocState/);
  });

  it('reports an absent doc instead of swallowing it', () => {
    // The original handler was `if (!snap.exists()) return;` — absence never
    // reached a listener, so it could not be told from "not yet".
    expect(HOOK).not.toMatch(/if \(!snap\.exists\(\)\) return;/);
    expect(HOOK).toMatch(/missing\s*=\s*true/);
  });

  it('keeps useAuctionDoc working for its existing callers', () => {
    // ReelsDesktopRightPanel still takes the plain item; the change is additive.
    expect(HOOK).toMatch(/export function useAuctionDoc\([\s\S]{0,80}useAuctionDocState\(id\)\.item/);
  });
});
