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

// ---------------------------------------------------------------------------
// The free-text note that rides along with a transition.
//
// `nudgeCount: 3` says three nudges fired; it does not say the seller promised
// a Tuesday courier. The note is what the TEAM reads when picking the order up
// next — it is purely ADDITIVE, so the canned bilingual messages the buyer and
// seller actually receive must be byte-identical with or without it.
//
// The absence assertions below use `'note' in obj === false` rather than
// `toBeUndefined()` on purpose: `{ note: undefined }` satisfies
// `toBeUndefined()` but is exactly what Firestore rejects, since
// `ignoreUndefinedProperties` is not enabled on this project's app. Only the
// `in` form proves the key was never handed over.
// ---------------------------------------------------------------------------

const ADMIN = { id: 'admin-1', email: 'admin@example.com', name: 'Admin', role: 'admin' as const, isAdmin: true };

// The canned copy for mark_delivered, duplicated here on purpose: if someone
// edits the message in orderWorkflow.ts, that is a customer-facing copy change
// and it should have to be made in two places deliberately.
const DELIVERED_AR = 'تم تسليم الطرد للمشتري — بانتظار تأكيد الاستلام قبل تحرير المبلغ.';
const DELIVERED_EN = 'Parcel delivered to the buyer — awaiting acceptance before funds are released.';

describe('executeOrderTransition — the note rides along with the transition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.doc.mockReturnValue({ __ref: 'orderRef' });
    mocks.collection.mockReturnValue({ __ref: 'colRef' });
    mocks.addDoc.mockResolvedValue({ id: 'generated' });
    mocks.updateDoc.mockResolvedValue(undefined);
    mocks.releaseCallable.mockResolvedValue({ data: { success: true, message: 'released' } });
    mocks.getCallableFunction.mockResolvedValue(mocks.releaseCallable);
  });

  // The activity record is the first addDoc in the transition body.
  const activityRecord = () => mocks.addDoc.mock.calls[0][1] as Record<string, unknown>;

  it('writes the note onto the activity record', async () => {
    await executeOrderTransition(SHIPPED_ORDER, 'mark_delivered', SELLER, {
      note: 'called seller, courier collects Tuesday',
    });

    expect(activityRecord().note).toBe('called seller, courier collects Tuesday');
  });

  it('trims surrounding whitespace off the note', async () => {
    await executeOrderTransition(SHIPPED_ORDER, 'mark_delivered', SELLER, {
      note: '   courier collects Tuesday \n ',
    });

    expect(activityRecord().note).toBe('courier collects Tuesday');
  });

  it('omits the note key entirely when no extraFields are passed', async () => {
    await executeOrderTransition(SHIPPED_ORDER, 'mark_delivered', SELLER);

    // NOT toBeUndefined(): Firestore would reject an explicit undefined.
    expect('note' in activityRecord()).toBe(false);
  });

  it('omits the note key entirely when extraFields carry no note', async () => {
    await executeOrderTransition(SHIPPED_ORDER, 'mark_delivered', SELLER, { trackingNumber: 'MJ-123456' });

    expect('note' in activityRecord()).toBe(false);
  });

  it('omits the note key entirely for an empty string', async () => {
    await executeOrderTransition(SHIPPED_ORDER, 'mark_delivered', SELLER, { note: '' });

    expect('note' in activityRecord()).toBe(false);
  });

  it('omits the note key entirely for a whitespace-only note', async () => {
    await executeOrderTransition(SHIPPED_ORDER, 'mark_delivered', SELLER, { note: '   \n\t  ' });

    expect('note' in activityRecord()).toBe(false);
  });

  it('leaves the canned bilingual messages untouched when a note is present', async () => {
    await executeOrderTransition(SHIPPED_ORDER, 'mark_delivered', SELLER, {
      note: 'called seller, courier collects Tuesday',
    });

    const activity = activityRecord();
    // The buyer and seller read these; the note must not leak into them.
    expect(activity.messageAr).toBe(DELIVERED_AR);
    expect(activity.messageEn).toBe(DELIVERED_EN);
    expect(activity.message).toBe(DELIVERED_EN);
    expect(activity.type).toBe('Package Delivered');
    expect(activity.messageAr).not.toContain('Tuesday');
    expect(activity.messageEn).not.toContain('Tuesday');
  });

  it('appends the note to the admin audit entry', async () => {
    await executeOrderTransition(SHIPPED_ORDER, 'mark_delivered', ADMIN, {
      note: '  called seller, courier collects Tuesday  ',
    });

    // Activity is call 0; the adminActions entry is call 1 for an admin actor.
    const audit = mocks.addDoc.mock.calls[1][1] as Record<string, unknown>;
    expect(audit.action).toBe('mark_delivered');
    expect(audit.details).toBe(
      'Transitioned order from shipped to delivered via action: mark_delivered — note: called seller, courier collects Tuesday'
    );
  });

  it('leaves the admin audit entry unchanged when there is no note', async () => {
    await executeOrderTransition(SHIPPED_ORDER, 'mark_delivered', ADMIN);

    const audit = mocks.addDoc.mock.calls[1][1] as Record<string, unknown>;
    expect(audit.details).toBe('Transitioned order from shipped to delivered via action: mark_delivered');
  });
});

