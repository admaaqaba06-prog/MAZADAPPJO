import { getCountries, getCountryCallingCode, type CountryCode } from 'libphonenumber-js';

export interface CountryOption { iso2: CountryCode; dialCode: string; name: string; flag: string; }

/** ISO2 -> flag emoji via regional-indicator code points. */
export function flagFor(iso2: string): string {
  return iso2.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

/** All dialable countries, names localized to `lang` via Intl.DisplayNames. */
export function getCountryList(lang: 'en' | 'ar' = 'en'): CountryOption[] {
  const dn = new Intl.DisplayNames([lang], { type: 'region' });
  return getCountries()
    .map((iso2) => ({
      iso2,
      dialCode: `+${getCountryCallingCode(iso2)}`,
      name: dn.of(iso2) || iso2,
      flag: flagFor(iso2),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
