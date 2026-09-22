import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveCourierContact, formatCourierBlock } from './courierContact';

/* ======================================================================
   The card these back used to invent its gaps: '+962 7 9888 1234' for a
   missing phone, 'winner@example.com' for a missing email, 'Amman' for a
   missing city — and only when currentBidderId existed, which made them
   look resolved rather than placeholder. The phone was a `tel:` link, so
   an admin could tap it and dial a number belonging to nobody.

   These tests exist to make sure a missing value stays missing.
   ====================================================================== */

describe('resolveCourierContact', () => {
  const full = { name: 'Karam', phoneNumber: '0790005753', email: 'k@example.com', city: 'Amman' };

  it('passes real details through', () => {
    const c = resolveCourierContact(full);
    expect(c).toMatchObject({ name: 'Karam', phone: '0790005753', email: 'k@example.com', city: 'Amman' });
    expect(c.isDispatchable).toBe(true);
    expect(c.missing).toEqual([]);
  });

  describe('never invents a value', () => {
    it('returns null for a missing phone rather than a plausible number', () => {
      const c = resolveCourierContact({ name: 'Karam', city: 'Amman' });
      expect(c.phone).toBeNull();
      expect(c.isDispatchable).toBe(false);
      expect(c.missing).toContain('phone');
    });

    it('returns null for a missing city rather than defaulting to Amman', () => {
      // The old default. Jordan is not one city, and a parcel routed to the
      // wrong governorate on a guess is a real delivery failure.
      const c = resolveCourierContact({ name: 'Karam', phoneNumber: '079' });
      expect(c.city).toBeNull();
      expect(c.missing).toContain('city');
    });

    it('returns null for a missing email rather than winner@example.com', () => {
      expect(resolveCourierContact({ name: 'K', phoneNumber: '079', city: 'Amman' }).email).toBeNull();
    });

    it('treats a MISSING USER DOCUMENT as nothing known', () => {
      for (const absent of [null, undefined]) {
        const c = resolveCourierContact(absent);
        expect(c).toMatchObject({ name: null, phone: null, email: null, city: null });
        expect(c.isDispatchable).toBe(false);
        expect(c.missing).toEqual(['name', 'phone', 'city']);
      }
    });

    it('treats blank and whitespace-only strings as absent', () => {
      const c = resolveCourierContact({ name: '  ', phoneNumber: '', city: '\t' });
      expect(c).toMatchObject({ name: null, phone: null, city: null });
    });

    it('ignores non-string junk instead of rendering it', () => {
      const c = resolveCourierContact({ name: 42 as never, phoneNumber: {} as never, city: [] as never });
      expect(c).toMatchObject({ name: null, phone: null, city: null });
    });
  });

  describe('the fallbacks it DOES accept, and why', () => {
    it('falls back to the CliQ number, which is a real number the buyer gave', () => {
      const c = resolveCourierContact({ transferPhone: '0791111111', name: 'K', city: 'Irbid' });
      expect(c.phone).toBe('0791111111');
      expect(c.isDispatchable).toBe(true);
    });

    it('prefers the account phone over the CliQ number', () => {
      expect(resolveCourierContact({ phoneNumber: '079AAA', transferPhone: '079BBB' }).phone).toBe('079AAA');
    });

    it('accepts the masked bidder label for the NAME only', () => {
      // A courier can work with an imperfect name. Not with an imagined number.
      const c = resolveCourierContact(null, 'K••••m');
      expect(c.name).toBe('K••••m');
      expect(c.phone).toBeNull();
      expect(c.isDispatchable).toBe(false);
    });
  });

  it('does not require an email to dispatch', () => {
    // Couriers here work from a phone and an address. Demanding an email would
    // block dispatches that can genuinely proceed.
    const c = resolveCourierContact({ name: 'K', phoneNumber: '079', city: 'Zarqa' });
    expect(c.email).toBeNull();
    expect(c.isDispatchable).toBe(true);
  });
});

describe('formatCourierBlock', () => {
  const ok = resolveCourierContact({ name: 'Karam', phoneNumber: '0790005753', city: 'Amman' });

  it('builds a block an admin can paste', () => {
    const block = formatCourierBlock(ok, { title: 'بورش ريموت', auctionNumber: 2002 });
    expect(block).toContain('الاسم: Karam');
    expect(block).toContain('الهاتف: 0790005753');
    expect(block).toContain('المدينة: Amman');
    expect(block).toContain('رقم المزاد: 2002');
  });

  it('omits an absent email rather than printing an empty line', () => {
    expect(formatCourierBlock(ok, { title: 'x' })).not.toContain('البريد');
  });

  it('returns NULL when the contact is incomplete', () => {
    // So the caller cannot announce a successful copy of something that is not
    // there — the button it replaces claimed to copy and copied nothing at all.
    const bad = resolveCourierContact({ name: 'Karam' });
    expect(formatCourierBlock(bad, { title: 'x' })).toBeNull();
  });
});

describe('the admin card never ships a fabricated contact again', () => {
  // A source guard, because the defect was not in logic anyone could unit-test
  // — it was three constants sitting in a JSX expression, rendered as if they
  // were data, with the phone wrapped in a dialable tel: link.
  const SRC = readFileSync(
    fileURLToPath(new URL('../components/admin/OurDropsSection.tsx', import.meta.url)),
    'utf8',
  ).replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, ''); // comments stripped: the fix documents the old values

  it('carries no placeholder phone, email or city', () => {
    expect(SRC).not.toMatch(/9888\s*1234/);
    expect(SRC).not.toMatch(/winner@example\.com/);
    // 'Amman' as a bare fallback string. The word may legitimately appear in
    // real data or a label, so this pins the `|| 'Amman'` shape specifically.
    expect(SRC).not.toMatch(/\|\|\s*['"]Amman['"]/);
  });

  it('resolves the contact through the shared helper', () => {
    expect(SRC).toMatch(/resolveCourierContact\(/);
  });

  it('only builds a tel: link when a phone actually exists', () => {
    // `tel:${something}` with no guard is exactly how a placeholder became
    // dialable. Every tel: here must sit behind a truthiness check on the phone.
    const telUses = SRC.match(/href=\{`tel:\$\{[^}]*\}`\}/g) || [];
    expect(telUses.length).toBeGreaterThan(0);
    for (const use of telUses) {
      expect(use).toMatch(/contact\.phone/);
    }
    expect(SRC).toMatch(/contact\.phone \?/);
  });

  it('the dispatch button really copies, and refuses when incomplete', () => {
    expect(SRC).toMatch(/navigator\.clipboard\.writeText/);
    expect(SRC).toMatch(/disabled=\{!contact\.isDispatchable\}/);
  });
});
