// Per-lot viewing resolver — the ONLY place that decides what a lot says about
// physical viewing. Fails closed to null (render nothing) for anything unknown,
// because a fabricated viewing claim is exactly the bug this feature exists to
// kill (see docs/superpowers/specs/2026-07-26-per-lot-viewing-design.md).
import { describe, it, expect } from 'vitest';
import { resolveViewing, viewingWritePayload } from './viewing';

describe('resolveViewing', () => {
  it('office: says the item is at our office, both languages', () => {
    expect(resolveViewing({ viewing: 'office' }, true)).toEqual({ label: 'معاينة بمكاتبنا' });
    expect(resolveViewing({ viewing: 'office' }, false)).toEqual({ label: 'Viewable at our office' });
  });

  it('store with a place: names the place, both languages', () => {
    const lot = { viewing: 'store', viewingPlace: 'محل الأمين، وسط البلد' };
    expect(resolveViewing(lot, true)).toEqual({ label: 'معاينة عند البائع · محل الأمين، وسط البلد' });
    expect(resolveViewing(lot, false)).toEqual({ label: 'Viewable at the seller: محل الأمين، وسط البلد' });
  });

  it('store without a place: still offers viewing, just unnamed', () => {
    expect(resolveViewing({ viewing: 'store' }, true)).toEqual({ label: 'معاينة عند البائع' });
    expect(resolveViewing({ viewing: 'store' }, false)).toEqual({ label: 'Viewable at the seller' });
  });

  it('store with a whitespace-only place is treated as no place', () => {
    expect(resolveViewing({ viewing: 'store', viewingPlace: '   ' }, true)).toEqual({ label: 'معاينة عند البائع' });
  });

  it('store trims surrounding whitespace from the place', () => {
    expect(resolveViewing({ viewing: 'store', viewingPlace: '  محل الأمين  ' }, false))
      .toEqual({ label: 'Viewable at the seller: محل الأمين' });
  });

  it('private renders nothing — a "no viewing" badge tells the buyer nothing actionable', () => {
    expect(resolveViewing({ viewing: 'private' }, true)).toBeNull();
    expect(resolveViewing({ viewing: 'private' }, false)).toBeNull();
  });

  it('unset renders nothing (every pre-existing lot)', () => {
    expect(resolveViewing({}, true)).toBeNull();
    expect(resolveViewing({ viewing: undefined }, false)).toBeNull();
    expect(resolveViewing({ viewing: null }, false)).toBeNull();
  });

  it('fails closed on unknown/garbage values rather than inventing a label', () => {
    expect(resolveViewing({ viewing: 'OFFICE' }, true)).toBeNull(); // case-sensitive by design
    expect(resolveViewing({ viewing: 'warehouse' }, false)).toBeNull();
    expect(resolveViewing({ viewing: '' }, false)).toBeNull();
  });

  it('ignores viewingPlace when the mode is not store', () => {
    expect(resolveViewing({ viewing: 'office', viewingPlace: 'محل الأمين' }, false))
      .toEqual({ label: 'Viewable at our office' });
    expect(resolveViewing({ viewing: 'private', viewingPlace: 'محل الأمين' }, false)).toBeNull();
  });

  it('never throws on a null/undefined auction', () => {
    expect(resolveViewing(null, true)).toBeNull();
    expect(resolveViewing(undefined, false)).toBeNull();
  });
});

// The write side of the same rule. Firestore updateDoc MERGES, so an omitted key
// leaves whatever was stored there before. A lot can be approved more than once
// (rejected → resubmitted → approved again), so "only write the place when we
// have one" silently revives the place from an EARLIER approval — the lot then
// advertises a shop nobody entered for it. That is the exact fabricated-claim
// bug this module exists to kill, arriving through the back door.
describe('viewingWritePayload', () => {
  it('no viewing: writes NEITHER key, so an unset lot stays unset', () => {
    expect(viewingWritePayload()).toEqual({});
    expect(viewingWritePayload(undefined)).toEqual({});
    expect(viewingWritePayload('')).toEqual({});
    // Even when a place is somehow supplied, no mode means no claim at all.
    expect(viewingWritePayload(undefined, 'محل الأمين')).toEqual({});
    expect(viewingWritePayload('', 'محل الأمين')).toEqual({});
  });

  it('store with a place: writes the trimmed place', () => {
    expect(viewingWritePayload('store', '  محل الأمين  ')).toEqual({
      viewing: 'store',
      viewingPlace: 'محل الأمين',
    });
  });

  it('store with no place: writes an EMPTY place rather than omitting the key', () => {
    // Omitting it would leave a place from a previous approval in the document.
    expect(viewingWritePayload('store')).toEqual({ viewing: 'store', viewingPlace: '' });
    expect(viewingWritePayload('store', '')).toEqual({ viewing: 'store', viewingPlace: '' });
  });

  it('store with a whitespace-only place is treated as no place', () => {
    expect(viewingWritePayload('store', '   ')).toEqual({ viewing: 'store', viewingPlace: '' });
    expect(viewingWritePayload('store', '\n\t ')).toEqual({ viewing: 'store', viewingPlace: '' });
  });

  it('office/private: always clears the place, even if one was passed', () => {
    expect(viewingWritePayload('office')).toEqual({ viewing: 'office', viewingPlace: '' });
    expect(viewingWritePayload('private')).toEqual({ viewing: 'private', viewingPlace: '' });
    expect(viewingWritePayload('office', 'محل الأمين')).toEqual({
      viewing: 'office',
      viewingPlace: '',
    });
    expect(viewingWritePayload('private', 'محل الأمين')).toEqual({
      viewing: 'private',
      viewingPlace: '',
    });
  });

  it('never emits a key whose value is undefined (Firestore rejects those)', () => {
    const cases = [
      viewingWritePayload(),
      viewingWritePayload(''),
      viewingWritePayload(undefined, 'محل الأمين'),
      viewingWritePayload('store'),
      viewingWritePayload('store', ''),
      viewingWritePayload('store', '   '),
      viewingWritePayload('store', 'محل الأمين'),
      viewingWritePayload('office'),
      viewingWritePayload('office', 'محل الأمين'),
      viewingWritePayload('private'),
    ];
    for (const payload of cases) {
      for (const key of Object.keys(payload)) {
        expect(payload[key as keyof typeof payload]).not.toBeUndefined();
      }
    }
  });

  it('closes the stale-place hole end to end: re-approving store with a blank place '
    + 'no longer advertises the old shop', () => {
    // 1. First approval: store at "Shop 12".
    let stored: { viewing?: string; viewingPlace?: string } = {};
    stored = { ...stored, ...viewingWritePayload('store', 'Shop 12') };
    expect(resolveViewing(stored, false)).toEqual({ label: 'Viewable at the seller: Shop 12' });

    // 2. Re-approved as office — the place must not linger.
    stored = { ...stored, ...viewingWritePayload('office') };
    expect(resolveViewing(stored, false)).toEqual({ label: 'Viewable at our office' });

    // 3. Re-approved as store with NO place entered: unnamed seller, not "Shop 12".
    stored = { ...stored, ...viewingWritePayload('store', '') };
    expect(resolveViewing(stored, false)).toEqual({ label: 'Viewable at the seller' });
    expect(resolveViewing(stored, true)).toEqual({ label: 'معاينة عند البائع' });
  });
});
