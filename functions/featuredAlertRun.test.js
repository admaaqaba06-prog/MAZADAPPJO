// CR-03 broadcast, against a fake Firestore.
//
// Two acceptance criteria drive most of this file:
//   - flagging a THIRD auction in the same week is refused;
//   - a user opted out of daily but opted INTO featured still gets the alert.
//
// The second is the one that quietly breaks: `notifyDaily` and `notifyFeatured`
// are separate fields, and any code path that reads the wrong one turns an
// independent opt-out into a single switch nobody asked for.
import { describe, it, expect, vi } from 'vitest';
import { runFeaturedAlert } from './featuredAlertRun.js';
import { FEATURED_WINDOW_MS } from './featuredAlert.js';

const AT = (h) => Date.parse(`2026-09-12T${String(h).padStart(2, '0')}:00:00+03:00`);
const NOW = AT(19);
const DAY = 24 * 60 * 60 * 1000;

function makeDb({ config = {}, auctions = [], users = [], log = {}, broadcasts = [] } = {}) {
  const store = {
    config: { notifications: { ...config } },
    auctions: Object.fromEntries(auctions.map((a) => [a.id, a])),
    users: Object.fromEntries(users.map((u) => [u.id, u])),
    notifications_log: { ...log },
    featuredBroadcasts: Object.fromEntries(broadcasts.map((b, i) => [`b${i}`, b])),
  };
  const written = [];
  const snapOf = (col, id) => ({
    id,
    exists: Object.prototype.hasOwnProperty.call(store[col], id),
    data: () => store[col][id],
  });
  const collection = (name) => ({
    doc: (id) => ({
      get: async () => snapOf(name, id),
      set: async (data) => { store[name][id] = data; written.push({ col: name, id, data }); },
    }),
    where(field, op, value) {
      const rows = Object.entries(store[name]).filter(([, d]) =>
        op === '>=' ? Number(d[field]) >= Number(value) : d[field] === value);
      return { get: async () => ({ forEach: (fn) => rows.forEach(([id, d]) => fn({ id, data: () => d })) }) };
    },
  });
  return { db: { collection }, store, written };
}

const LOT = { id: 'a1', title: 'تويوتا كامري', category: 'Vehicles', status: 'live', startingPrice: 5, endsAt: AT(22) };
const user = (id, extra = {}) => ({
  id,
  notifyFeatured: true,
  notifyChannel: 'whatsapp',
  phoneNumber: '+962790000000',
  interests: ['Vehicles'],
  ...extra,
});

function run(opts = {}, parts = {}) {
  const { db, store, written } = makeDb({ auctions: [LOT], ...parts });
  const send = opts.send || vi.fn(async () => true);
  return {
    db, store, written, send,
    result: runFeaturedAlert({
      db,
      auctionId: 'a1',
      reason: 'سعره بادي من ٥ دنانير',
      send,
      now: () => NOW,
      sleep: async () => {},
      logger: { log() {}, warn() {}, error() {} },
      ...opts,
    }),
  };
}

