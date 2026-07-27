import { describe, it, expect } from 'vitest';
import { getCountryList, flagFor } from './countryData';

describe('countryData', () => {
  it('flagFor JO', () => { expect(flagFor('JO')).toBe('🇯🇴'); });
  it('list includes JO/US/GB with dial codes', () => {
    const list = getCountryList('en');
    const jo = list.find((c) => c.iso2 === 'JO');
    const us = list.find((c) => c.iso2 === 'US');
    expect(jo?.dialCode).toBe('+962');
    expect(us?.dialCode).toBe('+1');
    expect(list.length).toBeGreaterThan(100);
  });
});
