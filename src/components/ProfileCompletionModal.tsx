import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useToast } from './feedback';
import { translations } from '../utils/translations';
import { JORDAN_GOVERNORATES, isProfileComplete, isValidCityId, needsName } from '../utils/jordanCities';
import { UserRound, MapPin, Mail, ArrowRight, ArrowLeft } from 'lucide-react';

/**
 * Auth/KYC Wave 2: mandatory profile-completion gate.
 *
 * Rendered by App.tsx AFTER the authReady gate for an authenticated user whose
 * profile is incomplete (see isProfileComplete). Deliberately NON-dismissable:
 * no backdrop close, no X — name + city are required on all paths before the
 * marketplace opens. Only the MISSING fields render:
 *  - Name:  phone signups arrive as the 'User' placeholder; Google users skip.
 *  - City:  required for everyone (no signup path collects it).
 *  - Email: optional, receipts only, shown only when the account has none.
 */
export const ProfileCompletionModal: React.FC = () => {
  const { currentUser, updateOwnProfile, language } = useApp();
  const { showToast } = useToast();
  const t = translations[language as 'en' | 'ar'];
  const isAr = language === 'ar';

  // Shared rule (jordanCities.needsName): blank, the 'User' placeholder, or a
  // phone-number-looking name all require a real name to be entered here.
  const showNameField = needsName(currentUser);
  const needsEmail = !currentUser?.email;

  const [name, setName] = useState('');
  // Seed from the account when it already holds a valid governorate id (e.g.
  // a user with a real city but a placeholder name shouldn't re-pick it).
  const [city, setCity] = useState(() =>
    currentUser?.city && isValidCityId(currentUser.city) ? currentUser.city : ''
  );
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  // Safety valve: if completeness flips while mounted (e.g. another tab saved),
  // render nothing — App.tsx unmounts us on the next currentUser update anyway.
  if (isProfileComplete(currentUser)) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    if (showNameField && !name.trim()) {
      setFieldError(t.profileNameRequired);
      return;
    }
    if (!city) {
      setFieldError(t.profileCityRequired);
      return;
    }
    setFieldError(null);
    setSaving(true);
    try {
      const fields: { name?: string; city?: string; email?: string } = { city };
      if (showNameField) fields.name = name.trim();
      if (needsEmail && email.trim()) fields.email = email.trim();

      const result = await updateOwnProfile(fields);
      if (!result.success) {
        showToast({
          title: t.profileSaveFailedTitle,
          message: t.profileSaveFailedMsg,
          type: 'warn',
        });
      }
      // On success the mirrored currentUser makes isProfileComplete true and
      // App.tsx unmounts this modal — no local "open" state to close.
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div
        className="relative bg-surface-raised text-fg w-full max-w-sm rounded-3xl overflow-hidden flex flex-col shadow-2xl animate-in scale-in duration-200 p-6 md:p-8"
        style={{ direction: isAr ? 'rtl' : 'ltr' }}
        id="profile-completion-modal"
        role="dialog"
        aria-modal="true"
      >
        {/* Headline */}
        <div className="text-center space-y-3 mb-6">
          <div className="mx-auto w-11 h-11 rounded-full bg-orange-50 border border-orange-200/50 flex items-center justify-center text-[#FF6B00]">
            <UserRound className="w-6 h-6" />
          </div>
          <h2 className="text-lg md:text-xl font-black text-fg tracking-tight leading-snug">
            {t.profileCompleteTitle}
          </h2>
          <p className="text-xs text-fg-muted max-w-xs mx-auto leading-normal">
            {t.profileCompleteSubtitle}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Name — only when the account still has the placeholder */}
          {showNameField && (
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold text-fg-muted uppercase tracking-wider flex items-center gap-1.5">
                <UserRound className="w-3.5 h-3.5" />
                {t.profileNameLabel}
              </span>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t.profileNamePlaceholder}
                autoComplete="name"
                className="w-full border border-line rounded-xl px-3.5 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/40 focus:border-[#FF6B00] bg-surface-sunken"
                id="profile-completion-name"
              />
            </label>
          )}

          {/* City — required on ALL paths */}
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold text-fg-muted uppercase tracking-wider flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" />
              {t.profileCityLabel}
            </span>
            <select
              value={city}
              onChange={e => setCity(e.target.value)}
              className="w-full border border-line rounded-xl px-3.5 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/40 focus:border-[#FF6B00] bg-surface-sunken appearance-none cursor-pointer"
              id="profile-completion-city"
            >
              <option value="" disabled>
                {t.profileCityPlaceholder}
              </option>
              {JORDAN_GOVERNORATES.map(g => (
                <option key={g.id} value={g.id}>
                  {isAr ? g.ar : g.en}
                </option>
              ))}
            </select>
          </label>

          {/* Email — optional, receipts only, only when account has none */}
          {needsEmail && (
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold text-fg-muted uppercase tracking-wider flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" />
                {t.profileEmailLabel}
                <span className="normal-case font-medium text-fg-muted tracking-normal">
                  ({t.profileEmailHint})
                </span>
              </span>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder={t.profileEmailPlaceholder}
                autoComplete="email"
                dir="ltr"
                className="w-full border border-line rounded-xl px-3.5 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/40 focus:border-[#FF6B00] bg-surface-sunken text-left"
                id="profile-completion-email"
              />
            </label>
          )}

          {fieldError && (
            <p className="text-xs font-bold text-red-500 -mt-1" role="alert">
              {fieldError}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-[#FF6B00] text-white font-black text-xs py-3.5 rounded-xl shadow-[0_4px_16px_rgba(255,107,0,0.25)] hover:brightness-105 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            id="profile-completion-submit"
          >
            <span>{saving ? t.profileSaving : t.profileSaveBtn}</span>
            {!saving && (isAr ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />)}
          </button>
        </form>
      </div>
    </div>
  );
};
