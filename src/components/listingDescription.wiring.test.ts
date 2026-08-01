// Both creation paths manufactured a description rather than asking for one.
// The self-serve wizard had NO input at all and wrote `Premium Lot: {title}`;
// the concierge form had a field but fell back to the product name when blank.
// Same shape as the fabricated seller reviews removed in PR #198.
//
// Source-text: vitest here is environment: 'node', so the forms cannot be
// rendered. House idiom — see sellerReviewSeeding.test.ts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const WIZ = readFileSync(new URL('./ListingWizardView.tsx', import.meta.url), 'utf8');
const SELL = readFileSync(new URL('./SellView.tsx', import.meta.url), 'utf8');

/**
 * The description guard's OWN block: from the call to the first closing brace
 * that sits alone on a line.
 *
 * A fixed-width window does not work here. The guards are a chain, so 320
 * characters from `validateDescription(` runs past this guard's `}` and into
 * the price guard — which donates its own `alert(` and `return;`. A mutant that
 * alerted and then fell through to create the lot anyway survived that window.
 */
const GUARD = (WIZ.slice(WIZ.indexOf('validateDescription(')).match(/^validateDescription\([\s\S]{0,400}?\n\s*\}/) ?? [''])[0];

describe('nothing fabricates a description any more', () => {
  it('the wizard no longer invents one from the title', () => {
    expect(WIZ).not.toMatch(/Premium Lot/);
    expect(WIZ).not.toMatch(/معروض مميز/);
  });

  it('the concierge form no longer falls back to the product name', () => {
    expect(SELL).not.toMatch(/cDesc\.trim\(\)\s*\|\|\s*cName/);
  });

  it('neither string survives anywhere in the component tree', () => {
    // Guards against the fabrication being moved rather than deleted.
    expect(WIZ + SELL).not.toMatch(/Premium Lot|معروض مميز/);
  });
});

describe('the wizard captures a real description', () => {
  it('has a description textarea bound to state', () => {
    expect(WIZ).toMatch(/<textarea/);
    expect(WIZ).toMatch(/value=\{description\}/);
    expect(WIZ).toMatch(/setDescription\(/);
  });

  it('passes the seller-typed value to createListing', () => {
    expect(WIZ).toMatch(/description:\s*description\.trim\(\)/);
  });
});

describe('the guard runs BEFORE the listing is created', () => {
  it('calls validateDescription', () => {
    expect(WIZ).toMatch(/validateDescription\(/);
  });

  it('validates ahead of createListing, not after', () => {
    // Validating after the write would create the lot and then complain.
    const v = WIZ.indexOf('validateDescription(');
    const c = WIZ.indexOf('createListing(');
    expect(v).toBeGreaterThan(-1);
    expect(c).toBeGreaterThan(-1);
    expect(v).toBeLessThan(c);
  });

  it('returns early on failure, in the same idiom as the sibling guards', () => {
    // The existing chain is `if (!x) { alert(...); return; }` — a new style here
    // would be the second way this form reports a problem.
    expect(GUARD).not.toBe('');
    expect(GUARD).toMatch(/alert\(/);
    // Scoped to GUARD, not a fixed window: the `return;` must be THIS guard's.
    // Alerting and falling through would publish the lot after complaining.
    expect(GUARD).toMatch(/return;/);
  });

  it('shows the message the rule produced, not a re-typed one', () => {
    expect(GUARD).toMatch(/\.message/);
  });
});
