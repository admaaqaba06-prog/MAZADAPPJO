// The sign-in screen's marketing panel shows real inventory or nothing at all.
//
// These rules are the spec's honesty rules made testable
// (docs/superpowers/specs/2026-08-03-signin-screen-design.md). The panel is the
// first full-attention moment the product gets, which is exactly the surface
// where invented content appears — this repo has already removed fabricated
// seller reviews (#198) and fabricated auction descriptions (#199).
import { describe, it, expect } from 'vitest';
import { selectPanelActivity, isRenderableLot, PANEL_LOT_CAP } from './signInPanel';
import type { LandingAuction, LandingAuctionsState } from '../landing/useLandingAuctions';

const lot = (over: Partial<LandingAuction> = {}): LandingAuction => ({
  id: 'a1',
  title: 'Apple Watch Ultra',
  category: 'misc' as LandingAuction['category'],
  currentPrice: 145,
  totalBids: 3,
  endTime: undefined,
  createdAt: 1,
  featuredRank: undefined,
  imageUrl: 'https://x/y.jpg',
  isFeatured: false,
  isVerified: true,
  ...over,
});

const state = (over: Partial<LandingAuctionsState> = {}): LandingAuctionsState => ({
  auctions: [lot()],
  isLoading: false,
  isEmpty: false,
  isError: false,
  ...over,
});

describe('isRenderableLot', () => {
  it('accepts a lot with an image, a title and a price', () => {
    expect(isRenderableLot(lot())).toBe(true);
  });

  it('rejects a lot that would render half-empty', () => {
    // A card with a missing image or a blank title reads as broken, and a broken
    // card on this screen implies a broken marketplace.
    expect(isRenderableLot(lot({ imageUrl: '' }))).toBe(false);
    expect(isRenderableLot(lot({ imageUrl: '   ' }))).toBe(false);
    expect(isRenderableLot(lot({ title: '' }))).toBe(false);
    expect(isRenderableLot(lot({ title: '   ' }))).toBe(false);
    expect(isRenderableLot(lot({ currentPrice: NaN }))).toBe(false);
    expect(isRenderableLot(lot({ currentPrice: undefined as never }))).toBe(false);
    expect(isRenderableLot(lot({ imageUrl: undefined as never }))).toBe(false);
  });

  it('accepts a price of zero — an opening lot is real inventory', () => {
    expect(isRenderableLot(lot({ currentPrice: 0 }))).toBe(true);
  });
});

describe('selectPanelActivity', () => {
  it('returns the real count and at most PANEL_LOT_CAP lots', () => {
    const many = Array.from({ length: 8 }, (_, i) => lot({ id: `a${i}` }));
    const r = selectPanelActivity(state({ auctions: many }));
    expect(r).not.toBeNull();
    expect(r!.count).toBe(8); // the REAL number, not the number displayed
    expect(r!.lots).toHaveLength(PANEL_LOT_CAP);
  });

  it('returns null while loading — the slot renders nothing, never a skeleton', () => {
    // A placeholder shaped like content promises content that may never arrive.
    expect(selectPanelActivity(state({ isLoading: true, auctions: [] }))).toBeNull();
    // …and still null even if a stale list is somehow present alongside the flag.
    expect(selectPanelActivity(state({ isLoading: true }))).toBeNull();
  });

  it('returns null when empty or errored — the block disappears entirely', () => {
    expect(selectPanelActivity(state({ isEmpty: true, auctions: [] }))).toBeNull();
    expect(selectPanelActivity(state({ isError: true, auctions: [] }))).toBeNull();
  });

  it('honours the flags even when a STALE list is still in state', () => {
    // Found by mutation: the cases above also pass `auctions: []`, so the empty
    // check alone satisfied them and the flags were never load-bearing. A failed
    // refetch can leave the previous list in place — showing it would present
    // sold or expired lots as live.
    expect(selectPanelActivity(state({ isError: true, auctions: [lot()] }))).toBeNull();
    expect(selectPanelActivity(state({ isEmpty: true, auctions: [lot()] }))).toBeNull();
    expect(selectPanelActivity(state({ isLoading: true, auctions: [lot()] }))).toBeNull();
  });

  it('skips an unrenderable lot rather than showing it half-empty', () => {
    const lots = [
      lot({ id: 'ok' }),
      lot({ id: 'noimg', imageUrl: '' }),
      lot({ id: 'notitle', title: '   ' }),
      lot({ id: 'ok2' }),
    ];
    const r = selectPanelActivity(state({ auctions: lots }));
    expect(r!.lots.map((l) => l.id)).toEqual(['ok', 'ok2']);
  });

  it('counts every live lot, including ones it cannot render', () => {
    // The count states the size of the marketplace, not how many happen to
    // carry an image. Reporting 1 when 2 are live would understate it.
    const lots = [lot({ id: 'ok' }), lot({ id: 'noimg', imageUrl: '' })];
    expect(selectPanelActivity(state({ auctions: lots }))!.count).toBe(2);
  });

  it('returns null when nothing is renderable, even with a non-zero count', () => {
    // A count with no lots beneath it looks like a failed render.
    const r = selectPanelActivity(state({ auctions: [lot({ id: 'x', imageUrl: '' })] }));
    expect(r).toBeNull();
  });

  it('returns null for an empty list even when no flag says so', () => {
    expect(selectPanelActivity(state({ auctions: [] }))).toBeNull();
  });

  it('survives a malformed state without throwing', () => {
    expect(selectPanelActivity(state({ auctions: null as never }))).toBeNull();
    expect(selectPanelActivity(state({ auctions: undefined as never }))).toBeNull();
  });

  it('trims the title it exposes', () => {
    const r = selectPanelActivity(state({ auctions: [lot({ title: '  Rolex  ' })] }));
    expect(r!.lots[0].title).toBe('Rolex');
  });

  it('never exposes a clock field — only 4 of 149 live lots have one', () => {
    // Asserted structurally, not by absence of a string: a countdown cannot be
    // rendered from data the panel never receives.
    const r = selectPanelActivity(state({ auctions: [lot({ endTime: Date.now() + 600000 })] }));
    const keys = Object.keys(r!.lots[0]);
    expect(keys).not.toContain('endTime');
    expect(keys).not.toContain('endsAt');
    expect(keys.sort()).toEqual(['currentPrice', 'id', 'imageUrl', 'title']);
  });

  it('honours an explicit cap', () => {
    const many = Array.from({ length: 8 }, (_, i) => lot({ id: `a${i}` }));
    expect(selectPanelActivity(state({ auctions: many }), 1).lots).toHaveLength(1);
  });
});
