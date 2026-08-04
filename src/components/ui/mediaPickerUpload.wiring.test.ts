// Drag, paste and reorder in the drop builder's gallery.
//
// The DECISIONS are unit-tested in mediaPickerState.test.ts (moveGalleryPhoto,
// classifyGalleryIntake, imageFilesFromTransfer). This pins the wiring: that the
// component uses them, and that the drop target is set up in the way browsers
// actually require.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('./MediaPicker.tsx', import.meta.url), 'utf8');
/**
 * Comment stripping, with one non-obvious guard.
 *
 * A naive /\*[\s\S]*?\*\/ ALSO matches the `/*` inside `accept="image/*"` and
 * then runs to the next `*\/` anywhere in the file — which silently deleted the
 * entire drop-zone element and made five assertions fail against correct code.
 * Requiring the opener to follow whitespace or `{` keeps it to real comments.
 */
const CODE = SRC
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/(^|[\s{])\/\*[\s\S]*?\*\//g, '$1')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/**
 * The drop zone's attribute list.
 *
 * Bounded by two REAL anchors — the first drag handler and the element's id —
 * rather than by a character count or a hand-rolled tag scan. Three earlier
 * versions failed, each instructively:
 *   1. `slice(i - 2000, i + 200)` — a fixed-width window; one added comment
 *      pushed the handlers outside it and six assertions failed against
 *      perfectly correct code.
 *   2. `lastIndexOf('<div', marker)` — scanned back blindly and landed on an
 *      earlier element entirely.
 *   3. a backward walk to `<` — tripped over the `>` in every `=>` arrow.
 * Both anchors throw when missing, so this can never silently return ''.
 */
function zone(): string {
  const start = CODE.indexOf('onDragOver=');
  if (start === -1) throw new Error('no onDragOver handler in MediaPicker');
  const end = CODE.indexOf('id="gallery-drop-zone"', start);
  if (end === -1) throw new Error('id="gallery-drop-zone" not found after onDragOver');
  return CODE.slice(start, end);
}

describe('the gallery accepts a drop', () => {
  it('preventDefaults dragOver — without it the browser opens the file instead', () => {
    // The single most common reason a drop target silently does nothing.
    expect(zone()).toMatch(/onDragOver=\{\(e\) => \{ e\.preventDefault\(\)/);
  });

  it('preventDefaults the drop itself', () => {
    expect(zone()).toMatch(/onDrop=\{\(e\) => \{\s*e\.preventDefault\(\)/);
  });

  it('reads files through the shared extractor, not dataTransfer.files directly', () => {
    // The extractor also covers the paste shape, where the image is only on
    // `items`. Reading `.files` inline would work for drops and silently fail
    // for pastes.
    expect(zone()).toMatch(/imageFilesFromTransfer\(e\.dataTransfer\)/);
  });
});

describe('the gallery accepts a paste', () => {
  it('handles onPaste via the same extractor', () => {
    expect(zone()).toMatch(/onPaste=/);
    expect(CODE).toMatch(/imageFilesFromTransfer\(e\.clipboardData\)/);
  });

  it('is focusable, so a paste has somewhere to land', () => {
    expect(zone()).toMatch(/tabIndex=\{0\}/);
  });

  it('only preventDefaults a paste that actually carried an image', () => {
    // Swallowing every paste would break pasting text into a neighbouring field.
    expect(CODE).toMatch(/if \(files\.length > 0\) \{ e\.preventDefault\(\); intake\(files\); \}/);
  });
});

describe('the gallery reorders by drag', () => {
  it('marks thumbnails draggable and tracks the dragged index', () => {
    expect(CODE).toMatch(/draggable/);
    expect(CODE).toMatch(/onDragStart=\{\(\) => setDragIndex\(idx\)\}/);
  });

  it('reorders through moveGalleryPhoto rather than splicing inline', () => {
    expect(CODE).toMatch(/onGalleryChange\(moveGalleryPhoto\(gallery, dragIndex, idx\)\)/);
  });

  it('ignores a reorder drop when nothing was being dragged', () => {
    // A FILE drop lands on a thumbnail too; without this it would be read as a
    // reorder from a null index.
    expect(CODE).toMatch(/if \(dragIndex === null\) return;/);
  });

  it('stops a reorder drop from also firing the container intake', () => {
    expect(CODE).toMatch(/e\.stopPropagation\(\)/);
  });
});

describe('the cap is stated, never silent', () => {
  it('renders a notice when photos were refused', () => {
    // #202, #220 and #221 were all "the cap looked like the whole truth".
    expect(CODE).toMatch(/id="gallery-refused-notice"/);
  });

  it('distinguishes over-cap from not-an-image', () => {
    expect(CODE).toMatch(/refused\.overCap/);
    expect(CODE).toMatch(/refused\.notImage/);
  });

  it('states the refusal in both languages', () => {
    const i = CODE.indexOf('id="gallery-refused-notice"');
    const block = CODE.slice(Math.max(0, i - 1400), i + 1400);
    expect(block).toMatch(/الحد/);
    expect(block).toMatch(/the limit is/);
  });

  it('routes intake through classifyGalleryIntake so the count is real', () => {
    expect(CODE).toMatch(/classifyGalleryIntake\(gallery, files\)/);
  });

  it('still mints object URLs only for accepted files', () => {
    // The pre-existing leak guard must survive the rewrite.
    expect(CODE).toMatch(/outcome\.accepted\.map\(\(file\) => \(\{/);
    expect(CODE).not.toMatch(/files\.map\(\(file\) => \(\{[\s\S]{0,80}createObjectURL/);
  });
});
