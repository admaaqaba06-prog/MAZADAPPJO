import { describe, it, expect } from 'vitest';
import {
  MAX_GALLERY_PHOTOS,
  acceptGalleryFiles,
  addGalleryPhotos,
  remainingGallerySlots,
  removeGalleryPhoto,
  isImageFile,
  type PickedPhoto,
} from './mediaPickerState';

const photo = (n: number): PickedPhoto => ({ file: { name: `${n}.jpg` } as any, url: `blob:${n}` });
const img = (n: number) => ({ name: `${n}.jpg`, type: 'image/jpeg' });
const vid = (n: number) => ({ name: `${n}.mp4`, type: 'video/mp4' });

describe('isImageFile', () => {
  it('accepts image mime types', () => {
    expect(isImageFile({ type: 'image/jpeg' })).toBe(true);
    expect(isImageFile({ type: 'image/png' })).toBe(true);
  });
  it('rejects everything else', () => {
    expect(isImageFile({ type: 'video/mp4' })).toBe(false);
    expect(isImageFile({ type: '' })).toBe(false);
  });
  // Must be a prefix match on the full `image/` type, not a substring search
  // and not a bare `image` prefix.
  it('matches the type prefix rather than a substring', () => {
    expect(isImageFile({ type: 'application/image' })).toBe(false);
    expect(isImageFile({ type: 'text/not-an-image/jpeg' })).toBe(false);
    expect(isImageFile({ type: 'imagexml/foo' })).toBe(false);
  });
});

describe('MAX_GALLERY_PHOTOS', () => {
  // The live auction room and the seller wizard both assume this cap.
  it('is three', () => {
    expect(MAX_GALLERY_PHOTOS).toBe(3);
  });
});

describe('addGalleryPhotos', () => {
  it('appends to the end', () => {
    expect(addGalleryPhotos([photo(1)], [photo(2)]).map((p) => p.url)).toEqual(['blob:1', 'blob:2']);
  });

  it('caps the gallery at three', () => {
    const result = addGalleryPhotos([], [photo(1), photo(2), photo(3), photo(4), photo(5)]);
    expect(result).toHaveLength(MAX_GALLERY_PHOTOS);
    expect(result.map((p) => p.url)).toEqual(['blob:1', 'blob:2', 'blob:3']);
  });

  it('drops overflow when the gallery is already partly full', () => {
    const result = addGalleryPhotos([photo(1), photo(2)], [photo(3), photo(4)]);
    expect(result.map((p) => p.url)).toEqual(['blob:1', 'blob:2', 'blob:3']);
  });

  it('is a no-op for an empty incoming list', () => {
    const prev = [photo(1)];
    expect(addGalleryPhotos(prev, [])).toEqual(prev);
  });

  // Value equality alone would pass on a rewritten copy, which would churn
  // React state for a picker that added nothing.
  it('returns the very same array for an empty incoming list', () => {
    const prev = [photo(1)];
    expect(addGalleryPhotos(prev, [])).toBe(prev);
  });

  it('drops everything incoming once the gallery is already full', () => {
    const full = [photo(1), photo(2), photo(3)];
    expect(addGalleryPhotos(full, [photo(4)]).map((p) => p.url))
      .toEqual(['blob:1', 'blob:2', 'blob:3']);
  });

  it('keeps the existing photos ahead of the new ones', () => {
    const result = addGalleryPhotos([photo(9)], [photo(1), photo(2)]);
    expect(result.map((p) => p.url)).toEqual(['blob:9', 'blob:1', 'blob:2']);
  });

  it('does not mutate the previous array', () => {
    const prev = [photo(1)];
    addGalleryPhotos(prev, [photo(2)]);
    expect(prev).toHaveLength(1);
  });
});

describe('removeGalleryPhoto', () => {
  it('removes the photo at the given index', () => {
    expect(removeGalleryPhoto([photo(1), photo(2), photo(3)], 1).map((p) => p.url))
      .toEqual(['blob:1', 'blob:3']);
  });

  it('ignores an out-of-range index', () => {
    const prev = [photo(1)];
    expect(removeGalleryPhoto(prev, 5)).toEqual(prev);
    expect(removeGalleryPhoto(prev, -1)).toEqual(prev);
  });

  // A guardless filter() returns a value-equal *copy*, so identity is the only
  // assertion that proves the out-of-range case truly no-ops.
  it('returns the very same array for an out-of-range index', () => {
    const prev = [photo(1), photo(2)];
    expect(removeGalleryPhoto(prev, 5)).toBe(prev);
    expect(removeGalleryPhoto(prev, -1)).toBe(prev);
    expect(removeGalleryPhoto(prev, prev.length)).toBe(prev);
    expect(removeGalleryPhoto([], 0)).toHaveLength(0);
  });

  // Both bounds comparisons are false for NaN, so without an integer check it
  // would fall through to filter() and rewrite the whole list.
  it('returns the very same array for a NaN or fractional index', () => {
    const prev = [photo(1), photo(2)];
    expect(removeGalleryPhoto(prev, NaN)).toBe(prev);
    expect(removeGalleryPhoto(prev, 1.5)).toBe(prev);
    expect(removeGalleryPhoto(prev, Infinity)).toBe(prev);
  });

  it('removes the first and last photo at the boundary indices', () => {
    const prev = [photo(1), photo(2), photo(3)];
    expect(removeGalleryPhoto(prev, 0).map((p) => p.url)).toEqual(['blob:2', 'blob:3']);
    expect(removeGalleryPhoto(prev, 2).map((p) => p.url)).toEqual(['blob:1', 'blob:2']);
  });

  it('does not mutate the previous array', () => {
    const prev = [photo(1), photo(2)];
    removeGalleryPhoto(prev, 0);
    expect(prev.map((p) => p.url)).toEqual(['blob:1', 'blob:2']);
  });
});

