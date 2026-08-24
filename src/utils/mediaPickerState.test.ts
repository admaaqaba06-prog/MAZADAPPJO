import { describe, it, expect } from 'vitest';
import {
  MAX_GALLERY_PHOTOS,
  acceptGalleryFiles,
  addGalleryPhotos,
  remainingGallerySlots,
  removeGalleryPhoto,
  isImageFile,
  moveGalleryPhoto,
  classifyGalleryIntake,
  imageFilesFromTransfer,
  type PickedPhoto,
  isVideoFile,
  filesFromTransfer,
  checkCoverFile,
  checkVideoFile,
  MAX_COVER_BYTES,
  MAX_VIDEO_BYTES,
} from './mediaPickerState';

/** `n` photos, so cap tests scale with MAX_GALLERY_PHOTOS instead of pinning 3. */
const photos = (n: number, from = 1): PickedPhoto[] =>
  Array.from({ length: n }, (_, i) => photo(from + i));

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
  it('is a positive integer', () => {
    // Asserted as a real number so a typo (0, NaN, negative) fails, but NOT
    // pinned to a specific value — the cap is a product decision that moves.
    // Raised 3 -> 15 on 2026-08-04; every other test derives from it.
    expect(Number.isInteger(MAX_GALLERY_PHOTOS)).toBe(true);
    expect(MAX_GALLERY_PHOTOS).toBeGreaterThan(0);
  });
});

