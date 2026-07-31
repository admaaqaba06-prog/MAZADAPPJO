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

describe('below_reserve_offer copy — second chance vs a genuine below-reserve offer', () => {
  // The second-chance flow REUSES this event (the n8n workflow routes a fixed
  // event contract), so the copy has to branch or it states something false:
  // for a second chance the bids did NOT fall short — the winner failed to pay.
  const title = 'ساعة';

  it('keeps today’s wording for a real below-reserve offer', () => {
    const c = copyFor('below_reserve_offer', { auctionTitle: title, topBid: 90 });
    expect(c.title).toBe('عرض أقل من السعر');
    expect(c.description).toBe(`أعلى مزايدة على "${title}" 90 د.أ — تقبل؟`);
  });

  it('tells the runner-up the WINNER did not pay, not that their bid fell short', () => {
    const c = copyFor('below_reserve_offer', {
      auctionTitle: title, topBid: 90, secondChance: true, offerStatus: 'pending_buyer',
    });
    expect(c.description).toContain('لم يكمل الفائز');
    expect(c.description).toContain('معروض عليك');
    expect(c.description).not.toContain('أعلى مزايدة على');
    expect(c.description).toContain('90');
  });

  it('asks the SELLER to decide when the runner-up bid is under the reserve', () => {
    const c = copyFor('below_reserve_offer', {
      auctionTitle: title, topBid: 90, secondChance: true, offerStatus: 'pending_seller',
    });
    expect(c.description).toContain('لم يكمل الفائز');
    expect(c.description).toContain('سعرك المطلوب');
    // Addressed to the seller — never tells them the lot is offered to them.
    expect(c.description).not.toContain('معروض عليك');
  });

  it('gives the two audiences different copy', () => {
    const seller = copyFor('below_reserve_offer', { auctionTitle: title, secondChance: true, offerStatus: 'pending_seller' });
    const buyer = copyFor('below_reserve_offer', { auctionTitle: title, secondChance: true, offerStatus: 'pending_buyer' });
    expect(seller.title).not.toBe(buyer.title);
    expect(seller.description).not.toBe(buyer.description);
  });

  it('only branches on an explicit true — a stray falsy flag keeps the default', () => {
    const c = copyFor('below_reserve_offer', { auctionTitle: title, topBid: 90, secondChance: false });
    expect(c.title).toBe('عرض أقل من السعر');
  });
});

describe('below_reserve_declined copy — who closed the second chance', () => {
  // The event is reused for both directions. Its default line says the SELLER
  // did not accept — false when the runner-up is the one who declined, and that
  // message now goes to the SELLER, whose lot has just become relist-eligible.
  it('keeps the bidder-facing wording when the seller declines', () => {
    const c = copyFor('below_reserve_declined', { auctionTitle: 'ساعة', secondChance: true, declinedBy: 'seller' });
    expect(c.description).toContain('لم يقبل البائع');
    expect(c.type).toBe('loss');
  });

  it('tells the seller the runner-up declined and the lot is theirs again', () => {
    const c = copyFor('below_reserve_declined', { auctionTitle: 'ساعة', secondChance: true, declinedBy: 'buyer' });
    expect(c.description).toContain('رفض المزايد');
    expect(c.description).not.toContain('مزايدتك');
    expect(c.description).toContain('ساعة');
  });

  it('is unchanged for a plain below-reserve decline', () => {
    const c = copyFor('below_reserve_declined', { auctionTitle: 'ساعة' });
    expect(c).toEqual({ type: 'loss', title: 'لم يُقبل العرض', description: 'لم يقبل البائع مزايدتك على "ساعة".' });
  });
});

describe('E6 return events', () => {
  it('return_requested → all channels', () => {
    expect(channelsFor('return_requested')).toEqual({ inapp: true, whatsapp: true, email: true });
  });
  it('return_resolved → all channels', () => {
    expect(channelsFor('return_resolved')).toEqual({ inapp: true, whatsapp: true, email: true });
  });
  it('return_requested copy is an order-type with the title', () => {
    const c = copyFor('return_requested', { auctionTitle: 'ساعة' });
    expect(c.type).toBe('order');
    expect(c.description).toContain('ساعة');
  });
  it('return_resolved copy branches on outcome', () => {
    const refunded = copyFor('return_resolved', { auctionTitle: 'ساعة', outcome: 'refunded' });
    const denied = copyFor('return_resolved', { auctionTitle: 'ساعة', outcome: 'denied' });
    expect(refunded.description).not.toEqual(denied.description);
  });
});
