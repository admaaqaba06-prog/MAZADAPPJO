import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/**
 * The light-mode logo bug: the supplied lockup has a WHITE wordmark, so on the
 * light theme's white surface the name disappeared and only the orange M was
 * left. The fix is a second asset with an INK wordmark plus a component that
 * picks per theme.
 *
 * These tests guard both halves — the wiring AND the pixels. The pixel tests
 * matter more than they look: the wiring can be perfect while a re-exported
 * asset silently reintroduces a white wordmark, which is exactly the bug.
 */

const ROOT = path.resolve(__dirname, '../..');
const LOGO = fs.readFileSync(path.join(ROOT, 'src/landing/components/Logo.tsx'), 'utf8');

/**
 * Minimal 8-bit PNG → RGBA decode. Hand-rolled because the repo has no image
 * library and pulling one in for a test would be a heavier dependency than the
 * forty lines it replaces. Handles the five PNG filter types; that is all an
 * exported logo uses.
 */
function decodePng(buf: Buffer): { w: number; h: number; rgba: Buffer } {
  let p = 8;
  let w = 0;
  let h = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.subarray(p + 4, p + 8).toString('latin1');
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      if (data[8] !== 8) throw new Error(`bit depth ${data[8]} unsupported`);
      colorType = data[9];
      if (colorType !== 6 && colorType !== 2) throw new Error(`colour type ${colorType} unsupported`);
    } else if (type === 'IDAT') idat.push(Buffer.from(data));
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const ch = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const rgba = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride));
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? line[i - ch] : 0;
      const b = prev[i];
      const c = i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = v & 0xff;
    }
    for (let x = 0; x < w; x++) {
      rgba[(y * w + x) * 4] = line[x * ch];
      rgba[(y * w + x) * 4 + 1] = line[x * ch + 1];
      rgba[(y * w + x) * 4 + 2] = line[x * ch + 2];
      rgba[(y * w + x) * 4 + 3] = ch === 4 ? line[x * ch + 3] : 255;
    }
    prev = line;
  }
  return { w, h, rgba };
}

/** Chroma splits the achromatic wordmark from the saturated orange M. */
function census(file: string) {
  const d = decodePng(fs.readFileSync(path.join(ROOT, 'public', file)));
  let white = 0;
  let ink = 0;
  let orange = 0;
  for (let i = 0; i < d.rgba.length; i += 4) {
    if (d.rgba[i + 3] < 16) continue;
    const [r, g, b] = [d.rgba[i], d.rgba[i + 1], d.rgba[i + 2]];
    if (Math.max(r, g, b) - Math.min(r, g, b) > 34) orange++;
    else if (r > 235) white++;
    else if (r < 60) ink++;
  }
  return { w: d.w, h: d.h, white, ink, orange };
}

describe('theme-aware MAZZADO lockup', () => {
  it('ships both assets', () => {
    for (const f of ['logo-mazzado.png', 'logo-mazzado-light.png']) {
      expect(fs.existsSync(path.join(ROOT, 'public', f)), f).toBe(true);
    }
  });

  it('maps each theme to its own file', () => {
    expect(LOGO).toMatch(/dark:\s*"\/logo-mazzado\.png"/);
    expect(LOGO).toMatch(/light:\s*"\/logo-mazzado-light\.png"/);
  });

  it('reads the theme from the pre-paint attribute, so the first paint is right', () => {
    expect(LOGO).toContain("getAttribute('data-theme')");
  });

  it('observes only data-theme, so an imperative toggle re-renders it', () => {
    expect(LOGO).toContain('MutationObserver');
    expect(LOGO).toMatch(/attributeFilter:\s*\['data-theme'\]/);
    expect(LOGO).toContain('observer.disconnect()');
  });

  it('tracks WHICH src failed, not just that one did', () => {
    // A bare `imageFailed` boolean would condemn both themes to the text
    // fallback the moment either file 404s.
    expect(LOGO).toContain('failedSrc !== src');
    expect(LOGO).toContain('key={src}');
  });

  it('keeps the text lockup as the 404 fallback', () => {
    expect(LOGO).toContain('onError');
    expect(LOGO).toContain('showText && <span');
  });

  it('gives the light file an ink wordmark and no white one', () => {
    const light = census('logo-mazzado-light.png');
    expect(light.white).toBe(0);
    expect(light.ink).toBeGreaterThan(5000);
  });

  it('leaves the orange M identical in both files', () => {
    // The mark is the brand: it carries on either ground and must not be
    // recoloured. Same geometry, same count.
    const dark = census('logo-mazzado.png');
    const light = census('logo-mazzado-light.png');
    expect(light.orange).toBe(dark.orange);
    expect([light.w, light.h]).toEqual([dark.w, dark.h]);
  });

  it('confirms the dark file is the one with the white wordmark', () => {
    // Guards the pairing itself — swapping the two url values would otherwise
    // pass every assertion above.
    const dark = census('logo-mazzado.png');
    expect(dark.white).toBeGreaterThan(5000);
  });
});
