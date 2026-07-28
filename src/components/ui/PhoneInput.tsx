import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';
import { getCountryList } from '../../utils/countryData';
import { parsePhoneToE164, DEFAULT_COUNTRY } from '../../utils/phoneNumber';
import type { CountryCode } from 'libphonenumber-js';

/**
 * Multi-country phone input (Task C1).
 *
 * Controlled: the parent owns `{ country, national }`. On every change (typing a
 * national number OR picking a country), we recompute the E.164 value with
 * `parsePhoneToE164(national, country)` and re-emit the full triplet through
 * `onChange({ country, national, e164 })`. `e164` is `null` while the number is
 * incomplete/invalid — the parent decides how to gate on that.
 *
 * Layout: a single cohesive rounded input split into a LEFT country button
 * (`{flag} {dialCode}` + chevron, toggles a searchable dropdown) and a RIGHT
 * `type="tel"` national-number field. RTL-aware when `lang === 'ar'`.
 */
export interface PhoneInputValue {
  country: CountryCode;
  national: string;
}

export interface PhoneInputProps {
  value: PhoneInputValue;
  onChange: (v: { country: CountryCode; national: string; e164: string | null }) => void;
  lang?: 'en' | 'ar';
  disabled?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  id?: string;
}

export const PhoneInput: React.FC<PhoneInputProps> = ({
  value,
  onChange,
  lang = 'en',
  disabled = false,
  autoFocus = false,
  placeholder,
  id,
}) => {
  const isAr = lang === 'ar';
  const listLang: 'en' | 'ar' = isAr ? 'ar' : 'en';
  // Treat a falsy country as the default (JO) so the button never renders blank.
  const country: CountryCode = value.country || DEFAULT_COUNTRY;
  const national = value.national ?? '';

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const rootRef = useRef<HTMLDivElement>(null);
  const numberRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Country list is stable per language — rebuild only when `lang` changes.
  const countries = useMemo(() => getCountryList(listLang), [listLang]);
  const selected = useMemo(
    () => countries.find((c) => c.iso2 === country),
    [countries, country]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.dialCode.toLowerCase().includes(q) ||
        c.iso2.toLowerCase().includes(q)
    );
  }, [countries, query]);

  const emit = useCallback(
    (nextCountry: CountryCode, nextNational: string) => {
      onChange({
        country: nextCountry,
        national: nextNational,
        e164: parsePhoneToE164(nextNational, nextCountry),
      });
    },
    [onChange]
  );

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    emit(country, e.target.value);
  };

  const handleSelectCountry = (iso2: CountryCode) => {
    setOpen(false);
    setQuery('');
    emit(iso2, national);
    // Refocus the number field after picking a country (deferred so the dropdown
    // has unmounted and focus doesn't bounce back to the search box).
    requestAnimationFrame(() => numberRef.current?.focus());
  };

  // Focus the search box when the dropdown opens.
  useEffect(() => {
    if (open) requestAnimationFrame(() => searchRef.current?.focus());
  }, [open]);

  // Close on outside-click and Escape.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setQuery('');
        numberRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const dir = isAr ? 'rtl' : 'ltr';
  const searchPlaceholder = isAr ? 'ابحث عن دولة أو رمز' : 'Search country or code';
  const countryAria = isAr ? 'اختر الدولة' : 'Select country';
  const numberPlaceholder = placeholder ?? (isAr ? 'رقم الهاتف' : 'Phone number');

  return (
    <div ref={rootRef} className="relative w-full" dir={dir} id={id}>
      {/* Cohesive input group: focus-within lifts the whole shell to the orange ring. */}
      <div
        className={`flex items-stretch w-full h-11 bg-white border border-gray-200 rounded-xl overflow-hidden transition-all focus-within:border-[#FF6B00] focus-within:ring-1 focus-within:ring-[#FF6B00] ${
          disabled ? 'opacity-60' : ''
        }`}
      >
        {/* LEFT: country button */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => { if (o) setQuery(''); return !o; })}
          aria-label={countryAria}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={`flex items-center gap-1.5 px-3 shrink-0 text-sm font-semibold text-gray-900 hover:bg-gray-50 transition-colors disabled:cursor-not-allowed ${
            isAr ? 'border-l' : 'border-r'
          } border-gray-200`}
        >
          <span className="text-base leading-none">{selected?.flag ?? ''}</span>
          <span className="tabular-nums" dir="ltr">{selected?.dialCode ?? ''}</span>
          <ChevronDown
            className={`w-4 h-4 text-gray-400 transition-transform duration-200 ease-out ${
              open ? 'rotate-180' : ''
            }`}
          />
        </button>

        {/* RIGHT: national number field */}
        <input
          ref={numberRef}
          type="tel"
          inputMode="tel"
          dir="ltr"
          disabled={disabled}
          autoFocus={autoFocus}
          placeholder={numberPlaceholder}
          value={national}
          onChange={handleNumberChange}
          className={`flex-1 min-w-0 h-full bg-transparent px-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none disabled:cursor-not-allowed ${
            isAr ? 'text-right' : 'text-left'
          }`}
        />
      </div>

      {/* Dropdown */}
      {open && (
        <div
          className={`absolute z-50 mt-1 w-full min-w-[16rem] bg-white border border-gray-200 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] overflow-hidden origin-top animate-[phoneDropIn_150ms_ease-out] ${
            isAr ? 'right-0' : 'left-0'
          }`}
          role="listbox"
        >
          {/* Search box */}
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search
                className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none ${
                  isAr ? 'right-3' : 'left-3'
                }`}
              />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className={`w-full h-9 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#FF6B00] focus:ring-1 focus:ring-[#FF6B00] transition-all ${
                  isAr ? 'pr-9 pl-3 text-right' : 'pl-9 pr-3 text-left'
                }`}
              />
            </div>
          </div>

          {/* Scrollable list */}
          <div className="max-h-[260px] overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs font-medium text-gray-400">
                {isAr ? 'لا توجد نتائج' : 'No matches'}
              </div>
            ) : (
              filtered.map((c) => {
                const isSel = c.iso2 === country;
                return (
                  <button
                    key={c.iso2}
                    type="button"
                    role="option"
                    aria-selected={isSel}
                    onClick={() => handleSelectCountry(c.iso2)}
                    className={`flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${
                      isAr ? 'text-right' : 'text-left'
                    } ${isSel ? 'bg-[#FF6B00]/5' : ''}`}
                  >
                    <span className="text-base leading-none shrink-0">{c.flag}</span>
                    <span className="flex-1 min-w-0 truncate text-gray-900">{c.name}</span>
                    <span className="tabular-nums text-gray-500 shrink-0" dir="ltr">
                      {c.dialCode}
                    </span>
                    {isSel && <Check className="w-4 h-4 text-[#FF6B00] shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Keyframes for the smooth ease-out dropdown reveal (no bouncy spring). */}
      <style>{`
        @keyframes phoneDropIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default PhoneInput;
