import { describe, it, expect } from 'vitest';
const { channelsFor } = require('./notify');

describe('channelsFor', () => {
  it('auction_won → all three channels', () => {
    expect(channelsFor('auction_won')).toEqual({ inapp: true, whatsapp: true, email: true });
  });
  it('outbid → in-app + whatsapp, NOT email', () => {
    expect(channelsFor('outbid')).toEqual({ inapp: true, whatsapp: true, email: false });
  });
  it('below_reserve_declined → in-app only', () => {
    expect(channelsFor('below_reserve_declined')).toEqual({ inapp: true, whatsapp: false, email: false });
  });
  it('account_banned → all three', () => {
    expect(channelsFor('account_banned')).toEqual({ inapp: true, whatsapp: true, email: true });
  });
  it('unknown event defaults to in-app only (never silently emails)', () => {
    expect(channelsFor('made_up_event')).toEqual({ inapp: true, whatsapp: false, email: false });
  });
});

const { copyFor } = require('./notify');

describe('copyFor', () => {
  it('auction_won maps to win type with title + interpolated body', () => {
    const c = copyFor('auction_won', { auctionTitle: 'ساعة', totalDue: 105 });
    expect(c.type).toBe('win');
    expect(c.title.length).toBeGreaterThan(0);
    expect(c.description).toContain('ساعة');
  });
  it('account_banned maps to alert type', () => {
    expect(copyFor('account_banned', { reason: 'payment_default' }).type).toBe('alert');
  });
  it('unknown event yields a safe info default', () => {
    const c = copyFor('mystery', {});
    expect(c.type).toBe('info');
    expect(typeof c.title).toBe('string');
  });
});
