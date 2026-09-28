// Payer bank name from the IBAN prefix (BAE embedded-CliQ SCREEN 4).
//
// The rule this file protects is "never guess a bank name on a payment
// screen". This codebase has already shipped a wrong bank destination once —
// the CAPS IBAN documented in constants/cliq.ts — so the fallback path gets as
// much attention here as the happy one.

import { describe, it, expect } from 'vitest';
import {
  bankCodeFromIban,
  getBankNameFromIban,
  isKnownBank,
  bankCodeToName,
  UNKNOWN_BANK_AR,
  UNKNOWN_BANK_EN,
} from './cliqIban';
import { CLIQ_IBAN, CLIQ_BANK_NAME_AR, CLIQ_BANK_NAME_EN } from '../constants/cliq';

describe('bankCodeFromIban', () => {
  it("extracts the 4 bank letters from BAE's own worked example", () => {
    // BAE: "JO20UBSI -> the UBSI part -> Bank al Etihad".
    expect(bankCodeFromIban('JO20UBSI')).toBe('UBSI');
  });

  it('ignores the 2 check digits, which do NOT identify the bank', () => {
    expect(bankCodeFromIban('JO20UBSI')).toBe('UBSI');
    expect(bankCodeFromIban('JO99UBSI')).toBe('UBSI');
  });

  it('tolerates the spacing and casing a bank app displays', () => {
    expect(bankCodeFromIban('JO20 UBSI 1234 5678')).toBe('UBSI');
    expect(bankCodeFromIban('jo20ubsi')).toBe('UBSI');
    expect(bankCodeFromIban('JO20-UBSI')).toBe('UBSI');
  });

  it('works on a full IBAN, not only a prefix', () => {
    // Staq's own sample from the API doc. Not our account — ours is suppressed
    // while the Bank al Etihad IBAN is outstanding, so it cannot be used here.
    expect(bankCodeFromIban('JO21UBSI1010000088005553535')).toBe('UBSI');
  });

  it('refuses anything that is not a Jordanian IBAN shape', () => {
    // A blind substring would turn each of these into a confident wrong bank.
    expect(bankCodeFromIban('UBSI')).toBeNull();          // no JO + digits
    expect(bankCodeFromIban('JOUBSI')).toBeNull();        // missing check digits
    expect(bankCodeFromIban('JO2UBSI')).toBeNull();       // one check digit
    expect(bankCodeFromIban('JO20UB1I')).toBeNull();      // digit inside the code
    expect(bankCodeFromIban('AE20UBSI')).toBeNull();      // not Jordan
    expect(bankCodeFromIban('')).toBeNull();
    expect(bankCodeFromIban(null)).toBeNull();
    expect(bankCodeFromIban(12345)).toBeNull();
  });
});

describe('getBankNameFromIban', () => {
  it('names Bank al Etihad in both languages', () => {
    expect(getBankNameFromIban('JO20UBSI', true)).toBe('بنك الاتحاد');
    expect(getBankNameFromIban('JO20UBSI', false)).toBe('Bank al Etihad');
  });

  it('falls back to neutral copy for a bank not yet in the list', () => {
    expect(getBankNameFromIban('JO20ABCD', true)).toBe(UNKNOWN_BANK_AR);
    expect(getBankNameFromIban('JO20ABCD', false)).toBe(UNKNOWN_BANK_EN);
  });

  it('falls back rather than throwing on junk, so it can never block a payment', () => {
    for (const junk of [null, undefined, '', 'nonsense', 42, {}]) {
      expect(() => getBankNameFromIban(junk, true)).not.toThrow();
      expect(getBankNameFromIban(junk, true)).toBe(UNKNOWN_BANK_AR);
    }
  });

  it('never returns an empty string — the screen always has something to show', () => {
    for (const input of ['JO20UBSI', 'JO20ABCD', '', null]) {
      expect(getBankNameFromIban(input, true).length).toBeGreaterThan(0);
      expect(getBankNameFromIban(input, false).length).toBeGreaterThan(0);
    }
  });
});

describe('isKnownBank', () => {
  it('separates a named bank from the neutral fallback', () => {
    expect(isKnownBank('JO20UBSI')).toBe(true);
    expect(isKnownBank('JO20ABCD')).toBe(false);
    expect(isKnownBank(null)).toBe(false);
  });
});

describe('the map contains only codes established as fact', () => {
  it('agrees with our own receiving IBAN once one is set', () => {
    // constants/cliq.ts pins CLIQ_IBAN and CLIQ_BANK_NAME_* to the bank record,
    // and brandBoundary.test.ts asserts they agree. This ties the new lookup to
    // that same fact instead of restating it: if the account moves banks, the
    // existing guard fails first and this one follows.
    // Null while the account move to Bank al Etihad is mid-flight; the same
    // agreement is asserted in brandBoundary.test.ts, which is where the
    // destination lives. Skipping here keeps that one guard, not zero.
    if (CLIQ_IBAN === null) return;
    expect(getBankNameFromIban(CLIQ_IBAN, false)).toBe(CLIQ_BANK_NAME_EN);
    expect(getBankNameFromIban(CLIQ_IBAN, true)).toBe(CLIQ_BANK_NAME_AR);
  });

  it('every entry is a 4-letter uppercase code with an English name', () => {
    // English is REQUIRED — it is transcribed verbatim from Staq's BankCodes
    // list. Arabic is optional on purpose: getBankNameFromIban falls back to
    // English rather than inventing a translation for a bank we were not given
    // one for. See the module header.
    for (const [code, names] of Object.entries(bankCodeToName)) {
      expect(code, `${code} is not a 4-letter uppercase bank code`).toMatch(/^[A-Z]{4}$/);
      expect(names.en.trim().length, `${code} has no English name`).toBeGreaterThan(0);
      if (names.ar !== undefined) {
        expect(names.ar.trim().length, `${code} has a blank Arabic name`).toBeGreaterThan(0);
      }
    }
  });
});
