// Both creation paths manufactured a description rather than asking for one.
// The self-serve wizard had NO input at all and wrote `Premium Lot: {title}`;
// the concierge form had a field but fell back to the product name when blank.
// Same shape as the fabricated seller reviews removed in PR #198.
//
// Source-text: vitest here is environment: 'node', so the forms cannot be
// rendered. House idiom — see sellerReviewSeeding.test.ts.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const WIZ = readFileSync(new URL('./ListingWizardView.tsx', import.meta.url), 'utf8');
const SELL = readFileSync(new URL('./SellView.tsx', import.meta.url), 'utf8');

const SRC = fileURLToPath(new URL('..', import.meta.url));

/** Every .ts/.tsx file under src/, recursively. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/**
 * The guard, asserted as one anchored piece of syntax rather than a text window
 * or a slice.
 *
 * Three earlier shapes each let a live defect through. A fixed 320-character
 * window ran past this guard's `}` into the price guard, which donated its own
 * `alert(` and `return;`. Replacing it with a slice ending at `/\n\s*\}/` was no
 * better: that is not brace matching, so collapsing the guard onto one line (a
 * plausible prettier outcome, behaviour identical) makes it over-reach into the
 * price guard again, and a nested brace makes it under-reach and false-fail.
 * Matching each token separately left the ARGUMENT and the POLARITY unasserted —
 * `validateDescription(title, isAr)` publishes a 3-character description whenever
 * the title clears 20, and `if (descCheck.ok)` inverts the whole feature.
 *
 * One regex over the whole statement pins argument, polarity, reporting and
 * early return together. The separators are `\s*` rather than `\s*\n\s*` for
 * exactly one reason: the newline-coupled form FALSE-FAILS if the guard is ever
 * collapsed onto one line by a formatter, a reformat with identical behaviour.
 * Every mutant is killed identically under both — verified, see task-2-report.
 */
const GUARD_RE = /const descCheck = validateDescription\(description, isAr\);\s*if \(!descCheck\.ok\) \{\s*alert\(descCheck\.message\);\s*return;\s*\}/;

describe('nothing fabricates a description any more', () => {
  it('the wizard no longer invents one from the title', () => {
    expect(WIZ).not.toMatch(/Premium Lot/);
    expect(WIZ).not.toMatch(/معروض مميز/);
  });

  it('the concierge form no longer falls back to the product name', () => {
    // Negative-only was defeated three ways — a ternary, a `.length` test, and
    // `description: ''` (which silently drops what the seller DID write). The
    // positive assertion below is the one that holds; this stays as the
    // literal-regression guard.
    expect(SELL).not.toMatch(/cDesc\.trim\(\)\s*\|\|\s*cName/);

    const descLine = SELL.split('\n').filter(l => /^\s*description:/.test(l));
    expect(descLine).toHaveLength(1);
    expect(descLine[0]).toMatch(/^\s*description:\s*cDesc\.trim\(\),$/);
    // The product name must not reach the description by ANY syntax.
    expect(descLine[0]).not.toMatch(/cName/);
  });

  it('neither string survives anywhere in src/', () => {
    // Guards against the fabrication being moved rather than deleted — the whole
    // tree, not just the two files this task edited. Exempt: the rule's own doc
    // comment, which explains what was removed, and this test.
    const offenders = sourceFiles(SRC)
      .filter(f => !f.endsWith('utils/listingDescription.ts') && !f.endsWith('listingDescription.wiring.test.ts'))
      .filter(f => /Premium Lot|معروض مميز/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});

describe('the wizard captures a real description', () => {
  it('has a description textarea bound to state', () => {
    expect(WIZ).toMatch(/<textarea/);
    expect(WIZ).toMatch(/value=\{description\}/);
    expect(WIZ).toMatch(/setDescription\(/);
  });

  it('starts empty, so the seller clears the floor with their own words', () => {
    // Seeding the state with filler would reintroduce the fabrication one line
    // above the field and auto-satisfy its own minimum.
    expect(WIZ).toMatch(/const \[description, setDescription\] = useState\(''\);/);
  });

  it('caps the length, since nothing downstream does', () => {
    // Anchored on the attributes themselves, not on a character window: a
    // `[\s\S]{0,600}?` gap would happily match a DIFFERENT textarea added above
    // this one and report the description field as capped while it is not.
    expect(WIZ).toMatch(/<textarea\s*rows=\{3\}\s*maxLength=\{1000\}/);
  });

  it('passes the seller-typed value to createListing', () => {
    // Anchored to the end of the expression: a prefix match also accepts
    // `description.trim().slice(0, 3)` and `description.trim() || title` — the
    // latter being exactly the fallback this task deletes from SellView.
    expect(WIZ).toMatch(/\n\s*description: description\.trim\(\),\n/);
  });
});

describe('the guard runs BEFORE the listing is created', () => {
  it('validates the description itself, and rejects when it is NOT ok', () => {
    // Argument and polarity, both pinned. `validateDescription(title, isAr)`
    // would publish `new` (3 chars) under a 28-character title; `if (descCheck.ok)`
    // would reject every valid description and publish every invalid one.
    expect(WIZ).toMatch(GUARD_RE);
  });

  it('validates ahead of createListing, not after', () => {
    // Validating after the write would create the lot and then complain.
    const v = WIZ.indexOf('validateDescription(');
    const c = WIZ.indexOf('createListing(');
    expect(v).toBeGreaterThan(-1);
    expect(c).toBeGreaterThan(-1);
    expect(v).toBeLessThan(c);
  });

  it('reports in the same idiom as the sibling guards, and returns early', () => {
    // The existing chain is `if (!x) { alert(...); return; }` — a new style here
    // would be the second way this form reports a problem. The message shown is
    // the rule's own, not a re-typed copy that could drift from DESCRIPTION_MIN.
    const [guard] = WIZ.match(GUARD_RE) ?? [];
    expect(guard).toBeDefined();
    expect(guard).toMatch(/alert\(descCheck\.message\);/);
    expect(guard).toMatch(/return;/);
  });
});
