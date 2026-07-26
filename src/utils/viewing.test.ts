// Per-lot viewing resolver — the ONLY place that decides what a lot says about
// physical viewing. Fails closed to null (render nothing) for anything unknown,
// because a fabricated viewing claim is exactly the bug this feature exists to
// kill (see docs/superpowers/specs/2026-07-26-per-lot-viewing-design.md).
import { describe, it, expect } from 'vitest';
import { resolveViewing } from './viewing';

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
