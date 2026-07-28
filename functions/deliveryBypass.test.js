// Wave 3 — evidence-chain bypass guard.
//
// The whole wave rests on one property: on an `out_for_delivery` order, the ONLY
// buyer path to escrow release is the code-gated `buyer_confirm_receipt`. There
// are two ways to lose that property, and neither is visible to a unit test on
// any single module:
//
//   1. `buyer_confirm_delivery` — the legacy one-tap confirm — carries no code
//      and no photo, and nothing else in releaseOrderEscrow constrains the
//      status it runs from. Without an explicit guard, a buyer could call the
//      old action on an evidence-flow order and pay the seller in one request.
//      The UI stops offering the button; the UI is not the gate.
//
//   2. The `buyer_confirm_receipt` branch could stop reading deliveryCodes and
//      start trusting the outer gate (deliveryConfirm.js), which runs in its own
//      transaction and can therefore be stale by the time money moves.
//
// Like txnPurity.test.js this reads SOURCE rather than behaviour, because the
// defect is one of placement: index.js is a 5k-line Cloud Functions bundle with
// no test seam, and both failures above would leave every existing test green.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(HERE, 'index.js'), 'utf8');

/** The source of exports.releaseOrderEscrow, up to the next top-level export. */
function releaseOrderEscrowSource() {
  const start = SOURCE.indexOf('exports.releaseOrderEscrow');
  expect(start).toBeGreaterThan(-1);
  const rest = SOURCE.slice(start + 1);
  const nextExport = rest.indexOf('\nexports.');
  return nextExport === -1 ? rest : rest.slice(0, nextExport);
}

describe('releaseOrderEscrow — the evidence chain cannot be walked around', () => {
  const body = releaseOrderEscrowSource();

  it('refuses the legacy buyer_confirm_delivery on an out_for_delivery order', () => {
    // Both halves must be present in the same function: the action being
    // refused, and the status it is refused at.
    expect(body).toContain("action === 'buyer_confirm_delivery'");
    expect(body).toMatch(/buyer_confirm_delivery'\s*&&\s*!isCallerAdmin\s*&&\s*orderData\.status === 'out_for_delivery'/);
  });

  it('keeps that refusal off admins, who must still be able to settle a stuck order', () => {
    expect(body).toContain('!isCallerAdmin');
  });

  it('re-reads the delivery code INSIDE the money transaction, not just in the gate', () => {
    // transaction.get on deliveryCodes — the authoritative check. If this moves
    // out, the only code verification left runs in a separate transaction and
    // can be stale when the funds actually move.
    expect(body).toMatch(/transaction\.get\(\s*db\.collection\('deliveryCodes'\)/);
    expect(body).toContain('normalizeDeliveryCodeInput(deliveryCode) !== storedCode');
  });

  it('requires the seller dispatch photo before the buyer can complete', () => {
    expect(body).toContain('orderData.sentPhotoUrl');
  });

  it('stamps the receipt evidence only for buyer_confirm_receipt', () => {
    expect(body).toMatch(/action === 'buyer_confirm_receipt' \? \{/);
    expect(body).toContain('receivedPhotoUrl: String(receivedPhotoUrl).trim()');
  });
});
