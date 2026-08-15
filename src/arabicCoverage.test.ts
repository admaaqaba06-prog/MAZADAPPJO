// The Arabic sweep, kept swept.
//
// A partner review asked to "replace all English words" and named a handful.
// The real list was ~20 leaked strings plus TermsModal, which was English end
// to end AND hardcoded `dir="ltr"` — so even Arabic reaching it would have
// rendered left-to-right.
//
// This is a ratchet, not a translator: it finds user-visible English that is
// not inside a language conditional. Admin tooling and the simulator are
// exempt — they are internal surfaces and English by design.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Internal-only surfaces. English here is a decision, not a leak. */
const INTERNAL =
  /Simulator|admin\/|AdminPanel|AdminDashboard|AdminWalletConsole|DropBuilderView|AuctionDropBuilderView/;

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...tsxFiles(p));
    // Forward slashes always, regardless of the platform's path separator:
    // INTERNAL below matches literal `admin/`, and join() returns
    // backslash-joined paths on Windows, which would never match — silently
    // admitting every admin/* string as a "leak" on a Windows checkout.
    else if (/\.tsx$/.test(f) && !/\.test\./.test(f)) out.push(p.split('\\').join('/'));
  }
  return out;
}

/**
 * A line is a candidate when it renders Latin text and carries no language
 * conditional. The ±6-line window is what makes a multi-line
 * `isAr ? (<>…</>) : (<>…</>)` ternary read as bilingual, since its branches
 * sit several lines from the condition.
 */
function leaks(): string[] {
  const found: string[] = [];
  for (const file of tsxFiles('src')) {
    if (INTERNAL.test(file)) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((ln, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(ln)) return; // comments
      const ctx = lines.slice(Math.max(0, i - 6), i + 3).join('\n');
      if (/isAr|lang ===|language ===|[؀-ۿ]/.test(ctx)) return;

      const m =
        // `</` is required, so a TypeScript generic — getLiveAuctions<T>( —
        // does not read as JSX text between two angle brackets.
        ln.match(/>\s*([A-Za-z][A-Za-z0-9 '&,.!?%:\-]{3,60})\s*<\//) ||
        ln.match(/(?:placeholder|title|aria-label|alt)=["']([A-Za-z][A-Za-z0-9 '&,.!?%:\-]{3,60})["']/);
      if (!m) return;

      const text = m[1].trim();
      if (/^(https?|div|span|br|Promise|void|string|number|boolean|null|undefined)/.test(text)) return;
      if (!/[a-z]{3}/.test(text)) return;
      found.push(`${file}:${i + 1}  ${text}`);
    });
  }
  return found;
}

describe('Arabic coverage', () => {
  it('has no untranslated user-facing string on a customer surface', () => {
    expect(leaks()).toEqual([]);
  });

  it('renders the terms in the reader’s language and direction', () => {
    const raw = readFileSync(new URL('./components/TermsModal.tsx', import.meta.url), 'utf8');
    // Comments stripped first: this file's own header documents the removal of
    // `dir="ltr"` by name, and a comment explaining why something is gone must
    // not read as its presence.
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // It was `dir="ltr"`, hardcoded — an Arabic legal document laid out
    // left-to-right is unreadable regardless of how good the translation is.
    expect(src).not.toMatch(/dir="ltr"/);
    expect(src).toMatch(/dir=\{isAr \? 'rtl' : 'ltr'\}/);
    expect(src).toMatch(/from '\.\.\/content\/legalTerms'/);
  });

  it('gives every legal line both languages', () => {
    const src = readFileSync(new URL('./content/legalTerms.ts', import.meta.url), 'utf8');
    const en = (src.match(/^\s*en:/gm) ?? []).length;
    const ar = (src.match(/^\s*ar:/gm) ?? []).length;
    expect(en).toBeGreaterThan(0);
    expect(ar).toBe(en);
  });
});
