/**
 * Video and ID-document uploads are OPTIONAL. Both used to be hard gates that
 * refused an otherwise complete submission, and both gates were plain early
 * `return`s — invisible to tsc, and unrenderable here (vitest is environment:
 * 'node' with no jsdom). Source-text assertions, per the house idiom.
 *
 * The uploads themselves are NOT removed: the pickers, the storage writes and
 * the admin review all stay. Only the requirement is gone.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const wizard = readFileSync(new URL('./ListingWizardView.tsx', import.meta.url), 'utf8');
const sellerCenter = readFileSync(new URL('./SellerCenterView.tsx', import.meta.url), 'utf8');
const ctx = readFileSync(new URL('../context/AppContext.tsx', import.meta.url), 'utf8');

describe('video upload is optional', () => {
  it('the wizard no longer refuses a submission for want of a video', () => {
    expect(wizard).not.toContain("Please upload a video first");
    expect(wizard).not.toMatch(/if \(!customVideoUrl\) \{/);
  });

  it('it requires SOME media instead, via the one shared media rule', () => {
    // Not "no gate at all": a listing with no image and no video would publish
    // blank. draftHasMedia is the same rule the admin drop builder uses.
    expect(wizard).toContain("import { draftHasMedia } from '../utils/listingMedia'");
    expect(wizard).toMatch(/if \(!draftHasMedia\(/);
  });

  it('a cover image alone satisfies the gate', () => {
    const call = wizard.slice(wizard.indexOf('!draftHasMedia('), wizard.indexOf('!draftHasMedia(') + 250);
    expect(call).toContain('thumbnailFile');
    expect(call).toContain('videoFile');
    expect(call).toContain('gallery');
  });

  it('the video step is labelled optional in both languages', () => {
    expect(wizard).toContain('Product Video (Optional)');
    expect(wizard).toContain('(اختياري)');
  });

  it('the upload functionality itself is untouched', () => {
    expect(wizard).toContain('VideoUploadForm');
    expect(wizard).toContain('rawVideoFile');
  });
});

describe('ID / verification document upload is optional', () => {
  it('the verification form no longer returns early without documents', () => {
    expect(sellerCenter).not.toMatch(/if \(!idFrontFile \|\| !idBackFile\) return;/);
  });

  it('the submit button is no longer gated on the files', () => {
    expect(sellerCenter).toContain('disabled={isVerSubmitting}');
    expect(sellerCenter).not.toMatch(/disabled=\{isVerSubmitting \|\| !idFrontFile/);
  });

  it('each upload is now conditional rather than assumed', () => {
    // `idFrontFile.name` on a null file is a TypeError, so making the gate
    // optional without guarding the uploads would trade a refused submission
    // for a crash.
    expect(sellerCenter).toMatch(/if \(idFrontFile\) \{/);
    expect(sellerCenter).toMatch(/if \(idBackFile\) \{/);
  });

  it('the labels say optional, not required', () => {
    expect(sellerCenter).toContain('National ID - Front Image (Optional)');
    expect(sellerCenter).toContain('National ID - Back Image (Optional)');
    expect(sellerCenter).not.toContain('National ID - Front Image (Required)');
    expect(sellerCenter).not.toContain('National ID - Back Image (Required)');
  });

  it('the upload functionality itself is untouched', () => {
    expect(sellerCenter).toContain('verification-documents/');
    expect(sellerCenter).toContain('submitVerificationRequest');
  });

  it('an absent document is stored as absent, not as a stock photo', () => {
    // These two were hardcoded Unsplash URLs, so a reviewer saw a stranger's
    // photograph rendered as this seller's national ID. Fatal once the document
    // is optional: "no ID supplied" would still LOOK like an ID was supplied.
    expect(ctx).not.toContain('photo-1544377193-33dcf4d68fb5');
    expect(ctx).not.toContain('photo-1554415707-6e8cfc93fe23');
    expect(ctx).toMatch(/businessLicenseUrl: '',/);
    expect(ctx).toMatch(/nationalIdUrl: ''/);
  });
});
