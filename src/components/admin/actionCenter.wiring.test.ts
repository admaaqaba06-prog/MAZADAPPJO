// Vitest here is environment: 'node' — the component cannot be rendered, and
// `tsc` cannot help either (@types/react is absent, so useApp() is `any` and a
// wrong argument compiles). The classification is the safety property of this
// whole feature, so it is asserted against the source.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const DASH = readFileSync(new URL('../AdminDashboardView.tsx', import.meta.url), 'utf8');
const SECTION = readFileSync(new URL('./ActionCenterSection.tsx', import.meta.url), 'utf8');

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
      expect(before, m[0]).toMatch(/\.suppressed/);
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
