import { describe, it, expect } from 'vitest';
import { buildActionQueue, SLA_MS, type ActionQueueInput } from './actionQueue';

const NOW = 1_800_000_000_000;
const HOUR = 60 * 60 * 1000;

const empty: ActionQueueInput = {
  orders: [], pendingListings: [], subscriptionRequests: [], withdrawals: [],
};

const input = (over: Partial<ActionQueueInput>): ActionQueueInput => ({ ...empty, ...over });

describe('buildActionQueue — the empty state', () => {
  it('returns nothing when nothing needs a human', () => {
    expect(buildActionQueue(empty, NOW)).toEqual([]);
  });
});

describe('buildActionQueue — money rows', () => {
  it('raises a row for an order payment awaiting verification', () => {
    const rows = buildActionQueue(input({
      orders: [{
        id: 'o1', status: 'paid', paymentProofUrl: 'https://x/r.png',
        paymentVerified: false, totalDue: 10,
        paymentSubmittedAt: { seconds: (NOW - 2 * HOUR) / 1000 },
      }],
    }), NOW);

    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('verify_order_payment');
    expect(rows[0].reason).toBe('receipt_to_verify');
    expect(rows[0].entityId).toBe('o1');
    expect(rows[0].id).toBe('verify_order_payment:o1');
    expect(rows[0].severity).toBe('new');
    expect(rows[0].amountFils).toBe(10_000);
  });

  it('ages an order payment past the 24h SLA', () => {
    const rows = buildActionQueue(input({
      orders: [{
        id: 'o1', status: 'paid', paymentProofUrl: 'https://x/r.png',
        paymentVerified: false,
        paymentSubmittedAt: { seconds: (NOW - 25 * HOUR) / 1000 },
      }],
    }), NOW);
    expect(rows[0].severity).toBe('aging');
  });

  it('does not raise a row for an already-verified payment', () => {
    const rows = buildActionQueue(input({
      orders: [{
        id: 'o1', status: 'paid', paymentProofUrl: 'https://x/r.png', paymentVerified: true,
      }],
    }), NOW);
    expect(rows.filter(r => r.kind === 'verify_order_payment')).toHaveLength(0);
  });

  it('raises a row for a membership request and a pending payout', () => {
    const rows = buildActionQueue(input({
      subscriptionRequests: [{ id: 's1', userId: 'u1', createdAt: NOW - 3 * HOUR }],
      withdrawals: [{ id: 'w1', userId: 'u2', status: 'pending_review', amount: 25, timestamp: NOW - HOUR }],
    }), NOW);

    expect(rows.map(r => r.kind).sort()).toEqual(['payout', 'verify_membership']);
    const payout = rows.find(r => r.kind === 'payout')!;
    expect(payout.reason).toBe('payout_to_approve');
    expect(payout.amountFils).toBe(25_000);
  });

  it('ignores a withdrawal that is not pending review', () => {
    const rows = buildActionQueue(input({
      withdrawals: [{ id: 'w1', userId: 'u2', status: 'completed', amount: 25, timestamp: NOW }],
    }), NOW);
    expect(rows).toEqual([]);
  });
});

describe('buildActionQueue — ordering', () => {
  it('sorts aging before new, then oldest first, then larger amount first', () => {
    const rows = buildActionQueue(input({
      subscriptionRequests: [{ id: 'fresh', userId: 'u', createdAt: NOW - HOUR }],
      withdrawals: [
        { id: 'old-small', userId: 'u', status: 'pending_review', amount: 5, timestamp: NOW - 40 * HOUR },
        { id: 'old-big', userId: 'u', status: 'pending_review', amount: 500, timestamp: NOW - 40 * HOUR },
      ],
    }), NOW);

    // Both withdrawals are aging and equally old, so the larger amount wins the tie.
    expect(rows.map(r => r.entityId)).toEqual(['old-big', 'old-small', 'fresh']);
  });

  it('is deterministic — the same input yields the same order', () => {
    const i = input({
      withdrawals: [
        { id: 'a', userId: 'u', status: 'pending_review', amount: 5, timestamp: NOW - HOUR },
        { id: 'b', userId: 'u', status: 'pending_review', amount: 5, timestamp: NOW - HOUR },
      ],
    });
    expect(buildActionQueue(i, NOW).map(r => r.id)).toEqual(buildActionQueue(i, NOW).map(r => r.id));
  });
});