// ---------------------------------------------------------------------------
// Essential writes vs. bookkeeping writes.
//
// executeOrderTransition performs four writes: the order update, the activity
// record, the adminActions audit entry, and the notification fan-out. Only the
// first two ARE the operation. The audit entry in particular can never succeed
// from a client today — firestore.rules has `allow write: if false` on
// /adminActions — so before the fix an admin advancing an order got the status
// change committed AND an exception, i.e. a successful operation reported as a
// failure, with the retry then failing as "Illegal state transition".
//
// These tests pin the split: bookkeeping failures must not fail the call,
// essential failures must still propagate through handleFirestoreError.
//
// The collection mock below returns a path-tagged ref so a single addDoc call
// can be made to reject by target collection, rather than by call index.
// ---------------------------------------------------------------------------

describe('executeOrderTransition — bookkeeping failures never fail a committed transition', () => {
  const colPath = (ref: any) => (ref && ref.__path) || '';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.doc.mockReturnValue({ __ref: 'orderRef' });
    mocks.collection.mockImplementation((_db: unknown, ...path: string[]) => ({ __path: path.join('/') }));
    mocks.addDoc.mockResolvedValue({ id: 'generated' });
    mocks.updateDoc.mockResolvedValue(undefined);
    mocks.releaseCallable.mockResolvedValue({ data: { success: true, message: 'released' } });
    mocks.getCallableFunction.mockResolvedValue(mocks.releaseCallable);
  });

  const writesTo = (path: string) =>
    mocks.addDoc.mock.calls.filter((call) => colPath(call[0]) === path);

  it('a rejected adminActions write still resolves, and still writes order + activity + notifications', async () => {
    // Exactly what firestore.rules produces today for an admin actor.
    mocks.addDoc.mockImplementation((ref: any) =>
      colPath(ref) === 'adminActions'
        ? Promise.reject(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }))
        : Promise.resolve({ id: 'generated' })
    );

    await expect(executeOrderTransition(SHIPPED_ORDER, 'mark_delivered', ADMIN)).resolves.toBeUndefined();

    // The operation itself committed...
    expect(mocks.updateDoc).toHaveBeenCalledTimes(1);
    expect((mocks.updateDoc.mock.calls[0][1] as Record<string, unknown>).status).toBe('delivered');
    expect(writesTo('orders/order-123/activity')).toHaveLength(1);
    // ...and the audit failure did not abort the fan-out that follows it.
    expect(writesTo('notifications')).toHaveLength(3);
  });

  it('a rejected notifications write still resolves', async () => {
    mocks.addDoc.mockImplementation((ref: any) =>
      colPath(ref) === 'notifications'
        ? Promise.reject(new Error('notification fan-out unavailable'))
        : Promise.resolve({ id: 'generated' })
    );

    await expect(executeOrderTransition(SHIPPED_ORDER, 'mark_delivered', ADMIN)).resolves.toBeUndefined();

    expect(mocks.updateDoc).toHaveBeenCalledTimes(1);
    expect(writesTo('orders/order-123/activity')).toHaveLength(1);
    // One undeliverable recipient must not drop the other two.
    expect(writesTo('notifications')).toHaveLength(3);
  });

  it('a rejected ORDER update still throws — the essential write is not swallowed', async () => {
    mocks.updateDoc.mockRejectedValue(new Error('order update denied'));

    await expect(executeOrderTransition(SHIPPED_ORDER, 'mark_delivered', ADMIN)).rejects.toThrow('order update denied');

    // Nothing downstream ran, so there is nothing to be inconsistent with.
    expect(mocks.addDoc).not.toHaveBeenCalled();
  });

  it('a rejected ACTIVITY write still throws — the activity record is part of the operation', async () => {
    mocks.addDoc.mockImplementation((ref: any) =>
      colPath(ref) === 'orders/order-123/activity'
        ? Promise.reject(new Error('activity write denied'))
        : Promise.resolve({ id: 'generated' })
    );

    await expect(executeOrderTransition(SHIPPED_ORDER, 'mark_delivered', ADMIN)).rejects.toThrow('activity write denied');
  });
});