describe('remainingGallerySlots', () => {
  it('counts down from the cap', () => {
    expect(remainingGallerySlots([])).toBe(MAX_GALLERY_PHOTOS);
    expect(remainingGallerySlots([photo(1)])).toBe(MAX_GALLERY_PHOTOS - 1);
    expect(remainingGallerySlots([photo(1), photo(2), photo(3)])).toBe(0);
  });

  // An over-full gallery should not report NEGATIVE room: `slice(0, -1)` drops
  // the last element instead of taking none, so the sign matters downstream.
  it('never goes negative on an over-full gallery', () => {
    expect(remainingGallerySlots([photo(1), photo(2), photo(3), photo(4), photo(5)])).toBe(0);
  });

  it('tracks the cap rather than a hardcoded three', () => {
    expect(remainingGallerySlots([])).toBe(MAX_GALLERY_PHOTOS);
  });
});

describe('acceptGalleryFiles', () => {
  it('keeps only image files', () => {
    expect(acceptGalleryFiles([], [img(1), vid(2), img(3)]).map((f) => f.name))
      .toEqual(['1.jpg', '3.jpg']);
  });

  it('caps a multi-select at the remaining room, in pick order', () => {
    expect(acceptGalleryFiles([], [img(1), img(2), img(3), img(4), img(5)]).map((f) => f.name))
      .toEqual(['1.jpg', '2.jpg', '3.jpg']);
    expect(acceptGalleryFiles([photo(9), photo(8)], [img(1), img(2), img(3)]).map((f) => f.name))
      .toEqual(['1.jpg']);
  });

  it('accepts nothing once the gallery is full', () => {
    expect(acceptGalleryFiles([photo(1), photo(2), photo(3)], [img(4), img(5)])).toEqual([]);
  });

  it('counts room AFTER the non-image files are dropped, not before', () => {
    // Three videos ahead of three photos: slicing before the filter would keep
    // nothing at all.
    expect(acceptGalleryFiles([], [vid(1), vid(2), vid(3), img(4), img(5)]).map((f) => f.name))
      .toEqual(['4.jpg', '5.jpg']);
  });

  it('does not mutate its inputs', () => {
    const prev = [photo(1)];
    const files = [img(2), img(3), img(4), img(5)];
    acceptGalleryFiles(prev, files);
    expect(prev).toHaveLength(1);
    expect(files).toHaveLength(4);
  });
});

/**
 * THE point of acceptGalleryFiles: MediaPicker mints one object URL per file
 * this returns, so every URL minted must survive into the gallery. Mirrors
 * MediaPicker.addFiles exactly — filter/cap, then mint, then add.
 */
describe('no object URL is minted for a file the cap will drop', () => {
  const simulateAddFiles = (prev: PickedPhoto[], files: { name: string; type: string }[]) => {
    const accepted = acceptGalleryFiles(prev, files);
    const minted = accepted.map((f) => `blob:${f.name}`);
    const incoming = accepted.map((file, i) => ({ file: file as any, url: minted[i] }));
    const next = addGalleryPhotos(prev, incoming);
    const kept = next.map((p) => p.url).filter((u) => minted.includes(u));
    return { minted, kept };
  };

  const cases: [string, PickedPhoto[], { name: string; type: string }[]][] = [
    ['empty gallery, overflowing multi-select', [], [img(1), img(2), img(3), img(4), img(5)]],
    ['one existing photo, three picked', [photo(9)], [img(1), img(2), img(3)]],
    ['two existing photos, two picked', [photo(9), photo(8)], [img(1), img(2)]],
    ['full gallery, one picked', [photo(1), photo(2), photo(3)], [img(4)]],
    ['over-full gallery, one picked', [photo(1), photo(2), photo(3), photo(4)], [img(5)]],
    ['mixed images and video overflowing', [], [img(1), vid(2), img(3), img(4), img(5)]],
    ['exact fit', [photo(9)], [img(1), img(2)]],
  ];

  for (const [name, prev, files] of cases) {
    it(name, () => {
      const { minted, kept } = simulateAddFiles(prev, files);
      // Every minted URL is still in the gallery => nothing leaked.
      expect(kept).toEqual(minted);
    });
  }

  it('still admits photos while there is room — the fix must not just refuse everything', () => {
    expect(simulateAddFiles([], [img(1), img(2), img(3), img(4)]).minted).toHaveLength(3);
    expect(simulateAddFiles([photo(9)], [img(1)]).minted).toHaveLength(1);
  });
});
