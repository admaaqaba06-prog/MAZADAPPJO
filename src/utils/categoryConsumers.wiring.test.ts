// The taxonomy lived in five places and they disagreed (see categories.ts).
// These are source-text assertions because vitest here is environment: 'node'
// with no jsdom — components cannot be rendered. House idiom, per
// descriptionSurfaces.wiring.test.ts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('category consumers', () => {
  it('has no callers of channelToCategory left, and no definition', () => {
    // It mapped 3 drop channels onto 3 categories and sent everything else to
    // 'Fashion' — the funnel that put a TV in the catch-all bucket.
    //
    // Matched on a call `channelToCategory(` and on the definition, NOT on the
    // bare identifier: dropChannel.ts documents the removal by name, and a
    // comment explaining why something is gone must not read as its presence.
    for (const f of [
      'utils/dropPayload.ts',
      'components/SellView.tsx',
      'utils/dropChannel.ts',
    ]) {
      expect(read(f), `${f} calls it`).not.toMatch(/channelToCategory\s*\(/);
      expect(read(f), `${f} defines it`).not.toMatch(/function channelToCategory/);
    }
  });

  it('keeps DropChannel itself, which still routes WhatsApp drops', () => {
    const src = read('utils/dropChannel.ts');
    expect(src).toMatch(/export type DropChannel/);
    expect(src).toMatch(/export const DROP_CHANNELS/);
    expect(src).toMatch(/export function channelLabel/);
  });

  it('builds the seller picker from CATEGORIES, not a local array', () => {
    const src = read('components/ListingWizardView.tsx');
    expect(src).toMatch(/from '\.\.\/utils\/categories'/);
    expect(src).not.toMatch(/value: 'Luxury'/);
  });

  it('builds the Discover chips from CATEGORIES', () => {
    const src = read('components/DiscoveryFeedView.tsx');
    expect(src).toMatch(/from '\.\.\/utils\/categories'/);
    // The old literal chip array carried its match lists inline.
    expect(src).not.toMatch(/match: \['Cars', 'Vehicles'\]/);
  });

  it('makes the concierge form carry a real category', () => {
    const src = read('components/SellView.tsx');
    expect(src).toMatch(/category: cCategory/);
  });

  it('makes the drop payload carry the picked category', () => {
    const src = read('utils/dropPayload.ts');
    expect(src).toMatch(/category: input\.category/);
  });

  it('gives the admin drop builder its own category picker', () => {
    const src = read('components/AuctionDropBuilderView.tsx');
    expect(src).toMatch(/from '\.\.\/utils\/categories'/);
    expect(src).toMatch(/setField\('category'/);
  });

  it('derives the Algolia facet map from the taxonomy too', () => {
    // A sixth consumer, and the one the plan missed: it was a hand-copied
    // duplicate of the chip match lists carrying a "keep this in sync" comment,
    // and it had already drifted — no entry for the catch-all chip, so
    // searching inside it applied no category facet at all.
    const src = read('services/search/searchMap.ts');
    expect(src).toMatch(/from '\.\.\/\.\.\/utils\/categories'/);
    expect(src).not.toMatch(/Cars: \['Cars', 'Vehicles'\]/);
  });
});