describe('addGalleryPhotos', () => {
  it('appends to the end', () => {
    expect(addGalleryPhotos([photo(1)], [photo(2)]).map((p) => p.url)).toEqual(['blob:1', 'blob:2']);
  });

  it('caps the gallery at MAX_GALLERY_PHOTOS', () => {
    const result = addGalleryPhotos([], photos(MAX_GALLERY_PHOTOS + 2));
    expect(result).toHaveLength(MAX_GALLERY_PHOTOS);
    // Kept in pick order, and the overflow dropped from the end.
    expect(result.map((p) => p.url)).toEqual(photos(MAX_GALLERY_PHOTOS).map((p) => p.url));
  });

  it('drops overflow when the gallery is already partly full', () => {
    const prev = photos(MAX_GALLERY_PHOTOS - 1);
    const result = addGalleryPhotos(prev, photos(3, MAX_GALLERY_PHOTOS));
    expect(result).toHaveLength(MAX_GALLERY_PHOTOS);
    // Exactly one slot was free, so exactly one of the incoming landed.
    expect(result[MAX_GALLERY_PHOTOS - 1].url).toBe(`blob:${MAX_GALLERY_PHOTOS}`);
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
    const full = photos(MAX_GALLERY_PHOTOS);
    expect(addGalleryPhotos(full, [photo(999)]).map((p) => p.url))
      .toEqual(full.map((p) => p.url));
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
    expect(remainingGallerySlots(photos(MAX_GALLERY_PHOTOS))).toBe(0);
  });

  // An over-full gallery should not report NEGATIVE room: `slice(0, -1)` drops
  // the last element instead of taking none, so the sign matters downstream.
  it('never goes negative on an over-full gallery', () => {
    expect(remainingGallerySlots(photos(MAX_GALLERY_PHOTOS + 2))).toBe(0);
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
    const many = Array.from({ length: MAX_GALLERY_PHOTOS + 2 }, (_, i) => img(i + 1));
    expect(acceptGalleryFiles([], many).map((f) => f.name))
      .toEqual(many.slice(0, MAX_GALLERY_PHOTOS).map((f) => f.name));
    // One slot left: exactly the first incoming lands, in pick order.
    expect(acceptGalleryFiles(photos(MAX_GALLERY_PHOTOS - 1), [img(1), img(2), img(3)]).map((f) => f.name))
      .toEqual(['1.jpg']);
  });

  it('accepts nothing once the gallery is full', () => {
    expect(acceptGalleryFiles(photos(MAX_GALLERY_PHOTOS), [img(98), img(99)])).toEqual([]);
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
    expect(simulateAddFiles([], Array.from({ length: MAX_GALLERY_PHOTOS + 1 }, (_, i) => img(i + 1))).minted)
      .toHaveLength(MAX_GALLERY_PHOTOS);
    expect(simulateAddFiles([photo(9)], [img(1)]).minted).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Drag-to-reorder, drop/paste intake, and the cap that must not be silent.
// Reuses the photo(n) helper defined at the top of this file; `names` reads the
// generated file names back out so order assertions are readable.
const names = (list: PickedPhoto[]) => list.map((p) => (p.file as { name: string }).name);
// ---------------------------------------------------------------------------
describe('moveGalleryPhoto', () => {
  const three = [photo(1), photo(2), photo(3)];

  it('moves an item forward and back', () => {
    expect(names(moveGalleryPhoto(three, 0, 2))).toEqual(['2.jpg', '3.jpg', '1.jpg']);
    expect(names(moveGalleryPhoto(three, 2, 0))).toEqual(['3.jpg', '1.jpg', '2.jpg']);
    expect(names(moveGalleryPhoto(three, 0, 1))).toEqual(['2.jpg', '1.jpg', '3.jpg']);
  });

  it('never mutates the input', () => {
    const before = names(three);
    moveGalleryPhoto(three, 0, 2);
    expect(names(three)).toEqual(before);
  });

  it('returns the SAME ARRAY for a no-op, not a copy', () => {
    // Identity, not just contents. from === to cancels out under the two
    // splices, so a contents check passes either way — but returning a new
    // reference makes React re-render for a drag that changed nothing, and the
    // module's rule (see removeGalleryPhoto) is a true no-op.
    const list = [photo(1), photo(2), photo(3)];
    expect(moveGalleryPhoto(list, 1, 1)).toBe(list);
    expect(moveGalleryPhoto(list, -1, 0)).toBe(list);
    expect(moveGalleryPhoto(list, 0, 9)).toBe(list);
    expect(moveGalleryPhoto(list, NaN, 0)).toBe(list);
  });

  it('is a no-op for a drop that lands nowhere', () => {
    // Same rule as removeGalleryPhoto: out of range leaves the list alone
    // rather than silently rewriting it.
    for (const [from, to] of [[-1, 1], [0, 3], [3, 0], [0, -1], [1, 1]]) {
      expect(names(moveGalleryPhoto(three, from, to)), `${from}->${to}`).toEqual(['1.jpg', '2.jpg', '3.jpg']);
    }
  });

  it('is a no-op for NaN and fractional indices', () => {
    // Both bounds comparisons are false for NaN, so without the integer check
    // this would fall through and rewrite the list.
    for (const [from, to] of [[NaN, 1], [0, NaN], [0.5, 1], [0, 1.5]]) {
      expect(names(moveGalleryPhoto(three, from, to))).toEqual(['1.jpg', '2.jpg', '3.jpg']);
    }
  });

  it('handles an empty and a single-item gallery', () => {
    expect(moveGalleryPhoto([], 0, 0)).toEqual([]);
    expect(names(moveGalleryPhoto([photo(1)], 0, 0))).toEqual(['1.jpg']);
  });
});

describe('classifyGalleryIntake — the cap is never silent', () => {
  const f = (type: string) => ({ type });

  it('reports how many were refused for being over the cap', () => {
    // Five images into an empty 3-slot gallery: three land, and the caller is
    // TOLD two did not. A cap the user cannot see reads as "this is everything"
    // — the bug class behind #202, #220 and #221.
    const over = 2;
    const r = classifyGalleryIntake([], Array.from({ length: MAX_GALLERY_PHOTOS + over }, () => f('image/jpeg')));
    expect(r.accepted).toHaveLength(MAX_GALLERY_PHOTOS);
    expect(r.rejectedOverCap).toBe(over);
    expect(r.rejectedNotImage).toBe(0);
  });

  it('reports non-images separately from over-cap', () => {
    const r = classifyGalleryIntake([], [f('image/jpeg'), f('application/pdf'), f('video/mp4')]);
    expect(r.accepted).toHaveLength(1);
    expect(r.rejectedNotImage).toBe(2);
    expect(r.rejectedOverCap).toBe(0);
  });

  it('counts both reasons in one batch', () => {
    const images = Array.from({ length: MAX_GALLERY_PHOTOS + 1 }, () => f('image/jpeg'));
    const r = classifyGalleryIntake([], [...images, f('text/plain')]);
    expect(r.accepted).toHaveLength(MAX_GALLERY_PHOTOS);
    expect(r.rejectedOverCap).toBe(1);
    expect(r.rejectedNotImage).toBe(1);
  });

  it('accounts for photos already in the gallery', () => {
    const r = classifyGalleryIntake(photos(MAX_GALLERY_PHOTOS - 1), [f('image/jpeg'), f('image/png')]);
    expect(r.accepted).toHaveLength(1);
    expect(r.rejectedOverCap).toBe(1);
  });

  it('refuses everything when the gallery is already full', () => {
    const r = classifyGalleryIntake(photos(MAX_GALLERY_PHOTOS), [f('image/jpeg')]);
    expect(r.accepted).toHaveLength(0);
    expect(r.rejectedOverCap).toBe(1);
  });

  it('agrees with acceptGalleryFiles on what is kept', () => {
    // Two functions must not disagree about the cap.
    const incoming = [f('image/jpeg'), f('image/png'), f('application/pdf'), f('image/jpeg'), f('image/png')];
    const prev = photos(MAX_GALLERY_PHOTOS - 1);
    expect(classifyGalleryIntake(prev, incoming).accepted).toEqual(acceptGalleryFiles(prev, incoming));
  });
});

describe('imageFilesFromTransfer', () => {
  const file = (type: string, name = 'x') => ({ type, name }) as File;

  it('reads an OS drag, which populates files', () => {
    const r = imageFilesFromTransfer({ files: [file('image/jpeg'), file('application/pdf')] });
    expect(r).toHaveLength(1);
  });

  it('reads a paste, which only populates items', () => {
    // A clipboard image is exposed through items, not files — the reason both
    // paths exist.
    const img = file('image/png');
    const r = imageFilesFromTransfer({
      files: [],
      items: [
        { kind: 'string', type: 'text/plain', getAsFile: () => null },
        { kind: 'file', type: 'image/png', getAsFile: () => img },
      ],
    });
    expect(r).toEqual([img]);
  });

  it('ignores a string item that claims to be a file type', () => {
    const r = imageFilesFromTransfer({
      files: [],
      items: [{ kind: 'string', type: 'image/png', getAsFile: () => file('image/png') }],
    });
    expect(r).toEqual([]);
  });

  it('survives a null transfer, and empty shapes', () => {
    expect(imageFilesFromTransfer(null)).toEqual([]);
    expect(imageFilesFromTransfer(undefined)).toEqual([]);
    expect(imageFilesFromTransfer({})).toEqual([]);
    expect(imageFilesFromTransfer({ files: null, items: null })).toEqual([]);
  });

  it('drops an item whose getAsFile returns null', () => {
    const r = imageFilesFromTransfer({
      files: [],
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => null }],
    });
    expect(r).toEqual([]);
  });
});

/* ======================================================================
   Cover + video single-file intake (drag-and-drop parity).

   Drag-and-drop used to exist only for the gallery. The cover and the video
   were click-only and, worse, validated nothing: an oversized cover simply
   appeared not to work, and the failure surfaced later as a Storage rules
   rejection. These helpers back the drop zones on both the admin drop builder
   and the seller wizard, so one validation serves both ways in.

   The ceilings are read off `storage.rules`, not chosen — see the module.
   ====================================================================== */
describe('isVideoFile', () => {
  it('accepts a video MIME type', () => {
    expect(isVideoFile({ type: 'video/mp4' })).toBe(true);
    expect(isVideoFile({ type: 'video/quicktime' })).toBe(true);
  });

  it('accepts a known extension when the browser reports no useful type', () => {
    // Android pickers and some OS drags hand over '' or octet-stream for a
    // perfectly good .mov. Refusing those would refuse real videos.
    expect(isVideoFile({ type: '', name: 'clip.mov' })).toBe(true);
    expect(isVideoFile({ type: 'application/octet-stream', name: 'clip.MP4' })).toBe(true);
    expect(isVideoFile({ type: '', name: 'clip.webm' })).toBe(true);
  });

  it('rejects a non-video, and a bare name with no usable extension', () => {
    expect(isVideoFile({ type: 'image/png', name: 'a.png' })).toBe(false);
    expect(isVideoFile({ type: 'application/pdf', name: 'a.pdf' })).toBe(false);
    expect(isVideoFile({ type: '', name: 'clip' })).toBe(false);
    expect(isVideoFile({ type: '', name: 'clip.txt' })).toBe(false);
  });

  it('does not let an extension override a contradicting real type', () => {
    // A file the browser positively identifies as an image is an image, whatever
    // it is called.
    expect(isVideoFile({ type: 'image/jpeg', name: 'sneaky.mp4' })).toBe(false);
  });
});

describe('filesFromTransfer', () => {
  const f = (type: string, name = 'x') => ({ type, name }) as unknown as File;

  it('prefers files and filters by the predicate', () => {
    const out = filesFromTransfer({ files: [f('image/png'), f('video/mp4')] }, isImageFile);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('image/png');
  });

  it('falls back to items when files is empty — the paste path', () => {
    const vid = f('video/mp4');
    const out = filesFromTransfer({
      files: [],
      items: [{ kind: 'file', type: 'video/mp4', getAsFile: () => vid }],
    }, isVideoFile);
    expect(out).toEqual([vid]);
  });

  it('ignores non-file items and a null transfer', () => {
    expect(filesFromTransfer({
      items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }],
    }, isImageFile)).toEqual([]);
    expect(filesFromTransfer(null, isImageFile)).toEqual([]);
    expect(filesFromTransfer(undefined, isImageFile)).toEqual([]);
  });

  it('still backs imageFilesFromTransfer unchanged', () => {
    // The wrapper is what the gallery zone already calls; generalising the
    // implementation must not have altered it.
    const out = imageFilesFromTransfer({ files: [f('image/webp'), f('text/plain')] });
    expect(out).toHaveLength(1);
  });
});

