import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The boot splash exists twice on purpose — an inline critical copy in
 * index.html that paints before any stylesheet, and the canonical rules in
 * src/index.css that the React <BootSplash /> uses once the bundle is up.
 *
 * Duplication that nothing checks is duplication that drifts, and the failure
 * mode here is nasty and invisible in dev: the two halves of one continuous
 * screen stop matching, so a cold load flashes one design then the other. These
 * tests hold the two copies to the same values and hold both to the spec.
 */

const ROOT = path.resolve(__dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'src/index.css'), 'utf8');
const SPLASH = fs.readFileSync(path.join(ROOT, 'src/components/FeedbackStates.tsx'), 'utf8');
const MAIN = fs.readFileSync(path.join(ROOT, 'src/main.tsx'), 'utf8');

/** Both sources, so a value is only "present" if it is present in both. */
const BOTH = [HTML, CSS];

/**
 * The full body of an at-rule, found by COUNTING BRACES rather than by regex.
 *
 * A lazy `[\s\S]*?` up to the next `}` stops at the first NESTED rule's closing
 * brace, so it captures only the first declaration block inside the at-rule.
 * That is not a nitpick: it let a mutation adding `display: none` to a later
 * rule inside the reduced-motion block pass every assertion, because the
 * offending line was never in the string being asserted on.
 *
 * `startingWith` disambiguates when a file has several blocks for the same
 * at-rule — index.css has one reduced-motion block for `.feed-card-in` and
 * another for the splash, and taking the first matched the wrong one.
 */
function atRuleBody(src: string, atRule: string, mustContain: string): string {
  let from = 0;
  for (;;) {
    const start = src.indexOf(atRule, from);
    if (start === -1) return '';
    const open = src.indexOf('{', start);
    if (open === -1) return '';
    let depth = 0;
    let i = open;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    const body = src.slice(start, i + 1);
    if (body.includes(mustContain)) return body;
    from = i + 1;
  }
}

