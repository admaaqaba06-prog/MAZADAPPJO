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
//
// WHERE THINGS STAND NOW (2026-08-26): the account has since MOVED to Al Ahli
// Bank and the English name was genuinely re-registered as MAZZADO, so that one
// is expected to be 'MAZZADO' below — the change was made after the bank record
// did, which is the order this file exists to enforce. The ALIAS and the ARABIC
// name are still pending their real registered values and are still pinned to
// the old ones, because a guessed alias is a transfer that goes nowhere.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, TS_EXTS, sourceFiles } from './sourceFiles';
import {
  CLIQ_RECIPIENT_NAME_EN,
  CLIQ_RECIPIENT_NAME_AR,
  CLIQ_ALIAS,
  CLIQ_BANK_NAME_AR,
  CLIQ_BANK_NAME_EN,
  CLIQ_IBAN,
} from './cliq';
import { BRAND_HOST } from './brand';

describe('payment identifiers do not follow the brand', () => {
  it('keeps the CliQ alias the bank actually has registered', () => {
    // 'mazadjom' until 2026-08-26, when the account moved to Al Ahli Bank and
    // that alias was confirmed DEAD — every payment screen was handing customers
    // a destination that no longer resolved.
    expect(CLIQ_ALIAS).toBe('MAZZADO');
  });

  it('has no hardcoded copy of the alias left anywhere', () => {
    // The admin console spelled MAZADJOM into three strings, one of them the
    // deposit-destination row. A hardcoded alias is the failure mode this whole
    // file guards: the constant moves and the copy does not, so a screen keeps
    // pointing at a dead account.
    const offenders: string[] = [];
    for (const file of sourceFiles(join(ROOT, 'src'), TS_EXTS)) {
      if (file.includes('brandBoundary.test') || file.includes('constants/cliq.ts')) continue;
      const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      if (/mazadjom/i.test(src)) offenders.push(file.replace(/\\/g, '/'));
    }
    expect(offenders).toEqual([]);
  });

  it('keeps the recipient name the bank actually has on the account', () => {
    // Updated 2026-08-26: the account MOVED to Al Ahli Bank and the English name
    // was re-registered as MAZZADO. Confirmed by the account holder before this
    // was changed — the previous attempt at this rename was reverted precisely
    // because the bank record had not moved yet.
    expect(CLIQ_RECIPIENT_NAME_EN).toBe('MAZZADO');
    // BOTH FIELDS CARRY THE LATIN REGISTERED STRING, and the Arabic one is not
    // an oversight. A CliQ alias is Latin alphanumeric, and what the bank shows
    // a payer when they enter it is the registered string — this field exists so
    // the payer can verify a match, so «مزادو» would be a name the bank does not
    // hold. Was «مؤسسة مزاد الأردن م», the old entity at the old bank.
    expect(CLIQ_RECIPIENT_NAME_AR).toBe('MAZZADO');
  });

  it('names the bank that actually holds the account', () => {
    // Was hardcoded in 17 places across 7 files, and every one of them said Arab
    // Bank after the account had already moved — seventeen lines telling a
    // customer to look for their money at the wrong bank.
    expect(CLIQ_BANK_NAME_EN).toBe('Jordan Ahli Bank');
    expect(CLIQ_BANK_NAME_AR).toBe('البنك الأهلي الأردني');
  });

  it('carries an IBAN whose checksum is valid', () => {
    // A hand-typed IBAN is a wrong destination that looks right. mod-97 catches
    // a transposed or dropped digit, which is exactly how one gets typed wrong.
    expect(CLIQ_IBAN).toHaveLength(30); // Jordan
    const re = CLIQ_IBAN.slice(4) + CLIQ_IBAN.slice(0, 4);
    const digits = re.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
    let rem = 0;
    for (const d of digits) rem = (rem * 10 + Number(d)) % 97;
    expect(rem).toBe(1);
  });

  it('carries an IBAN issued by the bank it names', () => {
    // Characters 5-8 of an IBAN are the bank. The screens print the bank name
    // and the IBAN side by side, so if these two ever disagree one of them is
    // sending someone's money to the wrong place. JONB = Jordan Ahli Bank.
    expect(CLIQ_IBAN.slice(4, 8)).toBe('JONB');
    expect(CLIQ_BANK_NAME_EN).toBe('Jordan Ahli Bank');
  });

  it('keeps the IBAN out of the components', () => {
    // It used to be a literal in OrderDetailsView plus a second, divergent copy
    // in a dead SubscriptionView handler. Two copies meant one could be updated
    // and the other left pointing at a closed account — which is what happened.
    const offenders: string[] = [];
    for (const file of sourceFiles(join(ROOT, 'src'), TS_EXTS)) {
      if (file.includes('SellerCenterView') || file.includes('.test.')) continue;
      if (file.replace(/\\/g, '/').endsWith('constants/cliq.ts')) continue;
      const src = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
      if (/JO\d{2} ?[A-Z]{4}/.test(src)) offenders.push(file.replace(/\\/g, '/'));
    }
    expect(offenders).toEqual([]);
  });

  it('has no stale Arab Bank reference left in the app', () => {
    // The seller's own-bank placeholder in SellerCenterView is exempt: that is
    // an example of any Jordanian bank for a SELLER's field, not our account.
    const offenders: string[] = [];
    for (const file of sourceFiles(join(ROOT, 'src'), TS_EXTS)) {
      if (file.includes('SellerCenterView') || file.includes('.test.')) continue;
      // Comments stripped: cliq.ts records that the account MOVED from Arab
      // Bank, and a scan that reads its own rationale as a violation is a
      // mistake this repo has now made three times.
      const src = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
      // CASE-INSENSITIVE. This guard existed and still shipped ARAB BANK to two
      // live payment screens for nine days, because it was written /Arab Bank/
      // and both offenders were uppercase inside a `uppercase font-mono` span.
      if (/arab bank|البنك العربي/i.test(src)) offenders.push(file.replace(/\\/g, '/'));
    }
    expect(offenders).toEqual([]);
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