describe('buildActionQueue — malformed input never breaks the queue', () => {
  it('keeps other rows when one document is unusable', () => {
    const rows = buildActionQueue(input({
      withdrawals: [
        { id: 'good', userId: 'u', status: 'pending_review', amount: 5, timestamp: NOW - HOUR },
        null as any,
        { status: 'pending_review' } as any,   // no id
      ],
    }), NOW);
    expect(rows.map(r => r.entityId)).toContain('good');
  });

  it('shows no age for an unusable timestamp and sorts it as new', () => {
    const rows = buildActionQueue(input({
      withdrawals: [{ id: 'w', userId: 'u', status: 'pending_review', amount: 5, timestamp: 'garbage' as any }],
    }), NOW);
    expect(rows[0].waitingSinceMs).toBeNull();
    expect(rows[0].severity).toBe('new');
  });

  it('exposes the SLA as one number', () => {
    expect(SLA_MS).toBe(24 * HOUR);
  });
});

describe('buildActionQueue — listings awaiting review', () => {
  it('raises a row per pending listing, titled with the lot', () => {
    const rows = buildActionQueue(input({
      pendingListings: [{ id: 'a1', title: 'iPhone 15', createdAt: NOW - 2 * HOUR }],
    }), NOW);

    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('approve_listing');
    expect(rows[0].reason).toBe('lot_awaiting_review');
    expect(rows[0].label.en).toContain('iPhone 15');
  });

  it('ages a listing past 24h — a seller waiting on approval is a seller not selling', () => {
    const rows = buildActionQueue(input({
      pendingListings: [{ id: 'a1', title: 'x', createdAt: NOW - 25 * HOUR }],
    }), NOW);
    expect(rows[0].severity).toBe('aging');
  });

  it('falls back to a generic label when the lot has no title', () => {
    const rows = buildActionQueue(input({
      pendingListings: [{ id: 'a1', createdAt: NOW }],
    }), NOW);
    expect(rows[0].label.en.length).toBeGreaterThan(0);
    expect(rows[0].label.ar.length).toBeGreaterThan(0);
  });
});

describe('buildActionQueue — trouble', () => {
  it('raises a blocking row for a disputed order regardless of age', () => {
    const rows = buildActionQueue(input({
      orders: [{ id: 'o1', status: 'disputed', updatedAt: { seconds: NOW / 1000 }, winningBidAmount: 100 }],
    }), NOW);

    expect(rows[0].kind).toBe('dispute');
    expect(rows[0].reason).toBe('dispute_open');
    expect(rows[0].severity).toBe('blocking');
    expect(rows[0].amountFils).toBe(100_000);
  });

  it('distinguishes a return claim from a plain dispute', () => {
    const rows = buildActionQueue(input({
      orders: [{
        id: 'o1', status: 'disputed', disputeType: 'return',
        returnClaim: { status: 'open', reason: 'damaged' },
        updatedAt: { seconds: NOW / 1000 },
      }],
    }), NOW);
    expect(rows[0].reason).toBe('return_claim');
  });

  it('does not raise trouble rows for a resolved claim on a live order', () => {
    const rows = buildActionQueue(input({
      orders: [{ id: 'o1', status: 'completed', returnClaim: { status: 'resolved_denied' } }],
    }), NOW);
    expect(rows).toEqual([]);
  });

  it('puts blocking rows above aging ones', () => {
    const rows = buildActionQueue(input({
      orders: [{ id: 'disputed', status: 'disputed', updatedAt: { seconds: NOW / 1000 } }],
      withdrawals: [{ id: 'oldpayout', userId: 'u', status: 'pending_review', amount: 9, timestamp: NOW - 100 * HOUR }],
    }), NOW);
    expect(rows.map(r => r.kind)).toEqual(['dispute', 'payout']);
  });
});
