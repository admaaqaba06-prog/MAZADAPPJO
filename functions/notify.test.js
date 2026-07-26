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
  it('account_banned admin/permanent ban does NOT claim a 48h duration', () => {
    const c = copyFor('account_banned', { reason: 'admin', blockedUntil: null });
    expect(c.type).toBe('alert');
    expect(c.description).not.toContain('٤٨');
    expect(c.description).not.toContain('48');
    expect(c.description.length).toBeGreaterThan(0);
  });
  it('unknown event yields a safe info default', () => {
    const c = copyFor('mystery', {});
    expect(c.type).toBe('info');
    expect(typeof c.title).toBe('string');
  });
});

const { dueReminders } = require('./notify');
const H = 3600 * 1000;
const D = 1_000_000_000_000; // arbitrary deadline ms
const order = (over = {}) => ({ status: 'waiting_payment', paymentDeadlineAt: D, paymentWindowHours: 24, ...over });

describe('dueReminders', () => {
  it('nothing due early in the window', () => {
    expect(dueReminders(order(), D - 20 * H)).toEqual([]); // 20h before deadline (>12h)
  });
  it('50% milestone once past halfway', () => {
    expect(dueReminders(order(), D - 10 * H)).toEqual(['50']); // 10h left (<12h)
  });
  it('does not resend 50% once flagged', () => {
    expect(dueReminders(order({ remind50Sent: true }), D - 10 * H)).toEqual([]);
  });
  it('final milestone inside last 2h supersedes 50', () => {
    expect(dueReminders(order(), D - 1 * H)).toEqual(['final']);
  });
  it('final not resent once flagged', () => {
    expect(dueReminders(order({ remindFinalSent: true }), D - 1 * H)).toEqual([]);
  });
  it('expired / non-waiting orders yield nothing', () => {
    expect(dueReminders(order(), D + H)).toEqual([]);
    expect(dueReminders(order({ status: 'paid' }), D - 1 * H)).toEqual([]);
  });
});
