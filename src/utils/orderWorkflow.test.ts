import { describe, it, expect, vi, beforeEach } from 'vitest';

// Two layers of coverage live in this file:
//
// 1. Lookup-table guards — VALID_TRANSITIONS / validateTransition /
//    checkRolePermission are pure and exported, so they are asserted directly.
//
// 2. executeOrderTransition itself. An earlier version of this comment claimed
//    the function "cannot run headless" because it imports db/getCallableFunction
//    from '../services/firebase'. That was wrong: those are ordinary module
//    imports and Vitest mocks them at the module boundary (see vi.mock below),
//    which lets the real switch/case bodies execute against fake Firestore
//    primitives. That matters because the money-critical property of
//    `mark_delivered` — it records arrival WITHOUT paying the seller — lives in
//    the function body, not in the tables, and can only be proven by running it.
//
// The firebase/firestore mock is deliberately minimal: only the five bindings
// orderWorkflow.ts imports (doc, collection, addDoc, updateDoc, Timestamp).
// handleFirestoreError is mocked to RETHROW (matching its real `: never`
// signature) so an internal failure surfaces as a test failure instead of
// being swallowed into a false green.
import { VALID_TRANSITIONS, validateTransition, checkRolePermission, executeOrderTransition } from './orderWorkflow';
import type { Order } from '../types';

const mocks = vi.hoisted(() => ({
  getCallableFunction: vi.fn(),
  releaseCallable: vi.fn(),
  updateDoc: vi.fn(),
  addDoc: vi.fn(),
  doc: vi.fn(),
  collection: vi.fn(),
}));

vi.mock('../services/firebase', () => ({
  db: { __fakeDb: true },
  getCallableFunction: mocks.getCallableFunction,
  OperationType: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete', LIST: 'list', GET: 'get', WRITE: 'write' },
  handleFirestoreError: (error: unknown) => {
    throw error instanceof Error ? error : new Error(String(error));
  },
}));

vi.mock('firebase/firestore', () => ({
  doc: mocks.doc,
  collection: mocks.collection,
  addDoc: mocks.addDoc,
  updateDoc: mocks.updateDoc,
  Timestamp: { now: () => ({ __fakeTimestamp: true }) },
}));

describe('orderWorkflow — dispute transitions (Slice D regression guard)', () => {
  it('paid, shipped, and delivered can all transition to disputed', () => {
    expect(VALID_TRANSITIONS.paid).toContain('disputed');
    expect(VALID_TRANSITIONS.shipped).toContain('disputed');
    expect(VALID_TRANSITIONS.delivered).toContain('disputed');
  });
  it('disputed can resolve to completed, refunded, or paid (resume)', () => {
    expect(VALID_TRANSITIONS.disputed).toEqual(expect.arrayContaining(['completed', 'refunded', 'paid']));
  });
  it('validateTransition does not throw for paid -> disputed', () => {
    expect(() => validateTransition('paid', 'disputed')).not.toThrow();
  });
});

