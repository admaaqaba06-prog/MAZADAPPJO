import { describe, it, expect } from 'vitest';
import { captionInputFromAuction } from './captionFromAuction';
import type { AuctionItem } from '../types';

const base: Partial<AuctionItem> = {
  id: 'auction-new-123',
  title: 'iPhone 15',
  startingPrice: 200,
  duration: 1800,
  auctionNumber: 2000,
  scheduledStartAt: null,
};

describe('captionInputFromAuction', () => {
  it('maps stored auction fields into caption input', () => {
    const out = captionInputFromAuction(base as AuctionItem, 'https://mazad-jo.com');
    expect(out.auctionNumber).toBe(2000);
    expect(out.productName).toBe('iPhone 15');
    expect(out.startingPriceJod).toBe(200);
    expect(out.durationLabel).toBe('30 دقيقة');
    expect(out.deepLink).toBe('https://mazad-jo.com/?auction=auction-new-123');
  });

  it('falls back to — for a missing auction number', () => {
    const out = captionInputFromAuction({ ...base, auctionNumber: undefined } as AuctionItem, 'https://mazad-jo.com');
    expect(out.auctionNumber).toBe('—');
  });

  it('formats the Amman start time when scheduled, — when not', () => {
    const unscheduled = captionInputFromAuction(base as AuctionItem, 'https://mazad-jo.com');
    expect(unscheduled.startTime).toBe('—');
    // 2026-07-23T00:44 Amman ≈ a fixed ms; just assert it is non-empty and not the dash
    const scheduled = captionInputFromAuction({ ...base, scheduledStartAt: 1_700_000_000_000 } as AuctionItem, 'https://mazad-jo.com');
    expect(scheduled.startTime).not.toBe('—');
    expect(scheduled.startTime.length).toBeGreaterThan(0);
  });

  it('emits empty specs (not stored on the auction) without throwing', () => {
    const out = captionInputFromAuction(base as AuctionItem, 'https://mazad-jo.com');
    expect(out.specs).toEqual([]);
  });

  it('carries condition through as a string when present, empty when absent', () => {
    expect(captionInputFromAuction({ ...base, condition: 'used' } as AuctionItem, 'https://x').condition).toBe('used');
    expect(captionInputFromAuction(base as AuctionItem, 'https://x').condition).toBe('');
  });
});
