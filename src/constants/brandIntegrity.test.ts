// The retired brand must not appear anywhere a customer can reach it — and the
// brand name that functions/ prints must be the same one src/ prints.
//
// WHAT HAPPENED
//
// The WhatsApp OTP message — the most-read thing this product sends, on every
// sign-in and every registration — read «رمز الدخول إلى مزاد جو». It named a
// brand that had been retired.
//
// It survived because of WHERE it lived, not because anyone approved it. The
// wording was composed inside the n8n Cloud workflow's Send OTP node:
// `postOtpToRelay` posted only `{ phone, code }`, so the sentence existed in the
// one place with no tests, no brand guard, no code review and no git history.
// brand.ts says of itself that "every surface reads it from this constant" —
// n8n was a surface that structurally could not.
//
// TWO HOLES, BOTH REAL
//
// 1. brandBoundary.test.ts walks `src` only, with a `/\.(ts|tsx)$/` filter. So
//    it never saw `functions/` (100% .js) or `public/`. Widening the directory
//    alone would have changed nothing: the extension filter returns an empty
//    list for functions/, and every assertion would pass having read nothing.
// 2. The retired brand was never on any forbidden list to begin with. It was
//    assumed gone. It was not: `public/placeholder-media.svg` printed "MAZAD JO"
//    as visible text in the placeholder every missing image falls back to, and
//    `public/sw.js` named its cache 'mazad-jo-cache-v1'.
//
// Scope is deliberately src + functions + public: product code and shipped
// assets. `docs/` is excluded — it is a historical record, and the dead DOMAIN
// `mazad-jo.com` legitimately appears there in DNS and deploy notes.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { BRAND_AR, BRAND_EN } from './brand';
import { ROOT, PRODUCT_EXTS, sourceFiles, stripComments, assertNonEmpty } from './sourceFiles';

/**
 * Spellings of the retired brand, matched case-insensitively.
 *
 * Every entry carries a space, a hyphen, or Arabic script. That is load-bearing:
 * `mazadjoapp` (the immutable Firebase project id) and `mazadjo.app.n8n.cloud`
 * (the n8n host) are infrastructure that brand.ts and operatorIdentity.test.ts
 * both pin as un-renameable, and a looser pattern would flag them forever.
 */
const RETIRED_BRAND = ['MAZAD JO', 'mazad-jo', 'مزاد جو', 'مزادجو'];

/** Product code and shipped assets — everywhere a customer can reach. */
const TARGETS = ['src', 'functions', 'public'];

describe('the retired brand is gone from everything a customer can reach', () => {
  const files = TARGETS.flatMap((t) => sourceFiles(join(ROOT, t), PRODUCT_EXTS));

  it('sweeps a non-empty set of files in every target', () => {
    // The trap this whole file is about: a sweep that matched nothing passes
    // every assertion without reading a byte. Assert per-target, because one
    // empty target hides inside a big total.
    for (const t of TARGETS) {
      const inTarget = sourceFiles(join(ROOT, t), PRODUCT_EXTS);
      assertNonEmpty(inTarget, t);
      expect(inTarget.length).toBeGreaterThan(0);
    }
    // functions/ is 100% .js — the case that used to come back empty.
    const fns = sourceFiles(join(ROOT, 'functions'), PRODUCT_EXTS);
    expect(fns.some((f) => f.endsWith('.js'))).toBe(true);
  });

  it('names the retired brand nowhere', () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (file.includes('.test.')) continue; // this file lists the strings on purpose
      const src = stripComments(readFileSync(file, 'utf8'), file).toLowerCase();
      for (const dead of RETIRED_BRAND) {
        if (src.includes(dead.toLowerCase())) {
          offenders.push(`${file.replace(/\\/g, '/')} → ${dead}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('still allows the infrastructure names that cannot be renamed', () => {
    // Guard the guard. If a future tightening starts matching these, the suite
    // goes permanently red on strings that are immutable by definition.
    const safe = ['mazadjoapp', 'mazadjoapp.web.app', 'mazadjo.app.n8n.cloud'];
    for (const s of safe) {
      const hit = RETIRED_BRAND.some((d) => s.toLowerCase().includes(d.toLowerCase()));
      expect(hit, `${s} must not be treated as the retired brand`).toBe(false);
    }
  });
});

// functions/ cannot import src/constants/brand.ts: CommonJS on one side,
// TypeScript ESM on the other, and no build step across the boundary. The
// repo's answer is to repeat the value and pin it with a test that reads the
// other file as text — the pattern supportPhone.parity.test.ts already uses.
// Without that pin, the OTP message would be free to drift straight back.
describe('the brand functions/ prints is the brand src/ defines', () => {
  const otpCopy = readFileSync(join(ROOT, 'functions', 'otpCopy.js'), 'utf8');

  it('pins otpCopy.js to brand.ts', () => {
    expect(otpCopy).toContain(`const BRAND_AR = '${BRAND_AR}';`);
    expect(otpCopy).toContain(`const BRAND_EN = '${BRAND_EN}';`);
  });

  it('renders the OTP message from those constants, not from a literal', () => {
    // Interpolated, so the pin above actually reaches the customer's message.
    expect(otpCopy).toMatch(/رمز تحقق \$\{BRAND_AR\}/);
    expect(otpCopy).toMatch(/\$\{BRAND_EN\} verification code/);
  });
});