describe('mark_delivered — delivery WITHOUT releasing money', () => {
  it('shipped -> delivered is a legal transition', () => {
    expect(VALID_TRANSITIONS.shipped).toContain('delivered');
    expect(() => validateTransition('shipped', 'delivered')).not.toThrow();
  });

  it('cannot be used to skip straight to completed', () => {
    // Acceptance/release stays its own guarded step.
    expect(() => validateTransition('shipped', 'completed')).toThrow();
  });

  it('is permitted for sellers and admins, not buyers', () => {
    // A seller reporting delivery is legitimate; admins inherit every action.
    expect(checkRolePermission('mark_delivered', 'seller')).toBe(true);
    expect(checkRolePermission('mark_delivered', 'admin')).toBe(true);
    expect(checkRolePermission('mark_delivered', 'buyer')).toBe(false);
  });

  it('leaves the money actions admin-only', () => {
    expect(checkRolePermission('release_escrow', 'seller')).toBe(false);
    expect(checkRolePermission('release_escrow', 'buyer')).toBe(false);
    expect(checkRolePermission('release_escrow', 'admin')).toBe(true);
    expect(checkRolePermission('refund', 'seller')).toBe(false);
    expect(checkRolePermission('refund', 'admin')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// executeOrderTransition — the case body itself, not just the lookup tables.
// ---------------------------------------------------------------------------

const SHIPPED_ORDER = {
  id: 'order-123',
  auctionId: 'auction-1',
  auctionTitle: 'Test Lot',
  auctionImage: '',
  sellerId: 'seller-1',
  sellerName: 'Seller',
  buyerId: 'buyer-1',
  buyerName: 'Buyer',
  winningBidAmount: 100,
  status: 'shipped',
  paymentStatus: 'paid',
  shippingStatus: 'shipped',
  escrowStatus: 'locked',
  createdAt: null,
  updatedAt: null,
} as unknown as Order;

const SELLER = { id: 'seller-1', email: 'seller@example.com', name: 'Seller', role: 'seller' as const };
const BUYER = { id: 'buyer-1', email: 'buyer@example.com', name: 'Buyer', role: 'user' as const };

// Every key the client is forbidden from writing, plus the payout-ish names a
// future "just settle it here too" edit would reach for.
const MONEY_KEYS = [
  'escrowStatus',
  'financialStatus',
  'settlementStatus',
  'payoutStatus',
  'escrowReleasedAt',
  'escrowRefundedAt',
  'escrowReleasedBy',
  'escrowRefundedBy',
  'paymentStatus',
  'sellerNet',
  'sellerCommission',
  'payoutAmount',
  'payoutAt',
];

describe('executeOrderTransition — mark_delivered moves goods, never money', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.doc.mockReturnValue({ __ref: 'orderRef' });
    mocks.collection.mockReturnValue({ __ref: 'colRef' });
    mocks.addDoc.mockResolvedValue({ id: 'generated' });
    mocks.updateDoc.mockResolvedValue(undefined);
    mocks.releaseCallable.mockResolvedValue({ data: { success: true, message: 'released' } });
    mocks.getCallableFunction.mockResolvedValue(mocks.releaseCallable);
  });

  it('writes ONLY status, shippingStatus and updatedAt — no escrow/settlement/payout key', async () => {
    await executeOrderTransition(SHIPPED_ORDER, 'mark_delivered', SELLER);

    expect(mocks.updateDoc).toHaveBeenCalledTimes(1);
    const payload = mocks.updateDoc.mock.calls[0][1] as Record<string, unknown>;

    // Exact key set: adding ANY field to the mark_delivered case fails here.
    expect(Object.keys(payload).sort()).toEqual(['shippingStatus', 'status', 'updatedAt']);
    expect(payload.status).toBe('delivered');
    expect(payload.shippingStatus).toBe('delivered');

    for (const key of MONEY_KEYS) {
      expect(payload).not.toHaveProperty(key);
    }
  });

  it('NEVER reaches getCallableFunction — no Cloud Function, no payout', async () => {
    await executeOrderTransition(SHIPPED_ORDER, 'mark_delivered', SELLER);

    // The highest-value assertion in this file. Adding 'mark_delivered' to
    // either Cloud Function delegation condition at the top of
    // executeOrderTransition is exactly how this action would start moving
    // money; that edit fails right here.
    expect(mocks.getCallableFunction).not.toHaveBeenCalled();
    expect(mocks.releaseCallable).not.toHaveBeenCalled();
  });

  it('still records the delivery in the activity log', async () => {
    await executeOrderTransition(SHIPPED_ORDER, 'mark_delivered', SELLER);

    // Activity + 3 notifications; seller is not admin so no adminActions entry.
    expect(mocks.addDoc).toHaveBeenCalled();
    const activity = mocks.addDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(activity.type).toBe('Package Delivered');
    expect(activity.performedBy).toBe('seller-1');
  });

  it('CONTRAST: confirm_delivery DOES reach releaseOrderEscrow (so the test above is meaningful)', async () => {
    const result = await executeOrderTransition(SHIPPED_ORDER, 'confirm_delivery', BUYER);

    expect(mocks.getCallableFunction).toHaveBeenCalledTimes(1);
    expect(mocks.getCallableFunction).toHaveBeenCalledWith('releaseOrderEscrow');
    expect(mocks.releaseCallable).toHaveBeenCalledWith({
      orderId: 'order-123',
      action: 'buyer_confirm_delivery',
    });
    expect(result).toMatchObject({ success: true });

    // It short-circuits into the Cloud Function; the client writes nothing.
    expect(mocks.updateDoc).not.toHaveBeenCalled();
  });
});
