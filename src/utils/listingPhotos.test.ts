import { describe, it, expect } from 'vitest';
import {
  splitPhotos, promoteToCover, removePhoto, remainingSlots, MAX_LISTING_PHOTOS,
  type ListingPhoto,
} from './listingPhotos';

/* ======================================================================
   The wizard asked a seller for a video, a cover, and "extra gallery
   photos" — three boxes, two of them the same medium wearing different
   names, split only because the backend stores them in two fields.

   These pin the split now that it happens here instead of in the
   seller's head.
   ====================================================================== */

const p = (n: string): ListingPhoto => ({ file: { name: n } as unknown as File, url: `blob:${n}` });
const names = (list: ListingPhoto[]) => list.map((x) => (x.file as unknown as { name: string }).name);

describe('splitPhotos', () => {
  it('makes the FIRST photo the cover and the rest the gallery', () => {
    const { cover, gallery } = splitPhotos([p('a'), p('b'), p('c')]);
    expect((cover!.file as unknown as { name: string }).name).toBe('a');
    expect(names(gallery)).toEqual(['b', 'c']);
  });

  it('a single photo is the cover, with an empty gallery', () => {
    const { cover, gallery } = splitPhotos([p('only')]);
    expect(cover).not.toBeNull();
    expect(gallery).toEqual([]);
  });

  it('no photos means no cover — never a fabricated one', () => {
    for (const empty of [[], null, undefined]) {
      const { cover, gallery } = splitPhotos(empty as never);
      expect(cover).toBeNull();
      expect(gallery).toEqual([]);
    }
  });
});

describe('promoteToCover', () => {
  it('moves the chosen photo to the front', () => {
    expect(names(promoteToCover([p('a'), p('b'), p('c')], 2))).toEqual(['c', 'a', 'b']);
  });

  it('keeps the order of everything else', () => {
    // A seller promoting the third of four must not have the other three
    // shuffled underneath them.
    expect(names(promoteToCover([p('a'), p('b'), p('c'), p('d')], 2))).toEqual(['c', 'a', 'b', 'd']);
  });

  it('does nothing for the photo that is already the cover', () => {
    expect(names(promoteToCover([p('a'), p('b')], 0))).toEqual(['a', 'b']);
  });

  it('ignores an out-of-range or junk index instead of creating a hole', () => {
    const list = [p('a'), p('b')];
    for (const bad of [-1, 5, 1.5, NaN]) {
      expect(names(promoteToCover(list, bad as number))).toEqual(['a', 'b']);
    }
  });

  it('never mutates the array it was given', () => {
    // React state depends on this: mutating in place means the re-render is
    // skipped and the seller sees their tap do nothing.
    const original = [p('a'), p('b'), p('c')];
    const copy = [...original];
    promoteToCover(original, 2);
    expect(original).toEqual(copy);
  });
});

describe('removePhoto', () => {
  it('removes the one asked for and keeps the order', () => {
    expect(names(removePhoto([p('a'), p('b'), p('c')], 1))).toEqual(['a', 'c']);
  });

  it('promotes the next photo when the COVER is removed', () => {
    // Deleting the cover must leave a cover behind, not an empty slot.
    const after = removePhoto([p('a'), p('b'), p('c')], 0);
    expect(names(after)).toEqual(['b', 'c']);
    expect((splitPhotos(after).cover!.file as unknown as { name: string }).name).toBe('b');
  });

  it('removing the last photo leaves no cover at all', () => {
    expect(splitPhotos(removePhoto([p('a')], 0)).cover).toBeNull();
  });

  it('ignores an out-of-range index', () => {
    expect(names(removePhoto([p('a')], 7))).toEqual(['a']);
  });
});

describe('remainingSlots', () => {
  it('counts down from the cap', () => {
    expect(remainingSlots([])).toBe(MAX_LISTING_PHOTOS);
    expect(remainingSlots([p('a')])).toBe(MAX_LISTING_PHOTOS - 1);
  });

  it('never goes negative', () => {
    const over = Array.from({ length: MAX_LISTING_PHOTOS + 3 }, (_, i) => p(String(i)));
    expect(remainingSlots(over)).toBe(0);
  });

  it('survives a missing list', () => {
    expect(remainingSlots(null)).toBe(MAX_LISTING_PHOTOS);
  });

  it('the cap preserves what the old two-box UI allowed', () => {
    // 1 cover + 3 gallery. Nobody loses capacity in the simplification.
    expect(MAX_LISTING_PHOTOS).toBe(4);
    expect(splitPhotos(Array.from({ length: MAX_LISTING_PHOTOS }, (_, i) => p(String(i)))).gallery)
      .toHaveLength(3);
  });
});
