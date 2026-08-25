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
import { BRAND_HOST } from './brand';

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

// index.html cannot import BRAND_HOST — it is static, served before any module
// runs — so its absolute urls are hand-written and drifted: the rename updated
// every visible "MAZZADO" but left all nine urls on mazad-jo.com, and that
// domain now 404s. Nothing caught it, because nothing reads index.html.
//
// What that shipped: `rel=canonical` told search engines the canonical copy of
// every page lives on a dead host, and og:image/twitter:image pointed link
// previews at an image that no longer resolves — so every share of the site in
// WhatsApp, the channel this business actually runs on, rendered without its
// preview card.
describe('index.html absolute urls point at the live host', () => {
  // Comments stripped first: the paragraph above names the retired domain, and
  // a scan that reads its own rationale as a violation is the bug this repo has
  // now written three times.
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '');

  it('carries no reference to the retired domain', () => {
    expect(html, 'index.html still points at mazad-jo.com, which 404s').not.toMatch(/mazad-jo/i);
  });

  it('uses the brand host for every absolute url it owns', () => {
    const ours = html.match(/https:\/\/[^"'\s>]+/g)!.filter(
      (u) => !/(googleapis|gstatic|schema\.org|w3\.org)/.test(u),
    );
    expect(ours.length, 'expected index.html to carry absolute self-referencing urls').toBeGreaterThan(0);
    for (const url of ours) {
      expect(url, `${url} does not use ${BRAND_HOST}`).toContain(BRAND_HOST);
    }
  });
});
