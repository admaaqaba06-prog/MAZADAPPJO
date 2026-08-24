// Drag-and-drop must work on every media zone, not just the gallery.
//
// It shipped on the admin drop builder's GALLERY only. The cover image and the
// product video — on both the admin builder and the seller wizard — were
// click-only, and two of them validated nothing at all: an oversized cover
// simply appeared not to work, and the refusal surfaced later as a Storage rules
// rejection with no explanation.
//
// Four zones, asserted here:
//   MediaPicker         cover   +   video    (admin drop builder)
//   ListingWizardView   cover                (seller wizard)
//   VideoUploadForm     video                (seller wizard)
//
// THE ONE THAT BITES. `onDragOver` must call `preventDefault`. Without it the
// browser handles the drop itself — it navigates away to open the file — and a
// half-completed listing form is gone. Every zone is checked for it.
//
// Source-text assertions: vitest here is `environment: 'node'` with no jsdom, so
// none of these components can be rendered and a drop cannot be dispatched. The
// house idiom, per src/components/desktopDescription.wiring.test.ts. The
// validation logic itself IS executed — in mediaPickerState.test.ts, against the
// same helpers these zones call.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const PICKER = readFileSync(new URL('./ui/MediaPicker.tsx', import.meta.url), 'utf8');
const WIZARD = readFileSync(new URL('./ListingWizardView.tsx', import.meta.url), 'utf8');
const VIDEO = readFileSync(new URL('./VideoUploadForm.tsx', import.meta.url), 'utf8');

const SURFACES = [
  ['MediaPicker (admin cover + video)', PICKER],
  ['ListingWizardView (seller cover)', WIZARD],
  ['VideoUploadForm (seller video)', VIDEO],
] as const;

/** Every `onDragOver={...}` handler body in a file. */
function dragOverHandlers(src: string): string[] {
  return [...src.matchAll(/onDragOver=\{([^}]*\}[^}]*|[^}]*)\}/g)].map((m) => m[0]);
}

describe('every media drop zone prevents the browser from opening the file', () => {
  for (const [name, src] of SURFACES) {
    it(`${name} calls preventDefault on drag-over and on drop`, () => {
      const handlers = dragOverHandlers(src);
      expect(handlers.length, `${name} has no onDragOver at all`).toBeGreaterThan(0);
      for (const h of handlers) {
        expect(h, `an onDragOver in ${name} does not preventDefault`).toContain('preventDefault');
      }
      // The drop itself must also preventDefault — dragOver alone is not enough.
      //
      // The gallery's per-tile REORDER drop is excluded, and deliberately: it
      // bails on `dragIndex === null` so a file drop falls through to the
      // container above, which is the handler that preventDefaults. Asserting on
      // it would be asserting the wrong contract — it is not a file drop zone.
      const drops = [...src.matchAll(/onDrop=\{\(e\) => \{([\s\S]*?)\n\s*\}\}/g)]
        .map((m) => m[1])
        .filter((d) => !d.includes('dragIndex'));
      expect(drops.length, `${name} has no file onDrop`).toBeGreaterThan(0);
      for (const d of drops) {
        expect(d, `a file onDrop in ${name} does not preventDefault`).toContain('preventDefault');
      }
    });
  }
});

describe('the cover zones accept a drop and validate it', () => {
  it('the admin cover reads the drop and routes it through the checked intake', () => {
    expect(PICKER).toMatch(/filesFromTransfer\(e\.dataTransfer, isImageFile\)/);
    expect(PICKER).toMatch(/takeCover\(/);
    expect(PICKER).toMatch(/checkCoverFile\(/);
  });

  it('the seller cover does the same', () => {
    expect(WIZARD).toMatch(/filesFromTransfer\(e\.dataTransfer, isImageFile\)/);
    expect(WIZARD).toMatch(/takeCover\(/);
    expect(WIZARD).toMatch(/checkCoverFile\(/);
  });

  it('both keep the click path and its file input', () => {
    // Drag-and-drop is additive. Removing the input would break mobile, which
    // has no drag at all.
    for (const [name, src] of [['admin', PICKER], ['seller', WIZARD]] as const) {
      expect(src, `${name} cover lost its file input`).toMatch(/type="file"[\s\S]{0,120}accept="image\/\*"/);
    }
  });
});

describe('the video zones accept a drop and validate it', () => {
  it('the admin video reads the drop through the checked intake', () => {
    expect(PICKER).toMatch(/filesFromTransfer\(e\.dataTransfer, isVideoFile\)/);
    expect(PICKER).toMatch(/checkVideoFile\(/);
  });

  it('the seller video reuses its OWN existing validation, not a second copy', () => {
    // VideoUploadForm already owned the product rules — video/* plus an
    // extension fallback, a 100MB hard reject and a 25MB warning. The drop must
    // go through that same function or the two paths drift.
    expect(VIDEO).toMatch(/filesFromTransfer\(e\.dataTransfer, isVideoFile\)/);
    expect(VIDEO).toMatch(/const acceptVideoFile = /);
    // Both ways in call it. Two call sites — the picker's onChange and the drop
    // — since the arrow-function DEFINITION (`const acceptVideoFile = (file`)
    // has no paren straight after the name and is matched separately above.
    const calls = (VIDEO.match(/acceptVideoFile\(/g) ?? []).length;
    expect(calls, 'expected a picker call and a drop call').toBeGreaterThanOrEqual(2);
    // And the rules still live there, once.
    expect((VIDEO.match(/100 \* 1024 \* 1024/g) ?? []).length).toBe(1);
  });

  it('keeps the video file input', () => {
    expect(PICKER).toMatch(/accept="video\/\*"/);
    expect(VIDEO).toMatch(/accept="video\/\*/);
  });
});

describe('a refused file can be retried', () => {
  it('clears the input value so re-picking the same file fires onChange again', () => {
    // Without this, a user who picks a too-large file, is told, then picks the
    // SAME file after shrinking it, gets no event at all.
    for (const [name, src] of SURFACES) {
      expect(src, `${name} does not reset its file input`).toMatch(/e\.target\.value = ''/);
    }
  });
});
