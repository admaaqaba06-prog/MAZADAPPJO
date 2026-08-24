import { describe, it, expect } from 'vitest';
import { translations } from './translations';
import { translations as landingTranslations } from '../landing/translations';

/**
 * Wave 2b — de-deposit the wallet.
 *
 * Bidding on Mazzado is FREE (pay-after-win). No user-facing copy may imply
 * that a wallet balance, deposit, or fee is required to bid. This guard walks
 * every string in both translation trees (app + landing) and fails if any
 * inherited deposit-to-bid phrase sneaks back in.
 */

const collectStrings = (node: unknown, path = 'root'): Array<{ path: string; value: string }> => {
  if (typeof node === 'string') return [{ path, value: node }];
  if (Array.isArray(node)) {
    return node.flatMap((item, i) => collectStrings(item, `${path}[${i}]`));
  }
  if (node && typeof node === 'object') {
    return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) =>
      collectStrings(v, `${path}.${k}`)
    );
  }
  return [];
};

// Phrases that frame a balance/deposit as bidding power. Case-insensitive.
const FORBIDDEN_PHRASES: Array<{ label: string; pattern: RegExp }> = [
  { label: 'available balance as bid power (EN)', pattern: /available (cash|balance)? ?to bid/i },
  { label: 'available balance as bid power (AR)', pattern: /الرصيد المتاح للمزايدة/ },
  { label: 'deposit fees to participate (EN)', pattern: /deposit fees?/i },
  { label: 'deposit fees to participate (AR)', pattern: /رسوم تأمين/ },
  { label: 'wallet deposit as member feature (EN)', pattern: /wallet balance ledger deposits?/i },
  { label: 'wallet deposit as member feature (AR)', pattern: /إيداع فوري للأموال بمحفظتك/ },
  { label: 'bid-deposit escrow framing (AR)', pattern: /المزايدات المودعة بالضمان/ },
  { label: 'top up to bid (EN)', pattern: /top up your (bidding )?wallet (now )?to (place bids|bid)/i },
  { label: 'CliQ top-up form (dead deposit UI keys)', pattern: /cliq instant cash deposit/i },
];

describe('deposit-to-bid framing is gone from all user-facing copy', () => {
  const allStrings = [
    ...collectStrings(translations, 'app'),
    ...collectStrings(landingTranslations, 'landing'),
  ];

  it('has strings to scan (sanity)', () => {
    expect(allStrings.length).toBeGreaterThan(100);
  });

  for (const { label, pattern } of FORBIDDEN_PHRASES) {
    it(`contains no "${label}" copy`, () => {
      const offenders = allStrings.filter(s => pattern.test(s.value));
      expect(
        offenders.map(o => `${o.path}: ${o.value}`),
        `Deposit-to-bid framing found — bidding is free (pay-after-win)`
      ).toEqual([]);
    });
  }
});
