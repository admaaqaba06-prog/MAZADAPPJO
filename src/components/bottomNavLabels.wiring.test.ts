// The bottom tab bar overlapped "Membership" into "Profile" on every
// iPhone-width screen, and the Seller Center metric cards clipped their titles
// to "ACTIVE LISTIN…", "THIS-MONTH …", "PENDING ORD…".
//
// The bar was NOT missing the usual suspects — it already had `flex-1
// min-w-0` on every tab, an absolutely-centred FAB over a reserved 78px gap,
// a capped 11px label and `env(safe-area-inset-bottom)` on the wrapper. What
// it had instead was an ARITHMETIC problem: five labelled tabs split 2/3
// around that centre gap, so the trailing three got ~62px each at 375px while
// "Membership" needs ~78px. No amount of flex tuning fixes a label that is
// wider than its slot — either the label clips or it bleeds. It bled, because
// nothing told it to clip.
//
// So: drop the tab (Profile already owns that destination, in more detail
// than a tab label could carry), and give every surviving label a hard clip
// boundary so a future long label degrades to an ellipsis instead of an
// overlap. Both halves are asserted here — the clip rule is what keeps the
// bug fixed when someone adds a sixth destination.
//
// Source-text assertions: vitest here is environment: 'node' with no jsdom.
// House idiom, per signInIntent.wiring.test.ts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

/** Comments stripped before any scan. The nav carries a comment explaining why
 *  Membership is no longer a tab, and that sentence contains the literal word —
 *  so an unstripped scan reads the explanation as the thing it warns against.
 *  Same trap documented in signInIntent.wiring.test.ts. */
const code = (src: string) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** The mobile nav only — the desktop shell below it reuses some of the same
 *  idioms and must not be counted as a tab bar. */
function mobileNav(raw: string): string {
  const src = code(raw);
  const start = src.indexOf('id="mobile-nav-bar"');
  const end = src.indexOf('</nav>', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe('bottom nav labels', () => {
  it('no longer carries a Membership tab', () => {
    const nav = mobileNav(read('components/DesktopFrame.tsx'));
    // The id is the tell. Asserting on the route would be wrong: 'wallet' is
    // still reachable — from Profile, and from the desktop pill — and should
    // stay that way. It is the TAB that is gone, not the destination.
    expect(nav).not.toMatch(/mobile-subscription-tab-btn/);
    expect(nav).not.toMatch(/Membership/);
    expect(nav).not.toMatch(/اشتراكي/);
  });

  it('keeps the tab bar to four labelled destinations at most', () => {
    const nav = mobileNav(read('components/DesktopFrame.tsx'));
    const targets = [...nav.matchAll(/data-cta-target="([a-z-]+)"/g)].map((m) => m[1]);
    // 'upload' is the centre FAB, not a labelled tab.
    const tabs = targets.filter((t) => t !== 'upload');
    // Two are role-gated: 'seller-center' (sellers) and 'admin' (staff only).
    // The widest real-world bar is a seller's: Discover · Orders · Profile ·
    // Seller = four, which is the count the 2/2 split around the FAB is sized
    // for. A fifth ungated tab reintroduces the collision.
    expect(tabs).toEqual(['discovery', 'orders', 'profile', 'seller-center', 'admin']);
    expect(tabs).not.toContain('wallet');
    const alwaysVisible = tabs.filter((t) => t !== 'seller-center' && t !== 'admin');
    expect(alwaysVisible.length).toBeLessThanOrEqual(3);
  });

  it('gives every nav label a clip boundary rather than letting it bleed', () => {
    const nav = mobileNav(read('components/DesktopFrame.tsx'));
    // Every 11px label span — that size is only used for tab labels in here.
    const labels = (nav.match(/text-\[11px\]/g) ?? []).length;
    const clipped = (nav.match(/w-full truncate px-0\.5 text-center text-\[11px\]/g) ?? []).length;
    expect(labels).toBeGreaterThan(0);
    // An unclipped label is the bug. Arabic and English labels differ in
    // width, so a label that fits in one locale can still overflow the other;
    // the clip is what makes that a visual trim instead of a collision.
    expect(clipped).toBe(labels);
  });

  it('still clears the iPhone home indicator', () => {
    // Pre-existing and easy to drop by accident when restyling the wrapper.
    expect(read('components/DesktopFrame.tsx')).toMatch(/env\(safe-area-inset-bottom\)/);
  });

  it('does not orphan membership — Profile still owns the destination', () => {
    // This is the load-bearing half of removing the tab. If Profile ever stops
    // carrying the entry point, the tab removal becomes a regression.
    const profile = read('components/ProfileView.tsx');
    expect(profile).toMatch(/setActiveView\('wallet'\)/);
    expect(profile).toMatch(/باقة العضوية والاشتراك/);
  });
});

describe('seller centre metric cards', () => {
  const src = () => read('components/SellerCenterView.tsx');

  it('uses titles short enough to render in full in a two-column grid', () => {
    // The clipped originals. Shortening beats clamping to two lines: a metric
    // card's title sits above a number, and a second line pushes that number
    // out of optical alignment with the rest of the row.
    for (const s of ['Active listings', 'This-month sales', 'Pending Orders', 'Live bids now']) {
      expect(src()).not.toContain(`'${s}'`);
    }
    for (const s of ['Listings', 'This month', 'Pending', 'Live bids']) {
      expect(src()).toContain(`'${s}'`);
    }
  });

  it('shortens the Arabic titles too, not just the English', () => {
    // The app is Arabic-first; the bug report screenshot was English. A fix
    // applied to one locale is half a fix.
    for (const s of ['الطلبات المعلقة', 'مزايدات مباشرة الآن', 'مبيعات هذا الشهر']) {
      expect(src()).not.toContain(`'${s}'`);
    }
    for (const s of ['طلبات معلقة', 'مزايدات الآن', 'مبيعات الشهر']) {
      expect(src()).toContain(`'${s}'`);
    }
  });

  it('keeps truncate on the card title as a backstop', () => {
    // Shortening fixes today's strings; the clip survives the next metric
    // someone adds.
    expect(src()).toMatch(/uppercase leading-none truncate/);
  });
});
