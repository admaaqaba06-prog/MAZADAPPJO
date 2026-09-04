/**
 * One file walker for the boundary guards, and one comment stripper.
 *
 * WHY THIS EXISTS
 *
 * The guards in this directory each grew their own copy: brandBoundary.test.ts
 * had a `/\.(ts|tsx)$/` walker, operatorIdentity.test.ts a hardened one that
 * also reaches functions/ and n8n/, supportPhone.parity.test.ts a third. Three
 * walkers that disagree about which files exist is the same drift these tests
 * were written to prevent, and it has already cost something concrete: the
 * narrow walker is why the brand guard could not see `functions/` at all.
 *
 * THE VACUOUS-PASS TRAP
 *
 * `functions/` is 100% `.js`. Point the `/\.(ts|tsx)$/` walker at it and you get
 * an EMPTY list, so every assertion passes having read nothing — a green test
 * that proves the opposite of what it claims. Hence `exts` is an explicit
 * argument with no default: a caller must say what it means to scan, and
 * `assertNonEmpty` below makes an empty sweep fail loudly instead of quietly.
 */

import { readdirSync, statSync } from 'fs';
import { join } from 'path';

/** Repo root, resolved from this file rather than from the working directory. */
export const ROOT = join(__dirname, '..', '..');

/** Product code and shipped assets: everything a customer can actually reach. */
export const PRODUCT_EXTS = /\.(ts|tsx|js|jsx|html|svg|json|md)$/;

/** TypeScript app sources only — the historical scope of brandBoundary's scans. */
export const TS_EXTS = /\.(ts|tsx)$/;

/**
 * Every file under `dir` matching `exts`, recursively.
 *
 * Skips node_modules, build output and dotfiles. Does NOT skip `.test.` files —
 * callers that need that filter it themselves, because a guard's own forbidden
 * literals live in its test file and a scan that reads its own rationale as a
 * violation is a mistake this repo has now made three times.
 */
export function sourceFiles(dir: string, exts: RegExp, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === 'coverage' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, exts, out);
    else if (exts.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Strip comments so a guard does not flag a file for DOCUMENTING the thing it
 * forbids — cliq.ts records that the account moved from Arab Bank, and
 * otpCopy.js records the retired brand that shipped in the OTP message. Both are
 * the reason the guard exists, not a violation of it.
 *
 * Per-extension on purpose: `//` stripping is wrong for JSON (it would eat a URL
 * inside a string) and wrong for SVG/HTML (whose comments are `<!-- -->`), and
 * Markdown prose has no comment syntax worth stripping at all.
 */
export function stripComments(src: string, file: string): string {
  const f = file.replace(/\\/g, '/');
  if (/\.(ts|tsx|js|jsx)$/.test(f)) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  }
  if (/\.(svg|html)$/.test(f)) {
    return src.replace(/<!--[\s\S]*?-->/g, '');
  }
  return src; // .json, .md — nothing safe to strip
}

/**
 * A sweep that read nothing is not a passing guard, it is an absent one. Call
 * this on every file list a guard is about to assert over.
 */
export function assertNonEmpty(files: string[], label: string): void {
  if (files.length === 0) {
    throw new Error(
      `${label}: the file sweep matched ZERO files, so every assertion over it `
      + 'would pass without reading anything. Check the directory and the extension set.'
    );
  }
}
