// The embedded-CliQ kill switch must FAIL CLOSED, in both halves.
//
// Why this is a test and not a comment. Shipping the CliQ rail before Bank al
// Etihad is connected is not a cosmetic mistake: createCliqPaymentRequest mints
// a local id, no bank hears about it, and CliqPaymentFlow tells the buyer «أرسلنا
// الطلب إلى بنكك». The 90-minute duplicate guard then correctly refuses a retry,
// so the buyer sits locked out while their payment deadline runs down.
//
// A default that flipped to ON — a `!== false` typo, a new flag object missing
// the key — would do that to every winner at once. So the default is asserted
// from the source, on both sides, the way this codebase asserts its other
// unshippable invariants.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('client: the flag defaults OFF', () => {
  const ctx = read('src/context/AppContext.tsx');

  it('reads the flag with === true, never !== false', () => {
    // `!== false` is the FAIL-OPEN convention used by enableGuestBrowsing, and
    // it is the wrong one here: an absent doc would turn the gateway on.
    expect(ctx).toContain('enableCliqGateway: data.enableCliqGateway === true');
    expect(ctx).not.toContain('enableCliqGateway: data.enableCliqGateway !== false');
  });

  it('initialises to false, and falls back to false when the doc is missing', () => {
    const inits = ctx.match(/enableCliqGateway:\s*(true|false)/g) || [];
    expect(inits.length).toBeGreaterThanOrEqual(2); // useState default + no-doc branch
    for (const line of inits) {
      expect(line, `a default flipped ON: ${line}`).toContain('false');
    }
  });
});

describe('server: the callable enforces the flag itself', () => {
  const fns = read('functions/index.js');
  const callable = fns.slice(fns.indexOf('exports.createCliqPaymentRequest'));
  const body = callable.slice(0, callable.indexOf('exports.cliqDemoAdvance'));

  it('reads featureFlags before creating a request', () => {
    // A hidden button is not a disabled payment rail — the callable is
    // reachable directly, so the UI gate cannot be the only one.
    expect(body).toContain("doc('featureFlags')");
    expect(body).toContain('enableCliqGateway === true');
  });

  it('checks the flag BEFORE the transaction that raises the request', () => {
    const flagAt = body.indexOf('enableCliqGateway');
    const createAt = body.indexOf('createCliqRequestTxn');
    expect(flagAt).toBeGreaterThan(-1);
    expect(createAt).toBeGreaterThan(-1);
    expect(flagAt, 'the flag is read after the request is already created').toBeLessThan(createAt);
  });

  it('fails closed when the flag doc cannot be read', () => {
    // A Firestore hiccup must not open a payment rail.
    expect(body).toMatch(/let gatewayEnabled\s*=\s*false/);
    expect(body).toContain('catch');
  });
});

describe('the UI gates the CHOICE, not just the panel', () => {
  const view = read('src/components/OrderDetailsView.tsx');

  it('pins the rail to manual when the gateway is off', () => {
    expect(view).toContain("featureFlags?.enableCliqGateway === true");
    expect(view).toContain("cliqGatewayEnabled ? payRail : 'manual'");
  });

  it('routes every waiting_payment panel through the gated rail, not raw state', () => {
    // If any branch still read `payRail` directly, the selector could render
    // with the gateway off and offer a rail that cannot work.
    const branches = view.match(/order\.status === 'waiting_payment' && \w+ ===/g) || [];
    expect(branches.length).toBe(3);
    for (const b of branches) {
      expect(b, `a panel still branches on raw payRail: ${b}`).toContain('activeRail ===');
    }
  });
});
