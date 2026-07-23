import { describe, expect, it } from 'vitest';
import { stripReserve } from './reserveStrip';

describe('stripReserve', () => {
  it('removes reservePrice from auctionInput and returns it separately when present', () => {
    const listingData = {
      title: 'Vintage Rolex',
      startingPrice: 100,
      reservePrice: 500
    };

    const result = stripReserve(listingData);

    expect('reservePrice' in result.auctionInput).toBe(false);
    expect(result.reservePrice).toBe(500);
  });

  it('preserves other fields on auctionInput untouched', () => {
    const listingData = {
      title: 'Vintage Rolex',
      startingPrice: 100,
      reservePrice: 500
    };

    const result = stripReserve(listingData);

    expect(result.auctionInput.title).toBe('Vintage Rolex');
    expect(result.auctionInput.startingPrice).toBe(100);
  });

  it('leaves auctionInput unchanged and reservePrice undefined when no reservePrice is given', () => {
    const listingData = {
      title: 'No Reserve Item',
      startingPrice: 50
    };

    const result = stripReserve(listingData);

    expect('reservePrice' in result.auctionInput).toBe(false);
    expect(result.reservePrice).toBeUndefined();
    expect(result.auctionInput.title).toBe('No Reserve Item');
    expect(result.auctionInput.startingPrice).toBe(50);
  });
});
