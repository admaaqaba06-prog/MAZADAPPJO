import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  SUPPORT_PHONE_NATIONAL,
  SUPPORT_PHONE_E164,
  SUPPORT_PHONE_TEL,
  SUPPORT_WHATSAPP_URL,
} from './support';

/**
 * One number, everywhere, and nothing left over.
 *
 * There used to be two support numbers hardcoded across nine files in five
 * formats. Centralising them fixes today; this file is what stops the next one
 * being pasted in. It scans the real source tree rather than trusting that the
 * sweep was complete.
 */

const ROOT = path.resolve(__dirname, '../..');

/** The two numbers that were in use before the consolidation, any format. */
const RETIRED = ['781444899', '785446498'];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** Digits only, so `+962 78 144 4899` and `wa.me/962781444899` both match. */
const digits = (s: string) => s.replace(/\D/g, '');

describe('the support number is derived, not listed', () => {
  it('builds every format from the one national value', () => {
    expect(SUPPORT_PHONE_NATIONAL).toBe('0785168550');
    expect(SUPPORT_PHONE_E164).toBe('+962785168550');
    expect(SUPPORT_PHONE_TEL).toBe('tel:+962785168550');
    expect(SUPPORT_WHATSAPP_URL).toBe('https://wa.me/962785168550');
  });

  it('drops the trunk zero exactly once', () => {
    // '0785…' → '+962785…', not '+9620785…' and not '+96285…'.
    expect(SUPPORT_PHONE_E164).not.toContain('9620');
    expect(digits(SUPPORT_PHONE_E164)).toBe('962' + SUPPORT_PHONE_NATIONAL.slice(1));
  });

  it('gives wa.me digits only — it silently fails on a plus or a space', () => {
    const tail = SUPPORT_WHATSAPP_URL.replace('https://wa.me/', '');
    expect(tail).toMatch(/^\d+$/);
  });

  it('writes the number down in exactly ONE place', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/constants/support.ts'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    // The national form appears once, as its own declaration. Every other format
    // is computed, so a literal second occurrence means someone re-typed it.
    expect((code.match(/785168550/g) ?? []).length).toBe(1);
  });
});

describe('the server copy matches the client constant', () => {
  // functions/ cannot import from src/, so emailCopy.js repeats the value. That
  // is the whole reason this test exists.
  const emailCopy = fs.readFileSync(path.join(ROOT, 'functions/emailCopy.js'), 'utf8');

  it('uses the same E.164 for supportPhone', () => {
    expect(emailCopy).toContain(`supportPhone: '${SUPPORT_PHONE_E164}'`);
  });

  it('points paymentsPhone at the same line', () => {
    // Kept as a field because the template and the n8n fallback read it by name;
    // dropping it would render a labelled footer row with nothing in it.
    expect(emailCopy).toContain(`paymentsPhone: '${SUPPORT_PHONE_E164}'`);
  });

  it('carries no retired number', () => {
    for (const old of RETIRED) {
      expect(digits(emailCopy), `emailCopy.js still contains ${old}`).not.toContain(old);
    }
  });
});

describe('no retired support number survives anywhere', () => {
  /**
   * Scanned as DIGITS, so every disguise is caught: `+962781444899`,
   * `00962 78 144 4899`, `0781444899`, `wa.me/962781444899`, `+962-78-144-4899`.
   */
  it('is absent from src/, functions/, n8n/, docs/ and index.html', () => {
    const targets = [
      ...walk(path.join(ROOT, 'src')),
      ...walk(path.join(ROOT, 'functions')),
      ...walk(path.join(ROOT, 'n8n')),
      ...walk(path.join(ROOT, 'docs')),
      path.join(ROOT, 'index.html'),
    ].filter(f => /\.(ts|tsx|js|jsx|json|md|html)$/.test(f));

    const offenders: string[] = [];
    for (const file of targets) {
      // This test names the retired numbers in order to forbid them.
      if (file.endsWith('supportPhone.parity.test.ts')) continue;
      // HISTORICAL RECORDS are exempt. docs/superpowers/** and ROADMAP.md are a
      // changelog: they record what the code said at the time, and rewriting a
      // past plan to match the present falsifies the record. Live legal and
      // template content under docs/legal and docs/email is NOT exempt.
      const rel = path.relative(ROOT, file).split(path.sep).join('/');
      if (rel.startsWith('docs/superpowers/') || rel === 'docs/ROADMAP.md' || rel === 'docs/BACKLOG.md') continue;

      let text = fs.readFileSync(file, 'utf8');
      // In CODE, a comment naming the old number is legitimate history —
      // support.ts documents what it replaced, and that explanation is the most
      // useful thing in the file. In PROSE (.md/.html) the number IS the
      // content, so those are scanned verbatim.
      if (/\.(ts|tsx|js|jsx)$/.test(file)) {
        text = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      }

      const d = digits(text);
      for (const old of RETIRED) {
        if (d.includes(old)) offenders.push(`${path.relative(ROOT, file)} → ${old}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('leaves CUSTOMER numbers alone', () => {
    // The sweep must not have eaten test fixtures or a form placeholder: those
    // are a user's own contact details, not ours, and rewriting them would
    // corrupt unrelated test data.
    const fixtures = digits(fs.readFileSync(path.join(ROOT, 'src/utils/phoneNumber.test.ts'), 'utf8'));
    expect(fixtures).toContain('962791234567');

    // Was LandingView's contact-form placeholder (`0790000000`). That form was a
    // local-storage-only "early adopter" signup seeded with invented names — it
    // wrote to nobody and was deleted with the landing redesign, so there is no
    // placeholder left there to protect. Retargeted to a placeholder that still
    // exists rather than dropped: the guarantee is that a CUSTOMER-shaped number
    // in live UI survives the sweep, and it needs a live example to mean
    // anything.
    const profile = fs.readFileSync(path.join(ROOT, 'src/components/ProfileView.tsx'), 'utf8');
    expect(profile).toContain('079XXXXXXXX');
  });
});