describe('the weekly cap', () => {
  it('allows an alert when one has gone out this week', async () => {
    const { result, send } = run({}, { users: [user('u1')], broadcasts: [{ at: NOW - DAY }] });
    await result;
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('REFUSES the third in the same week', async () => {
    // The acceptance criterion. Enforced here as well as in the callable, so a
    // second caller wired straight into this function cannot slip past it.
    const { result, send } = run({}, {
      users: [user('u1')],
      broadcasts: [{ at: NOW - DAY }, { at: NOW - 2 * DAY }],
    });
    const r = await result;
    expect(r.refused).toBe('capped');
    expect(send).not.toHaveBeenCalled();
  });

  it('says when the next one is allowed rather than just refusing', async () => {
    const older = NOW - 5 * DAY;
    const { result } = run({}, {
      users: [user('u1')],
      broadcasts: [{ at: NOW - DAY }, { at: older }],
    });
    expect((await result).nextAllowedAt).toBe(older + FEATURED_WINDOW_MS);
  });

  it('frees a slot once a broadcast ages out of the window', async () => {
    const { result, send } = run({}, {
      users: [user('u1')],
      broadcasts: [{ at: NOW - DAY }, { at: NOW - 8 * DAY }],
    });
    await result;
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('independent opt-out', () => {
  it('still reaches a user who muted the DAILY digest', async () => {
    // The acceptance criterion, and the one most likely to regress silently:
    // reading notifyDaily anywhere in this path collapses two switches into one.
    const { result, send } = run({}, {
      users: [user('u1', { notifyDaily: false })],
    });
    await result;
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('never reaches a user who muted FEATURED', async () => {
    const { result, send } = run({}, { users: [user('u1', { notifyFeatured: false })] });
    await result;
    expect(send).not.toHaveBeenCalled();
  });

  it('never reaches a user whose channel is off', async () => {
    const { result, send } = run({}, { users: [user('u1', { notifyChannel: 'none' })] });
    expect((await result).skippedOptedOut).toBe(1);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('the audience filter', () => {
  it('respects interests by default', async () => {
    const { result, send } = run({}, { users: [user('u1', { interests: ['Phones'] })] });
    expect((await result).skippedNoMatch).toBe(1);
    expect(send).not.toHaveBeenCalled();
  });

  it('reaches everyone when the admin chose "ارسال للجميع"', async () => {
    const { result, send } = run({ sendToAll: true }, { users: [user('u1', { interests: ['Phones'] })] });
    await result;
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('matches a lot stored under its legacy category', async () => {
    const { result, send } = run({}, {
      auctions: [{ ...LOT, category: 'Cars' }],
      users: [user('u1', { interests: ['Vehicles'] })],
    });
    await result;
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('refusals before anything is sent', () => {
  it('refuses without a reason', async () => {
    const { result, send } = run({ reason: '' }, { users: [user('u1')] });
    expect((await result).refused).toBe('reason_required');
    expect(send).not.toHaveBeenCalled();
  });

  it('honours the kill switch', async () => {
    const { result, send } = run({}, { config: { featuredEnabled: false }, users: [user('u1')] });
    expect((await result).refused).toBe('killSwitch');
    expect(send).not.toHaveBeenCalled();
  });

  it('runs when the kill switch is absent — opt-OUT, not opt-in', async () => {
    const { result, send } = run({}, { users: [user('u1')] });
    await result;
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('refuses inside quiet hours even for an admin who is awake', async () => {
    // "The admin was awake" is not the recipients' consent.
    const { result, send } = run({ now: () => AT(3) }, { users: [user('u1')] });
    expect((await result).refused).toBe('quietHours');
    expect(send).not.toHaveBeenCalled();
  });

  it('refuses a lot that is not live', async () => {
    // Alerting on an unbiddable lot is worse than not alerting: it spends one
    // of only two weekly slots AND sends people to a dead page.
    const { result, send } = run({}, { auctions: [{ ...LOT, status: 'ended' }], users: [user('u1')] });
    expect((await result).refused).toBe('auction_not_live');
    expect(send).not.toHaveBeenCalled();
  });

  it('refuses an auction that does not exist', async () => {
    const { result } = run({ auctionId: 'ghost' }, { users: [user('u1')] });
    expect((await result).refused).toBe('auction_not_found');
  });
});

describe('the log', () => {
  it('never sends the same featured lot to the same user twice', async () => {
    const { result, send } = run({}, {
      users: [user('u1')],
      log: { u1_a1_featured_alert: { uid: 'u1', auctionId: 'a1', type: 'featured_alert' } },
    });
    expect((await result).skippedAlreadySent).toBe(1);
    expect(send).not.toHaveBeenCalled();
  });

  it('writes the log only after a delivered send', async () => {
    const { result, written } = run({ send: vi.fn(async () => false) }, { users: [user('u1')] });
    expect((await result).failed).toBe(1);
    expect(written.filter((w) => w.col === 'notifications_log')).toHaveLength(0);
  });

  it('uses a type distinct from the digest, so neither cap touches the other', async () => {
    const { result, written } = run({}, { users: [user('u1')] });
    await result;
    const row = written.find((w) => w.col === 'notifications_log');
    expect(row.id).toBe('u1_a1_featured_alert');
    expect(row.data.type).toBe('featured_alert');
  });
});

describe('dry run', () => {
  it('sends nothing and writes no log row', async () => {
    const { result, send, written } = run({ dryRun: true }, { users: [user('u1')] });
    const r = await result;
    expect(send).not.toHaveBeenCalled();
    expect(written.filter((w) => w.col === 'notifications_log')).toHaveLength(0);
    expect(r.intended).toEqual([{ uid: 'u1', phone: '+962790000000', lang: 'ar' }]);
  });
});

describe('resilience', () => {
  it('one failing recipient does not stop the broadcast', async () => {
    const send = vi.fn(async ({ uid }) => uid !== 'u2');
    const { result } = run({ send, concurrency: 1 }, {
      users: [user('u1'), user('u2'), user('u3')],
    });
    const r = await result;
    expect(r.sent).toBe(2);
    expect(r.failed).toBe(1);
  });
});