describe('checkCoverFile', () => {
  it('accepts an image inside the ceiling', () => {
    expect(checkCoverFile({ type: 'image/jpeg', size: 5 * 1024 * 1024 })).toEqual({ ok: true });
  });

  it('refuses a non-image as wrong_type', () => {
    expect(checkCoverFile({ type: 'video/mp4', size: 10 })).toEqual({ ok: false, reason: 'wrong_type' });
  });

  it('refuses an oversized image as too_large, at the server ceiling', () => {
    expect(checkCoverFile({ type: 'image/png', size: MAX_COVER_BYTES + 1 }))
      .toEqual({ ok: false, reason: 'too_large' });
    // Exactly at the limit is allowed — the rule is `<=`.
    expect(checkCoverFile({ type: 'image/png', size: MAX_COVER_BYTES })).toEqual({ ok: true });
  });

  it('treats a missing file as a refusal rather than throwing', () => {
    expect(checkCoverFile(null).ok).toBe(false);
    expect(checkCoverFile(undefined).ok).toBe(false);
  });
});

describe('checkVideoFile', () => {
  it('accepts a video inside the ceiling', () => {
    expect(checkVideoFile({ type: 'video/mp4', size: 20 * 1024 * 1024 })).toEqual({ ok: true });
  });

  it('refuses a non-video and an oversized video', () => {
    expect(checkVideoFile({ type: 'image/png', size: 10 })).toEqual({ ok: false, reason: 'wrong_type' });
    expect(checkVideoFile({ type: 'video/mp4', size: MAX_VIDEO_BYTES + 1 }))
      .toEqual({ ok: false, reason: 'too_large' });
  });

  it('honours a caller-supplied stricter ceiling', () => {
    // The seller's video form caps at 100MB for upload reliability on mobile
    // connections, below the 250MB the Storage rules allow.
    const hundred = 100 * 1024 * 1024;
    expect(checkVideoFile({ type: 'video/mp4', size: hundred + 1 }, hundred))
      .toEqual({ ok: false, reason: 'too_large' });
    expect(checkVideoFile({ type: 'video/mp4', size: hundred }, hundred)).toEqual({ ok: true });
  });
});