describe('boot splash — the spec', () => {
  it('uses the icon-only mark, not the wordmark and not a letter', () => {
    for (const src of [HTML, SPLASH]) {
      expect(src).toContain('/icon-512.png');
    }
    // The full lockup carries the word MAZZADO; the splash must not reach for it.
    // Scoped to the splash markup, because index.html names logo-mazzado.png
    // elsewhere for an unrelated reason (the og-image was generated from it).
    const overlay = HTML.slice(HTML.indexOf('id="boot-overlay"'), HTML.indexOf('</body>'));
    expect(overlay).not.toContain('logo-mazzado');
    const bootSplashFn = SPLASH.slice(
      SPLASH.indexOf('export const BootSplash'),
      SPLASH.indexOf('export const ViewSkeleton'),
    );
    expect(bootSplashFn).not.toBe('');
    expect(bootSplashFn).not.toContain('logo-mazzado');
    // The old design: an "M" glyph in a rounded orange box.
    expect(SPLASH).not.toMatch(/rounded-xl bg-\[#FF6B00\]/);
    expect(SPLASH).not.toMatch(/>\s*M\s*</);
  });

  it('never rotates or bounces the mark', () => {
    // `animate-spin` is what shipped, and it is the one thing the brief rules out.
    expect(SPLASH).not.toContain('animate-spin');
    for (const src of BOTH) {
      expect(src).not.toMatch(/@keyframes boot-[a-z]+[\s\S]*?rotate\(/);
      expect(src).not.toMatch(/@keyframes boot-[a-z]+[\s\S]*?translateY\(/);
    }
  });

  it('breathes 0.96 → 1.04 over 1.4s, ease-in-out, forever', () => {
    for (const src of BOTH) {
      expect(src).toMatch(/@keyframes boot-breathe\s*\{[^}]*scale\(0\.96\)[^}]*\}/);
      expect(src).toMatch(/@keyframes boot-breathe[\s\S]{0,160}scale\(1\.04\)/);
      expect(src).toMatch(/animation: boot-breathe 1\.4s ease-in-out infinite/);
    }
  });

  it('keeps the background at #0D0D0F', () => {
    for (const src of BOTH) {
      expect(src).toMatch(/\.boot-splash\s*\{[\s\S]*?background-color: #0D0D0F/);
    }
    // And the body behind it, or frame zero is a white flash.
    expect(HTML).toMatch(/html, body \{[\s\S]*?background-color: #0D0D0F/);
  });

  it('sizes the mark 64px on mobile and 72px on desktop', () => {
    for (const src of BOTH) {
      expect(src).toMatch(/\.boot-splash__mark\s*\{[\s\S]*?width: 64px/);
      expect(src).toMatch(/min-width: 768px\)\s*\{\s*\.boot-splash__mark\s*\{[^}]*72px/);
    }
  });

  it('glows with #FC6903 from a separate layer, never baked into the artwork', () => {
    for (const src of BOTH) {
      // 252,105,3 is #FC6903. rgba, because the glow needs alpha falloff.
      expect(src).toMatch(/\.boot-splash__mark::before[\s\S]*?rgba\(252, 105, 3/);
      expect(src).toMatch(/\.boot-splash__mark::before[\s\S]*?filter: blur\(/);
      expect(src).toMatch(/animation: boot-glow 1\.4s ease-in-out infinite/);
    }
    // A shadow on the <img> would be a glow welded to the mark.
    expect(SPLASH).not.toMatch(/shadow-\[/);
  });

  it('pulses the glow in sync with the mark and never to full black or full on', () => {
    for (const src of BOTH) {
      const kf = src.match(/@keyframes boot-glow\s*\{[\s\S]*?\n\s*\}/)?.[0] ?? '';
      expect(kf, 'boot-glow keyframes').not.toBe('');
      // Same peak position as boot-breathe, so they swell together.
      expect(kf).toMatch(/50%/);
      const opacities = [...kf.matchAll(/opacity: ([\d.]+)/g)].map((m) => Number(m[1]));
      expect(opacities.length).toBeGreaterThanOrEqual(2);
      // Narrow, high floor — a 0→1 pulse strobes.
      expect(Math.min(...opacities)).toBeGreaterThan(0.2);
      expect(Math.max(...opacities)).toBeLessThan(1);
    }
  });

  it('keeps the Arabic label, in its own element, in a subtle off-white', () => {
    expect(HTML).toContain('جارٍ فتح مزاد…');
    expect(SPLASH).toContain('جارٍ فتح مزاد…');
    for (const src of BOTH) {
      expect(src).toMatch(/\.boot-splash__label[\s\S]*?color: rgba\(237, 237, 240/);
    }
    // Spacing is on the flex container, not on ad-hoc margins.
    for (const src of BOTH) {
      expect(src).toMatch(/\.boot-splash\s*\{[\s\S]*?gap: 1\.5rem/);
    }
  });

  it('preloads the mark so no frame is ever blank or stale', () => {
    expect(HTML).toMatch(/rel="preload"[^>]*as="image"[^>]*\/icon-512\.png/);
    expect(HTML).toMatch(/fetchpriority="high"/);
  });

  it('respects prefers-reduced-motion by stilling the pulse, not hiding the mark', () => {
    for (const src of BOTH) {
      const block = atRuleBody(src, '@media (prefers-reduced-motion: reduce)', 'boot-splash');
      expect(block, 'no reduced-motion block mentions boot-splash').not.toBe('');
      expect(block).toContain('animation: none');
      // The mark must SURVIVE — stilled, not removed.
      expect(block).not.toMatch(/display:\s*none/);
      expect(block).not.toMatch(/visibility:\s*hidden/);
      expect(block).not.toMatch(/\.boot-splash__mark img\s*\{[^}]*opacity:\s*0(?![.\d])/);
      // And it must still be the pulse that is disabled, not the whole element.
      expect(block).toMatch(/\.boot-splash__mark img/);
    }
  });

  it('fades out in 180–250ms, on opacity alone', () => {
    for (const src of BOTH) {
      const ms = Number(src.match(/\.boot-splash\s*\{[\s\S]*?transition: opacity (\d+)ms/)?.[1]);
      expect(ms).toBeGreaterThanOrEqual(180);
      expect(ms).toBeLessThanOrEqual(250);
      expect(src).toMatch(/\.boot-splash--out\s*\{[\s\S]*?opacity: 0/);
    }
  });

  it('adds no animation dependency', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const banned of ['lottie-web', 'lottie-react', 'gsap', 'animejs', 'react-spring', '@react-spring/web']) {
      expect(deps[banned], banned).toBeUndefined();
    }
    // The splash itself must be CSS — no JS animation library imported into it.
    expect(SPLASH).not.toMatch(/from 'framer-motion'|from "motion/);
  });
});

describe('boot splash — the fade is real, not a cut', () => {
  it('lives outside #root, or createRoot would replace it between frames', () => {
    expect(HTML).toMatch(/<div id="root"><\/div>/);
    // The overlay must appear AFTER #root closes, as a sibling.
    const rootIdx = HTML.indexOf('<div id="root"></div>');
    const overlayIdx = HTML.indexOf('id="boot-overlay"');
    expect(rootIdx).toBeGreaterThan(-1);
    expect(overlayIdx).toBeGreaterThan(rootIdx);
  });

  it('dismisses on the frame after paint, with no artificial delay', () => {
    expect(MAIN).toContain("getElementById('boot-overlay')");
    expect(MAIN).toContain('boot-splash--out');
    // Double rAF = after paint. A setTimeout gate would be a fake minimum wait.
    expect(MAIN).toMatch(/requestAnimationFrame\(\(\) => \{\s*requestAnimationFrame\(/);
    // The only timeout allowed is the removal backstop, and it must outlast the
    // transition rather than drive it.
    const timeouts = [...MAIN.matchAll(/setTimeout\([^,]+,\s*(\d+)\)/g)].map((m) => Number(m[1]));
    for (const t of timeouts) expect(t).toBeGreaterThan(250);
  });

  it('still dismisses in a tab that never gets a frame', () => {
    // rAF does not fire in a page that is not being painted. A link opened in a
    // background tab loads, mounts, and gets zero frames — measured: 0 rAF
    // callbacks in 800ms at visibilityState 'hidden'. An rAF-only dismissal
    // leaves the splash pinned over a fully loaded app.
    expect(MAIN).toContain('visibilitychange');
    expect(MAIN).toMatch(/visibilityState === 'visible'/);
    // Two independent arming paths, so neither is the single point of failure.
    expect(MAIN).toMatch(/requestAnimationFrame\(dismiss\)/);
    expect(MAIN).toMatch(/setTimeout\(dismiss,\s*\d+\)/);
  });

  it('dismisses exactly once, however many paths fire', () => {
    // Three arming paths into one dismissal: without a guard the class is added
    // repeatedly and remove() races itself.
    expect(MAIN).toMatch(/let done = false/);
    expect(MAIN).toMatch(/if \(done\) return;\s*\n\s*done = true;/);
  });

  it('removes the node so it cannot swallow clicks', () => {
    expect(MAIN).toMatch(/overlay\.remove\(\)/);
    expect(MAIN).toContain("addEventListener('transitionend'");
    expect(CSS).toMatch(/\.boot-splash--out\s*\{[\s\S]*?pointer-events: none/);
  });

  it('announces the wait to a screen reader', () => {
    for (const src of [HTML, SPLASH]) {
      expect(src).toMatch(/role="status"/);
      expect(src).toMatch(/aria-busy/);
      // Decorative image — the label already says what is happening.
      expect(src).toMatch(/alt=""/);
    }
    expect(MAIN).toContain("aria-busy', 'false'");
  });
});

describe('boot splash — the two copies do not drift', () => {
  it('declares the same keyframes in both', () => {
    for (const name of ['boot-breathe', 'boot-glow']) {
      const norm = (src: string) =>
        (src.match(new RegExp(`@keyframes ${name}\\s*\\{[\\s\\S]*?\\n\\s*\\}`))?.[0] ?? '')
          .replace(/\s+/g, ' ')
          .trim();
      const a = norm(HTML);
      const b = norm(CSS);
      expect(a, `${name} missing from index.html`).not.toBe('');
      expect(b, `${name} missing from index.css`).not.toBe('');
      expect(a, `${name} drifted between index.html and index.css`).toBe(b);
    }
  });

  it('agrees on every colour the splash paints', () => {
    for (const colour of ['#0D0D0F', 'rgba(252, 105, 3, 0.50)', 'rgba(237, 237, 240, 0.78)']) {
      expect(HTML, `${colour} in index.html`).toContain(colour);
      expect(CSS, `${colour} in index.css`).toContain(colour);
    }
  });

  it('points both at the same class names the components use', () => {
    for (const cls of ['boot-splash', 'boot-splash__mark', 'boot-splash__label']) {
      expect(HTML).toContain(cls);
      expect(CSS).toContain(cls);
      expect(SPLASH).toContain(cls);
    }
  });
});
