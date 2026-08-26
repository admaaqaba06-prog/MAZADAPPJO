import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * The removed operator identity stays removed.
 *
 * On 2026-08-26 the registered entity name, its registration number and the
 * street address were taken out of the site footer, the email footer, the
 * shipping copy and both legal documents. That was five files plus two test
 * files, and the values had been copied around by hand — exactly the shape of
 * thing that comes back one paste at a time.
 *
 * NOT A JUDGEMENT ON THE DECISION. A marketplace holding buyer funds is normally
 * expected to name its operator and an address; that concern is recorded in
 * docs/legal where counsel will see it. This file only enforces what was asked.
 */

const ROOT = join(__dirname, '..', '..');

/** Values that must not reappear as live content. */
const REMOVED = [
  'Al Hani',
  'AlHani',
  'الهاني للوساطة',
  'الوساطة التجارية',
  '200213982',
  'المدينة المنورة',
  'Al-Madina Al-Munawara',
  'Al Madina Al Munawara',
  'Saad 4',
  'مجمع سعد',
];

/**
 * `Al Hani Traders` / «الهاني للتجارة» are FIXTURE VENDOR NAMES in the
 * drop-payload tests — a made-up seller, not the operator — and rewriting them
 * would corrupt unrelated test data. Scanning source only, and skipping tests,
 * keeps them out of scope.
 */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx|js|jsx|md|html|json)$/.test(entry) && !entry.includes('.test.')) out.push(full);
  }
  return out;
}

describe('the removed operator identity does not come back', () => {
  it('appears in no live source, template or legal document', () => {
    const targets = [
      ...sourceFiles(join(ROOT, 'src')),
      ...sourceFiles(join(ROOT, 'functions')),
      ...sourceFiles(join(ROOT, 'n8n')),
      ...sourceFiles(join(ROOT, 'docs', 'legal')),
      ...sourceFiles(join(ROOT, 'docs', 'email')),
      join(ROOT, 'index.html'),
    ];

    const offenders: string[] = [];
    for (const file of targets) {
      // Comments stripped: this removal is DOCUMENTED in cliq-adjacent files and
      // in the legal docs' counsel notes, and a scan that reads its own
      // rationale as a violation is a mistake this repo has made repeatedly.
      const raw = readFileSync(file, 'utf8');
      const text = /\.(ts|tsx|js|jsx)$/.test(file)
        ? raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
        : raw.replace(/<!--[\s\S]*?-->/g, '');

      for (const value of REMOVED) {
        if (text.includes(value)) {
          offenders.push(`${relative(ROOT, file).split(sep).join('/')} → ${value}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('leaves the email footer fields present but blank', () => {
    // Blank, NOT deleted: the n8n template and its fallback read brand.legal,
    // brand.registration and brand.address by name and pair each with a printed
    // label, so removing the keys would render a labelled row with nothing after
    // it. Their has() guard drops a blank row entirely.
    const src = readFileSync(join(ROOT, 'functions', 'emailCopy.js'), 'utf8');
    for (const field of ['legalName', 'legalNameAr', 'registration', 'addressAr', 'addressEn']) {
      expect(src, `${field} must still exist as a key`).toMatch(new RegExp(`${field}:\\s*''`));
    }
  });

  it('keeps the infrastructure identifiers that merely look like the old brand', () => {
    // These are NOT brand strings, and renaming any of them breaks the product.
    //
    // `mazadjoapp` is the Firebase PROJECT ID — immutable, and it is also the
    // host Google sign-in resolves its OAuth handler against, which was only
    // just repaired. A sweep that "tidies" it away takes authentication with it.
    expect(readFileSync(join(ROOT, 'src', 'utils', 'authDomain.ts'), 'utf8'))
      .toContain('mazadjoapp.firebaseapp.com');
    expect(readFileSync(join(ROOT, '.firebaserc'), 'utf8')).toContain('mazadjoapp');
    // The n8n instance the Cloud Functions post every notification to.
    expect(readFileSync(join(ROOT, 'functions', 'index.js'), 'utf8'))
      .toContain('mazadjo.app.n8n.cloud');
  });
});
