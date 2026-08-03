// Source-text assertions: vitest here is environment: 'node' with no jsdom.
// House idiom, per descriptionSurfaces.wiring.test.ts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(`./${p}`, import.meta.url), 'utf8');

describe('the seller learns what to fix', () => {
  it('renders the stored rejection reason', () => {
    // It has been written on every reject and cleared on every resubmit since
    // the review gate shipped, and displayed nowhere.
    expect(read('SellerCenterView.tsx')).toMatch(/rejectionPresetLabel\(/);
  });

  it('calls the state Needs editing, not Rejected', () => {
    // The state has always been editable and resubmittable — handleResubmit
    // sets status back to 'processing' and clears the reason. Only the label
    // called it final.
    const src = read('SellerCenterView.tsx');
    expect(src).toMatch(/يحتاج تعديل/);
    expect(src).toMatch(/Needs editing/);
    expect(src).not.toMatch(/en: 'Rejected'/);
  });

  it('offers the admin preset reasons', () => {
    expect(read('admin/cards/ListingApprovalCard.tsx')).toMatch(/REJECTION_PRESETS/);
  });

  it('still requires a non-empty reason to reject', () => {
    // A preset satisfies the guard by filling the same state the free-text box
    // writes; the guard itself must not be relaxed.
    expect(read('admin/cards/ListingApprovalCard.tsx')).toMatch(/!reason\.trim\(\)/);
  });
});
