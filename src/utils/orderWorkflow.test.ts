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
// The free-text note that rides along with a transition — and stays INTERNAL.
//
// `nudgeCount: 3` says three nudges fired; it does not say the seller promised
// a Tuesday courier. The note is what the TEAM reads when picking the order up
// next — it is purely ADDITIVE, so the canned bilingual messages the buyer and
// seller actually receive must be byte-identical with or without it.
//
// It must NOT ride on the activity record. OrderDetailsView onSnapshot-
// subscribes orders/{orderId}/activity for the buyer AND the seller, and
// firestore.rules grants them read there, so anything written to activity is
// transmitted to their browsers whether or not the UI renders it. The note
// therefore goes to orders/{orderId}/adminNotes, which is admin-read/write only.
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

describe('executeOrderTransition — the note is internal, never on the activity record', () => {
  const colPath = (ref: any) => (ref && ref.__path) || '';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.doc.mockReturnValue({ __ref: 'orderRef' });
    // Path-tagged refs so a write can be located (and rejected) by target
    // collection rather than by call index.
    mocks.collection.mockImplementation((_db: unknown, ...path: string[]) => ({ __path: path.join('/') }));
    mocks.addDoc.mockResolvedValue({ id: 'generated' });
    mocks.updateDoc.mockResolvedValue(undefined);
    mocks.releaseCallable.mockResolvedValue({ data: { success: true, message: 'released' } });
    mocks.getCallableFunction.mockResolvedValue(mocks.releaseCallable);
  });

  // The activity record is the first addDoc in the transition body.
  const activityRecord = () => mocks.addDoc.mock.calls[0][1] as Record<string, unknown>;
  const adminNotes = () =>
    mocks.addDoc.mock.calls
      .filter((call) => colPath(call[0]) === 'orders/order-123/adminNotes')
      .map((call) => call[1] as Record<string, unknown>);

  it('does NOT write the note onto the activity record', async () => {
    await executeOrderTransition(SHIPPED_ORDER, 'mark_delivered', SELLER, {
      note: 'called seller, courier collects Tuesday',
    });

    // The buyer and the seller both read this subcollection. NOT
    // toBeUndefined(): the key must never be handed over at all.
    expect('note' in activityRecord()).toBe(false);
  });

  it('writes the note to the admin-only adminNotes subcollection instead', async () => {
    await executeOrderTransition(SHIPPED_ORDER, 'mark_delivered', ADMIN, {
      note: 'called seller, courier collects Tuesday',
    });

    const notes = adminNotes();
    expect(notes).toHaveLength(1);
    expect(notes[0].note).toBe('called seller, courier collects Tuesday');
    // Enough for the next team member to pick the order up warm.
    expect(notes[0].performedBy).toBe('admin-1');
    expect(notes[0].performedByName).toBe('Admin');
    expect(notes[0].action).toBe('mark_delivered');
    expect(notes[0].fromStatus).toBe('shipped');
    expect(notes[0].toStatus).toBe('delivered');
    expect(notes[0].timestamp).toBeTruthy();
  });

  it('trims surrounding whitespace off the note', async () => {
    await executeOrderTransition(SHIPPED_ORDER, 'mark_delivered', ADMIN, {
      note: '   courier collects Tuesday \n ',
    });

    expect(adminNotes()).toHaveLength(1);
    expect(adminNotes()[0].note).toBe('courier collects Tuesday');
  });

  it('writes no admin note, and no activity note, when no extraFields are passed', async () => {
    await executeOrderTransition(SHIPPED_ORDER, 'mark_delivered', ADMIN);

    expect(adminNotes()).toHaveLength(0);
    expect('note' in activityRecord()).toBe(false);
  });

  it('writes no admin note when extraFields carry no note', async () => {
    await executeOrderTransition(SHIPPED_ORDER, 'mark_delivered', ADMIN, { trackingNumber: 'MJ-123456' });

    expect(adminNotes()).toHaveLength(0);
    expect('note' in activityRecord()).toBe(false);
  });

  it('writes no admin note for an empty string', async () => {
    await executeOrderTransition(SHIPPED_ORDER, 'mark_delivered', ADMIN, { note: '' });

    expect(adminNotes()).toHaveLength(0);
    expect('note' in activityRecord()).toBe(false);
  });

  it('writes no admin note for a whitespace-only note', async () => {
    await executeOrderTransition(SHIPPED_ORDER, 'mark_delivered', ADMIN, { note: '   \n\t  ' });

    expect(adminNotes()).toHaveLength(0);
    expect('note' in activityRecord()).toBe(false);
  });

  it('writes no admin note for a non-string note', async () => {
    // Firestore rejects an explicit undefined, and a caller handing over a
    // number must not produce a half-formed note document either.
    await executeOrderTransition(SHIPPED_ORDER, 'mark_delivered', ADMIN, { note: 12345 as unknown as string });

    expect(adminNotes()).toHaveLength(0);
    expect('note' in activityRecord()).toBe(false);
  });

  it('a rejected adminNotes write still resolves — a note is bookkeeping, not the operation', async () => {
    mocks.addDoc.mockImplementation((ref: any) =>
      colPath(ref) === 'orders/order-123/adminNotes'
        ? Promise.reject(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }))
        : Promise.resolve({ id: 'generated' })
    );

    await expect(
      executeOrderTransition(SHIPPED_ORDER, 'mark_delivered', ADMIN, { note: 'courier collects Tuesday' })
    ).resolves.toBeUndefined();

    // The transition itself committed, and the fan-out after it still ran.
    expect(mocks.updateDoc).toHaveBeenCalledTimes(1);
    expect((mocks.updateDoc.mock.calls[0][1] as Record<string, unknown>).status).toBe('delivered');
    expect(mocks.addDoc.mock.calls.filter((c) => colPath(c[0]) === 'notifications')).toHaveLength(3);
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

    // adminActions is already admin-read-only, so the note stays in its
    // details string — that is not a leak.
    const audit = mocks.addDoc.mock.calls.find((c) => colPath(c[0]) === 'adminActions')![1] as Record<string, unknown>;
    expect(audit.action).toBe('mark_delivered');
    expect(audit.details).toBe(
      'Transitioned order from shipped to delivered via action: mark_delivered — note: called seller, courier collects Tuesday'
    );
  });

  it('leaves the admin audit entry unchanged when there is no note', async () => {
    await executeOrderTransition(SHIPPED_ORDER, 'mark_delivered', ADMIN);

    const audit = mocks.addDoc.mock.calls.find((c) => colPath(c[0]) === 'adminActions')![1] as Record<string, unknown>;
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

// ---------------------------------------------------------------------------
// mark_shipped — never hand the buyer a tracking number that tracks nothing.
//
// The case body used to fall back to `'MJ-' + random6digits` whenever no
// trackingNumber was supplied, then interpolate it into activityMessageAr /
// activityMessageEn — messages the BUYER and the SELLER read. The admin relay
// (handleAdvanceOrder) passes only `{ note }`, so that fabricated branch was the
// DEFAULT for every admin-driven "Out for delivery".
//
// The absence assertion uses `'trackingNumber' in obj === false` rather than
// toBeUndefined() for the same reason as the note tests above: Firestore rejects
// an explicit undefined, so only the `in` form proves the key was never written.
// ---------------------------------------------------------------------------

const PREPARING_ORDER = {
  ...(SHIPPED_ORDER as unknown as Record<string, unknown>),
  status: 'preparing_shipment',
  shippingStatus: 'preparing',
} as unknown as Order;

describe('executeOrderTransition — mark_shipped never fabricates a tracking number', () => {
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

  const orderPayload = () => mocks.updateDoc.mock.calls[0][1] as Record<string, unknown>;
  const activityRecord = () =>
    mocks.addDoc.mock.calls.find((c) => colPath(c[0]) === 'orders/order-123/activity')![1] as Record<string, unknown>;

  it('writes NO trackingNumber key at all when none is supplied', async () => {
    // The admin relay path: `{ note }` only, no tracking number.
    await executeOrderTransition(PREPARING_ORDER, 'mark_shipped', ADMIN, { note: 'courier collected' });

    const payload = orderPayload();
    expect(payload.status).toBe('shipped');
    expect(payload.shippingStatus).toBe('shipped');
    // NOT toBeUndefined(): `{ trackingNumber: undefined }` is exactly what
    // Firestore rejects, and would still satisfy toBeUndefined().
    expect('trackingNumber' in payload).toBe(false);
  });

  it('mentions no tracking ID in either language when none is supplied', async () => {
    await executeOrderTransition(PREPARING_ORDER, 'mark_shipped', ADMIN, { note: 'courier collected' });

    const activity = activityRecord();
    expect(activity.type).toBe('Package Shipped');
    // The fabricated fallback was always `MJ-######`.
    expect(activity.messageAr).not.toContain('MJ-');
    expect(activity.messageEn).not.toContain('MJ-');
    expect(activity.messageAr).toBe('تم شحن الطرد بنجاح مع شركة التوصيل.');
    expect(activity.messageEn).toBe('Parcel in transit with courier.');
    expect(activity.message).toBe('Parcel in transit with courier.');
  });

  it('writes no trackingNumber and no fake ID when extraFields are omitted entirely', async () => {
    await executeOrderTransition(PREPARING_ORDER, 'mark_shipped', SELLER);

    expect('trackingNumber' in orderPayload()).toBe(false);
    expect(activityRecord().messageAr).not.toContain('MJ-');
    expect(activityRecord().messageEn).not.toContain('MJ-');
  });

  it('writes no trackingNumber for a whitespace-only tracking number', async () => {
    await executeOrderTransition(PREPARING_ORDER, 'mark_shipped', SELLER, { trackingNumber: '   ' });

    expect('trackingNumber' in orderPayload()).toBe(false);
    expect(activityRecord().messageEn).toBe('Parcel in transit with courier.');
  });

  it('KEEPS a real tracking number, in the order doc and in both messages', async () => {
    await executeOrderTransition(PREPARING_ORDER, 'mark_shipped', SELLER, { trackingNumber: 'ARX-99881' });

    expect(orderPayload().trackingNumber).toBe('ARX-99881');

    const activity = activityRecord();
    expect(activity.messageAr).toContain('ARX-99881');
    expect(activity.messageEn).toContain('ARX-99881');
    expect(activity.messageAr).toBe('تم شحن الطرد بنجاح مع شركة التوصيل. رقم التتبع: ARX-99881');
    expect(activity.messageEn).toBe('Parcel in transit with courier. Tracking ID: ARX-99881');
  });
});
