// Vitest here is environment: 'node' — the component cannot be rendered, and
// `tsc` cannot help either (@types/react is absent, so useApp() is `any` and a
// wrong argument compiles). The classification is the safety property of this
// whole feature, so it is asserted against the source.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const DASH = readFileSync(new URL('../AdminDashboardView.tsx', import.meta.url), 'utf8');
const SECTION = readFileSync(new URL('./ActionCenterSection.tsx', import.meta.url), 'utf8');
const QUEUE = readFileSync(new URL('../../utils/actionQueue.ts', import.meta.url), 'utf8');
const CONTEXT = readFileSync(new URL('../../context/AppContext.tsx', import.meta.url), 'utf8');
const PANEL = readFileSync(new URL('../AdminPanel.tsx', import.meta.url), 'utf8');

/** The six ActionKinds, read out of actionQueue.ts so this cannot drift. */
const ACTION_KINDS: string[] = (() => {
  const at = QUEUE.indexOf('export type ActionKind =');
  const block = QUEUE.slice(at, QUEUE.indexOf(';', at));
  return [...block.matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
})();

/** Every handler this task wired, in one place. */
const HANDLERS = [
  'onApproveListing', 'onRejectListing',
  'onApprovePayout', 'onRejectPayout', 'onApproveOrderPayment', 'onRejectOrderPayment',
  'onApproveMembership', 'onRejectMembership', 'onResolveDispute', 'onNudge', 'onAdvance',
];

describe('optimism classification', () => {
  it("uses 'reversible' at EXACTLY two call sites", () => {
    // Allowlist, not denylist: a newly-added money action is 'confirmed' by
    // omission — the safe default — and widening optimism fails loudly here.
    expect((DASH.match(/optimism: *'reversible'/g) || []).length).toBe(2);
  });

  it('both of them are the listing handlers', () => {
    for (const handler of ['onApproveListing', 'onRejectListing']) {
      const at = DASH.indexOf(handler);
      expect(at, handler).toBeGreaterThan(-1);
      expect(DASH.slice(at, at + 400)).toMatch(/optimism: *'reversible'/);
    }
  });

  it('the money handlers are never reversible', () => {
    for (const handler of [
      'onApprovePayout', 'onRejectPayout', 'onApproveOrderPayment', 'onRejectOrderPayment',
      'onApproveMembership', 'onRejectMembership', 'onResolveDispute', 'onNudge', 'onAdvance',
    ]) {
      const at = DASH.indexOf(handler);
      expect(at, handler).toBeGreaterThan(-1);
      expect(DASH.slice(at, at + 400), handler).not.toMatch(/optimism: *'reversible'/);
    }
  });

  it('every one of the eleven handlers is classified', () => {
    // Wiring a handler without an `optimism` is the other way to lose the busy
    // state: the button would still look dead. Every handler that reaches a
    // server carries one.
    for (const handler of [
      'onApproveListing', 'onRejectListing',
      'onApprovePayout', 'onRejectPayout', 'onApproveOrderPayment', 'onRejectOrderPayment',
      'onApproveMembership', 'onRejectMembership', 'onResolveDispute', 'onNudge', 'onAdvance',
    ]) {
      const at = DASH.indexOf(handler);
      expect(DASH.slice(at, at + 400), handler).toMatch(/optimism: *'(reversible|confirmed)'/);
    }
  });
});

describe('the source-text windows point at code, not prose', () => {
  it('mentions each handler name EXACTLY once in the file', () => {
    // Every assertion above takes the FIRST indexOf and reads 400 chars. One
    // extra mention — in a comment, a prop, a JSX attribute — silently
    // retargets the window onto prose and the test then passes on nothing.
    // The NOTE TO FUTURE EDITORS in AdminDashboardView says this; this
    // enforces it.
    for (const handler of HANDLERS) {
      const count = (DASH.match(new RegExp(handler, 'g')) || []).length;
      expect(count, handler).toBe(1);
    }
  });
});

describe('the queue is filtered through the optimistic state', () => {
  it('renders visibleRows, not the raw queue', () => {
    expect(DASH).toMatch(/visibleRows\(/);
  });

  it('prunes hidden ids against the live queue', () => {
    expect(DASH).toMatch(/\bprune\(/);
  });

  it('hands the FILTERED queue to the section, and the badge counts the same list', () => {
    // `visibleRows(` existing in a memo proves nothing on its own — the memo's
    // result has to be the thing that reaches the UI, or an optimistic hide is
    // computed and thrown away.
    const at = DASH.indexOf('<ActionCenterSection');
    expect(at).toBeGreaterThan(-1);
    const el = DASH.slice(at, at + 1200);
    expect(el).toMatch(/queue=\{visibleActionQueue\}/);
    expect(el).not.toMatch(/queue=\{actionQueue\}/);
    // One badge, one source (Wave 4): the count must not disagree with the list.
    expect(DASH).not.toMatch(/\bactionQueue\.length\b/);
    expect(DASH).toMatch(/\bvisibleActionQueue\.length\b/);
  });
});

describe('action ids are real ActionKinds, and rowId tracks actionId', () => {
  const PAIR = /actionId: `([a-z_]+):\$\{([^}]+)\}`,\s*\n\s*rowId: `([a-z_]+):\$\{([^}]+)\}`,/g;

  it('reads six kinds out of actionQueue.ts', () => {
    expect(ACTION_KINDS).toHaveLength(6);
    expect(ACTION_KINDS).toContain('approve_listing');
  });

  it('every actionId prefix is an ActionKind', () => {
    const pairs = [...DASH.matchAll(PAIR)];
    // One per wired handler — if this drops, the regex stopped matching the
    // code rather than the code becoming correct.
    expect(pairs.length).toBe(HANDLERS.length);
    for (const [, kind] of pairs) {
      // A prefix that is not an ActionKind can never equal an ActionRow.id, so
      // isPending() would be false forever and the button would never spin.
      expect(ACTION_KINDS, kind).toContain(kind);
    }
  });

  it('rowId is always the same id as actionId', () => {
    // Decoupling them silently disables the optimistic hide: `hidden` would
    // hold an id no row has.
    for (const [, kind, entity, rowKind, rowEntity] of [...DASH.matchAll(PAIR)]) {
      expect(`${rowKind}:${rowEntity}`, `${kind}:${entity}`).toBe(`${kind}:${entity}`);
    }
  });
});

describe('TDZ — the wiring is declared BELOW actionQueue', () => {
  it('places every actionQueue reader after its declaration', () => {
    // A useMemo/useEffect callback runs during render at the line it appears
    // on, so a hook hoisted above `const actionQueue` throws
    // "Cannot access 'actionQueue' before initialization" — at runtime only,
    // when the admin panel opens. Vite compiles it happily. This file has been
    // bitten by exactly this before.
    const queueDecl = DASH.indexOf('const actionQueue = useMemo');
    expect(queueDecl).toBeGreaterThan(-1);
    for (const marker of [
      'useAdminAction()',
      'adminAction.prune(actionQueue)',
      'const visibleActionQueue',
    ]) {
      expect(DASH.indexOf(marker), marker).toBeGreaterThan(queueDecl);
    }
  });
});

describe('a suppressed double-click is not an error', () => {
  it('clears `suppressed` before every failure branch', () => {
    // `already-in-flight` is a debugging aid, not copy. The naive
    // `if (!r.ok) alert(r.error)` would put that untranslated string in front
    // of an Arabic-speaking admin, so a suppressed click must be discriminated
    // BEFORE anything treats the result as a failure.
    const failureBranches = [...DASH.matchAll(/!\w+\.ok\b/g)];
    expect(failureBranches.length).toBeGreaterThan(0);
    for (const m of failureBranches) {
      const before = DASH.slice(Math.max(0, (m.index ?? 0) - 500), m.index);
      // POLARITY, not presence. `if (!result.suppressed) return ...` also
      // contains the token, and it inverts the guard: a double-click would then
      // fall through and alert the untranslated internal marker, while a real
      // failure returned silently. Only the un-negated form is accepted.
      expect(before, m[0]).toMatch(/if \(\w+\.suppressed\)/);
      expect(before, m[0]).not.toMatch(/if \(!\w+\.suppressed\)/);
    }
  });

  it('never puts the internal in-flight string in front of a user', () => {
    expect(DASH).not.toMatch(/already-in-flight/);
  });
});

describe('the busy flag reaches the cards', () => {
  it('the section takes isPending and gives every card a busy prop', () => {
    expect(SECTION).toMatch(/isPending: *\(/);
    expect(SECTION).toMatch(/busy=\{/);
    // Keyed on the ROW id, which is `${kind}:${entityId}` — the same string the
    // handlers pass as actionId, or the button would never light up.
    expect(SECTION).toMatch(/isPending\(r\.id\)/);
  });

  it('passes busy to all five card types', () => {
    for (const card of [
      'PaymentVerifyCard', 'ListingApprovalCard', 'PayoutCard', 'DisputeCard', 'StalledDeliveryCard',
    ]) {
      const at = SECTION.indexOf(`<${card}`);
      expect(at, card).toBeGreaterThan(-1);
      expect(SECTION.slice(at, at + 600), card).toMatch(/busy=\{/);
    }
  });
});

describe('the two corrected call sites stay corrected', () => {
  // `tsc` sees neither: useApp() is `any`, and TypeScript happily assigns a
  // 1-parameter function to a 2-parameter signature. Both defects restore
  // cleanly with the whole suite green, so they are pinned here.

  it('membership passes the REQUEST, not the bare id', () => {
    // approveSubscription reads `request.id`; handed a string it sends
    // { reqId: undefined } and the button is inert.
    expect(DASH).toMatch(/approveSubscription\(findSubscriptionRequest\(/);
    expect(DASH).toMatch(/rejectSubscription\(findSubscriptionRequest\(/);
    expect(DASH).not.toMatch(/approveSubscription\(requestId\)/);
    expect(DASH).not.toMatch(/rejectSubscription\(requestId[,)]/);
  });

  it('payout approval forwards the transfer reference', () => {
    // functions/payoutTransfer.js rejects an empty ref, so dropping it breaks
    // every payout approval.
    expect(DASH).toMatch(/approveWithdrawal\(withdrawalId, transferRef\)/);
    expect(DASH).toMatch(/onApprovePayout: \(withdrawalId: string, transferRef: string\)/);
  });
});

describe('a listing decision reports its write (F1)', () => {
  // Behaviour is covered by context/listingDecisionResult.test.tsx and
  // hooks/adminActionRollback.test.ts. This pins the shape that makes the
  // optimistic rollback reachable at all: the two functions must RETURN the
  // write's outcome rather than firing it and resolving undefined.
  for (const fn of ['const approveListing', 'const rejectListing']) {
    it(`${fn} returns its write result`, () => {
      const at = CONTEXT.indexOf(fn);
      expect(at, fn).toBeGreaterThan(-1);
      const body = CONTEXT.slice(at, CONTEXT.indexOf('\n  const ', at + 40));
      expect(body, fn).toMatch(/const writeResult = updateDoc\(/);
      expect(body, fn).toMatch(/return \{ success: true \};/);
      expect(body, fn).toMatch(/return \{ success: false \};/);
      expect(body, fn).toMatch(/return writeResult;/);
    });

    it(`${fn} also rolls the LOCAL optimistic flip back`, () => {
      // Reporting the failure is only half of it. The catch also flips the lot
      // back in the local auctions array, because the doc never changed on a
      // failed write and no snapshot will arrive to correct us. Without this,
      // the lot's local status stays 'live', it drops out of
      // pendingListingDrops, and the row leaves actionQueue anyway — the
      // un-hide would restore nothing.
      //
      // A SOURCE PIN, not a behavioural one: observing this needs a stateful
      // renderer, and vitest here is node-only. See the report's gap list.
      const at = CONTEXT.indexOf(fn);
      const body = CONTEXT.slice(at, CONTEXT.indexOf('\n  const ', at + 40));
      // Exact: a predicate bound to anything but `id` leaves localBefore
      // undefined, and the restore then no-ops on every failure.
      expect(body, fn).toMatch(/const localBefore = auctions\.find\(a => a\.id === id\);/);
      // The restore itself is ordinary logic now, unit-tested in
      // utils/localAuctionRollback.test.ts — an inverted match, a no-op map and
      // an id matching nothing all die there. This only pins that it is called.
      expect(body, fn).toMatch(/setAuctions\(prev => restoreLocalAuction\(prev, id, localBefore\)\)/);
    });

    it(`${fn} returns its write result LAST`, () => {
      // Hoisting `return writeResult` above the local flip and the admin-action
      // log silently kills both — the function returns before they run.
      const at = CONTEXT.indexOf(fn);
      const body = CONTEXT.slice(at, CONTEXT.indexOf('\n  const ', at + 40));
      const ret = body.lastIndexOf('return writeResult;');
      expect(ret, fn).toBeGreaterThan(-1);
      for (const sideEffect of ['setAuctions(prev => prev.map(', 'setAdminActions(prev => [action']) {
        expect(body.indexOf(sideEffect), `${fn} / ${sideEffect}`).toBeGreaterThan(-1);
        expect(body.indexOf(sideEffect), `${fn} / ${sideEffect}`).toBeLessThan(ret);
      }
      // Nothing but the useCallback's own closing may follow it — no statement
      // may be added after the return, where it would never run.
      const tail = body.slice(ret).replace('return writeResult;', '').trim();
      expect(tail, fn).toMatch(/^\},\s*\[[^\]]*\]\);$/);
    });
  }

  it('AdminPanel does not claim success on a failed write', () => {
    // The one behavioural change in this diff with no other test touching it.
    // Inverting or deleting the gate restores the original defect: an
    // unconditional success toast on a rejected write.
    for (const handler of ['handleApproveAuction', 'handleRejectAuction']) {
      const at = PANEL.indexOf(handler);
      expect(at, handler).toBeGreaterThan(-1);
      const body = PANEL.slice(at, at + 500);
      expect(body, handler).toMatch(/if \(!result\?\.success\) return;/);
      expect(body, handler).not.toMatch(/if \(result\?\.success\) return;/);
      // and the gate must come BEFORE the toast it guards
      expect(body.indexOf('if (!result?.success) return;'), handler)
        .toBeLessThan(body.indexOf('showToast'));
    }
  });
});
