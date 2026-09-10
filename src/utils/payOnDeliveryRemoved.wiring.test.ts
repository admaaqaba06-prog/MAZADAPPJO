/**
 * "VIP Member — Pay on Delivery" is gone.
 *
 * It was only ever COPY: three marketing strings promising a payment channel
 * the platform has never had. content/legalTerms.ts already struck the same
 * claim from the formal terms and recorded why ("promising channels the platform
 * cannot accept is the kind of claim a consumer-protection complaint is built
 * from"); this removes the remaining consumer-facing copies and stops them
 * coming back.
 *
 * WHAT THIS TEST DELIBERATELY DOES NOT BAN: the word "VIP". Three unrelated
 * things use it — VIP WhatsApp support (a real support perk), "VIP telephone
 * numbers" (a product CATEGORY: Jordan's premium plate/number market), and the
 * Gold seller tier badge. Banning the token would delete working features to
 * satisfy a string search. The claim, not the word, is what had to go.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('..', import.meta.url));
const FUNCTIONS = fileURLToPath(new URL('../../functions', import.meta.url));

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js)$/.test(entry) && !/\.test\.(ts|tsx|js)$/.test(entry)) out.push(p);
  }
  return out;
}

const files = [...walk(SRC), ...walk(FUNCTIONS)];

/** Strip line and block comments — this test's own explanatory notes must not trip it. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('pay-on-delivery / COD is absent from the product', () => {
  it('no user-facing string promises pay on delivery, in either language', () => {
    for (const f of files) {
      const s = code(readFileSync(f, 'utf8'));
      expect(s, `${f} still promises pay-on-delivery (EN)`).not.toMatch(/pay[-\s]?on[-\s]?delivery/i);
      expect(s, `${f} still promises cash-on-delivery (EN)`).not.toMatch(/cash on delivery/i);
      expect(s, `${f} still promises pay-on-delivery (AR)`).not.toContain('الدفع عند الاستلام');
    }
  });

  it('the membership benefits no longer list it', () => {
    const sub = code(readFileSync(join(SRC, 'components/SubscriptionView.tsx'), 'utf8'));
    expect(sub).not.toContain('VIP pay-on-delivery');
    // The rest of the benefit list is intact — this removed one bullet, not the screen.
    expect(sub).toContain('Bid freely');
    expect(sub).toContain('Buyer protection');
  });

  it('the WhatsApp drop caption no longer carries it in its terms', () => {
    const caption = code(readFileSync(join(SRC, 'utils/dropCaption.ts'), 'utf8'));
    expect(caption).not.toContain('الدفع عند الاستلام');
    // The other terms lines survive.
    expect(caption).toContain('حماية المشتري');
    expect(caption).toContain('التسليم');
  });

  it('there is no checkout, order or payment branch keyed on a VIP/COD flag', () => {
    // The feature never had logic — this pins that, so nobody re-adds a branch
    // for a channel the platform still cannot accept.
    for (const f of files) {
      const s = code(readFileSync(f, 'utf8'));
      expect(s, f).not.toMatch(/isVip|vipMember|payOnDelivery|codEnabled|cashOnDelivery/i);
    }
  });

  it('CliQ remains the only payment channel described', () => {
    const legal = readFileSync(join(SRC, 'content/legalTerms.ts'), 'utf8');
    expect(legal).toContain('CliQ');
  });
});

describe('unrelated "VIP" features are preserved', () => {
  it('VIP WhatsApp support, the VIP-numbers category and the Gold tier badge all survive', () => {
    // Guards the over-eager sweep: a blanket delete of the token would have
    // taken a support perk, a product category and a seller tier with it.
    const landing = readFileSync(join(SRC, 'landing/LandingView.tsx'), 'utf8');
    const translations = readFileSync(join(SRC, 'landing/translations.ts'), 'utf8');
    const sellerCenter = readFileSync(join(SRC, 'components/SellerCenterView.tsx'), 'utf8');
    expect(landing).toContain('VIP WhatsApp support');
    expect(translations).toContain('VIP telephone numbers');
    expect(sellerCenter).toContain('Exclusive Gold VIP status');
  });
});
