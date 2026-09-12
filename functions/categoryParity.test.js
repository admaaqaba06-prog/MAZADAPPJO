// The category taxonomy exists TWICE and has to agree with itself.
//
//   src/utils/categories.ts  — TypeScript, read by the app and the CR-01 grid
//   functions/dailyDigest.js — CommonJS, read by the CR-02 digest
//
// Cloud Functions cannot import the TypeScript source, so the legacy-value map
// is mirrored by hand. That mirror is the sharp edge: `users/{uid}.interests`
// holds canonical ids, older auction docs still carry the value they were
// written with ('Luxury' for a watch, 'Cars' for a vehicle), and the digest
// matches one against the other. Let the two drift and the digest quietly
// matches fewer lots every day — with no error, because "this user matched
// nothing" is a legitimate, expected outcome the feature is told not to fall
// back from. Nobody would notice until a seller asked why their category never
// gets traffic.
//
// So: parse the TypeScript as text and assert the two are identical. Same
// approach and same reason as notifyCopyParity.test.js.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { LEGACY_MATCH, matchesInterests } from './dailyDigest.js';

const tsSource = readFileSync(new URL('../src/utils/categories.ts', import.meta.url), 'utf8');

/** Pull `{ value: 'X', ..., legacyMatch: ['Y'] }` entries out of the TS source. */
function parseTaxonomy() {
  const block = tsSource.slice(
    tsSource.indexOf('export const CATEGORIES'),
    tsSource.indexOf('] as const;'),
  );
  const out = {};
  const entry = /value:\s*'([^']+)'[\s\S]*?legacyMatch:\s*\[([^\]]*)\]/g;
  let m;
  while ((m = entry.exec(block)) !== null) {
    const value = m[1];
    const legacy = m[2]
      .split(',')
      .map((s) => s.trim().replace(/^'|'$/g, ''))
      .filter(Boolean);
    out[value] = legacy;
  }
  return out;
}

describe('category taxonomy parity', () => {
  const ts = parseTaxonomy();

  it('parsed something, so a silent regex failure cannot pass this file', () => {
    // Without this, a refactor of categories.ts that this regex stops matching
    // makes every assertion below vacuously true.
    expect(Object.keys(ts).length).toBeGreaterThanOrEqual(8);
  });

  it('covers exactly the same categories on both sides', () => {
    expect(Object.keys(LEGACY_MATCH).sort()).toEqual(Object.keys(ts).sort());
  });

  it('carries the same legacy values for each category', () => {
    for (const [value, legacy] of Object.entries(ts)) {
      expect(LEGACY_MATCH[value], `legacyMatch for ${value}`).toEqual(legacy);
    }
  });

  it('matches every legacy value the app knows about', () => {
    // The end-to-end statement of the thing that breaks: an interest saved as
    // the canonical id must match a lot stored under any of its old values.
    for (const [canonical, legacy] of Object.entries(ts)) {
      expect(matchesInterests(canonical, [canonical])).toBe(true);
      for (const old of legacy) {
        expect(matchesInterests(old, [canonical]), `${old} should satisfy ${canonical}`).toBe(true);
      }
    }
  });

  it('keeps the CR-01 seed ids in the same taxonomy', () => {
    // CR-01 writes categories/{id} using these same canonical values, so a
    // category present for picking must also be matchable when sending.
    const seedSource = readFileSync(new URL('../scripts/seed-categories.cjs', import.meta.url), 'utf8');
    const ids = [...seedSource.matchAll(/\{ id: '([^']+)'/g)].map((m) => m[1]);
    expect(ids.sort()).toEqual(Object.keys(ts).sort());
  });
});
