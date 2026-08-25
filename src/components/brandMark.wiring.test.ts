import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The brand mark used to be five hand-rolled copies of an orange rounded square
 * with a monospace "M" in it — desktop header, login header, mobile discover
 * header, install prompt, landing fallback. They had drifted to four sizes,
 * three oranges (#E85D04, #FF6B00, a gradient) and two corner radii, and none of
 * them was the actual logo.
 *
 * These tests hold the replacement to the brief: the SUPPLIED FILE, used as-is.
 */

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const MARK = read('src/components/BrandMark.tsx');

/**
 * BrandMark.tsx with comments stripped.
 *
 * The styling assertions below have to run against CODE, not prose. Asserting
 * on the raw file failed on the word "rounded" inside a doc comment explaining
 * that the OLD placeholder was a rounded square — the test was reading the
 * explanation of the bug as the bug.
 */
const MARK_CODE = MARK.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** Every surface that shows the mark beside the brand name. */
const CALL_SITES = [
  'src/components/DesktopFrame.tsx',
  'src/components/LoginView.tsx',
  'src/components/DiscoveryFeedView.tsx',
  'src/components/InstallPrompt.tsx',
];

describe('brand mark — the approved asset, untouched', () => {
  it('ships the asset it points at', () => {
    expect(fs.existsSync(path.join(ROOT, 'public/icon-512.png'))).toBe(true);
    expect(MARK).toContain("'/icon-512.png'");
  });

  it('renders the file with nothing done to it', () => {
    // No recolour, no crop, no filter, no baked glow, and no plate behind it —
    // the brief is explicit that the artwork is used as supplied.
    expect(MARK_CODE).not.toMatch(/filter:/);
    expect(MARK_CODE).not.toMatch(/\bbg-\[#/);
    expect(MARK_CODE).not.toMatch(/\bbg-(orange|amber|accent)/);
    expect(MARK_CODE).not.toMatch(/shadow-/);
    expect(MARK_CODE).not.toMatch(/rounded/);
    expect(MARK_CODE).not.toMatch(/object-cover/); // would crop
  });

  it('cannot be stretched out of proportion', () => {
    expect(MARK).toContain('object-contain');
  });

  it('is decorative, because the brand name sits next to it', () => {
    expect(MARK).toMatch(/alt=\{label \?\? ''\}/);
    expect(MARK).toMatch(/aria-hidden=\{label \? undefined : true\}/);
  });
});

describe('brand mark — every surface uses it', () => {
  it.each(CALL_SITES)('%s renders <BrandMark /> and imports it', (file) => {
    const src = read(file);
    expect(src).toMatch(/<BrandMark\b/);
    expect(src).toMatch(/import \{ BrandMark \} from '\.\/BrandMark'/);
  });

  it.each(CALL_SITES)('%s no longer draws an "M" in a box', (file) => {
    const src = read(file);
    // The exact shape of the old placeholder: a bare M on its own line.
    expect(src).not.toMatch(/^\s*M\s*$/m);
  });

  it.each(CALL_SITES)('%s keeps the mark square', (file) => {
    const src = read(file);
    for (const m of src.matchAll(/<BrandMark className="([^"]*)"/g)) {
      const cls = m[1];
      const w = cls.match(/(?:^|\s)w-(\d+)/)?.[1];
      const h = cls.match(/(?:^|\s)h-(\d+)/)?.[1];
      expect(w, `width missing in "${cls}"`).toBeDefined();
      expect(h, `height missing in "${cls}"`).toBeDefined();
      // A non-square box would letterbox the mark inside its own footprint.
      expect(h, `not square in "${cls}"`).toBe(w);
    }
  });

  it('stays vertically centred against the brand name', () => {
    // The mark is a flex child next to a text node; `items-center` on its OWN
    // parent is what aligns them. Without it the taller text pushes the mark
    // off-centre and the lockup looks broken.
    //
    // This assertion started out scanning back a fixed 400 characters, which
    // passed even with items-center deleted — it was finding an unrelated
    // items-center on an enclosing row. Mutation testing caught it. Scoped now
    // to the immediately preceding <div, which is the mark's real parent at
    // every call site (the mark is that div's first child).
    for (const file of ['src/components/DesktopFrame.tsx', 'src/components/LoginView.tsx']) {
      const src = read(file);
      const at = src.indexOf('<BrandMark');
      expect(at, `${file}: no <BrandMark`).toBeGreaterThan(-1);
      const parentStart = src.lastIndexOf('<div', at);
      expect(parentStart, `${file}: mark has no parent div`).toBeGreaterThan(-1);
      const parentTag = src.slice(parentStart, at);
      // Nothing but the parent's own opening tag may sit in this window, or the
      // assertion is measuring the wrong element again.
      expect(parentTag, `${file}: mark is not its parent's first child`)
        .not.toMatch(/<(?!div\b)[a-zA-Z]/);
      expect(parentTag, `${file}: no items-center on the mark's parent`)
        .toMatch(/items-center/);
    }
  });
});

describe('brand mark — the two remaining "M"s are deliberate', () => {
  it('keeps the landing lockup text fallback', () => {
    // Logo.tsx draws an M only when /logo-mazzado*.png 404s. It cannot use an
    // image, because an unavailable image is the thing it exists to survive.
    const logo = read('src/landing/components/Logo.tsx');
    expect(logo).toMatch(/onError/);
    expect(logo).toMatch(/^\s*M\s*$/m);
  });

  it('documents that the maintenance screen still has one', () => {
    // src/App.tsx's maintenance splash is a different composition (gradient
    // plate plus a status ping) on a surface this change did not touch. Asserted
    // so it is a known, findable leftover rather than a silent inconsistency.
    const app = read('src/App.tsx');
    expect(app).toMatch(/^\s*M\s*$/m);
  });
});
