// The rename to Mazzado was done with a tree-wide find-and-replace, and it
// quietly rewrote three values that are NOT brand strings:
//
//   CLIQ_RECIPIENT_NAME_EN  'MAZAD JO M' -> 'MAZZADO M'
//   CLIQ_RECIPIENT_NAME_AR  the Arabic equivalent
//   CLIQ_ALIAS              'mazadjom'   -> 'mazzadom'
//
// Those are what the BANK holds on the receiving account. A customer copies the
// alias into a CliQ transfer. Renaming them ahead of the bank does not change a
// label — it sends customers' money to an alias that does not resolve.
//
// cliq.ts says all of this in a comment at the top of the file. The comment did
// not stop the sweep, because a sweep does not read. This test does.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CLIQ_RECIPIENT_NAME_EN,
  CLIQ_RECIPIENT_NAME_AR,
  CLIQ_ALIAS,
} from './cliq';

describe('payment identifiers do not follow the brand', () => {
  it('keeps the CliQ alias the bank actually has registered', () => {
    expect(CLIQ_ALIAS).toBe('mazadjom');
  });

  it('keeps the recipient name the bank actually has on the account', () => {
    expect(CLIQ_RECIPIENT_NAME_EN).toBe('MAZAD JO M');
    expect(CLIQ_RECIPIENT_NAME_AR).toBe('مؤسسة مزاد الأردن م');
  });

  it('carries no Mazzado spelling at all', () => {
    // Deliberately asserted on the raw file, not the exports: a future rename
    // that adds a second "branded" alias next to these would pass the equality
    // checks above while still shipping a wrong value to a customer.
    const src = readFileSync(new URL('./cliq.ts', import.meta.url), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code, 'cliq.ts must not be rebranded before the bank record is').not.toMatch(/mazzado/i);
  });
});

describe('the brand constant is the only place the name lives', () => {
  it('states plainly that the Firebase project id is not a brand string', () => {
    const src = readFileSync(new URL('./brand.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/mazadjoapp/);
    expect(src).toMatch(/immutable/i);
  });
});
