// CR-01 — the interests grid, notification consent, and save.
//
// ONE component, two mounts. `mode="onboarding"` is the full-screen step a new
// user is routed to after sign-up; `mode="settings"` is the "اهتماماتي" block
// inside Profile. The spec asks the settings screen to reuse this component
// rather than copy it, and that is not tidiness: the settings copy is where a
// user turns the digest OFF, and a drifted second implementation that forgets
// to write `notifyDaily: false` is an opt-out that silently does nothing while
// CR-02 keeps sending.
import React, { useEffect, useMemo, useState } from 'react';
import {
  Car, Smartphone, Cpu, Watch, WashingMachine, Sofa, Building2, Package, Gem,
  Check, Loader2, MessageCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useInterestCategories } from '../hooks/useInterestCategories';
import {
  canContinue,
  sanitizeSelection,
  DEFAULT_NOTIFY_PREFS,
  type InterestCategory,
  type NotifyChannel,
} from '../utils/interests';

/** Icon name -> component. Unknown names fall back rather than crash a grid
 *  built from server data an admin can edit. */
const ICONS: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  Car, Smartphone, Cpu, Watch, WashingMachine, Sofa, Building2, Package, Gem,
};

/** In-progress picks survive a refresh. The acceptance criterion is explicit
 *  about this, and onboarding is exactly where a reload is most likely — it is
 *  the first screen after an OAuth / OTP round trip. */
const DRAFT_KEY = 'mazad_interests_draft';

function readDraft(): { ids: string[]; consent: boolean } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || !Array.isArray(p.ids)) return null;
    return { ids: p.ids.filter((v: unknown) => typeof v === 'string'), consent: p.consent !== false };
  } catch {
    return null;
  }
}

function writeDraft(ids: string[], consent: boolean) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ids, consent }));
  } catch {
    /* private mode / quota — a lost draft is not worth breaking the screen */
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* no-op */
  }
}

interface Props {
  mode: 'onboarding' | 'settings';
  /** Called after a successful save. Onboarding uses it to leave the step. */
  onDone?: () => void;
}

export const InterestsPicker: React.FC<Props> = ({ mode, onDone }) => {
  const { currentUser, language, saveInterests } = useApp();
  const isAr = language !== 'en';
  const { categories, loading } = useInterestCategories();
  const isOnboarding = mode === 'onboarding';

  const saved = useMemo(
    () => (Array.isArray(currentUser?.interests) ? currentUser.interests : []),
    [currentUser],
  );

  const [selected, setSelected] = useState<string[]>([]);
  const [consent, setConsent] = useState<boolean>(DEFAULT_NOTIFY_PREFS.notifyDaily);
  const [busy, setBusy] = useState<null | 'save' | 'skip'>(null);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Seed once the categories are known, so a draft can be validated against
  // what is actually on offer.
  useEffect(() => {
    if (loading || hydrated) return;
    const draft = isOnboarding ? readDraft() : null;
    const base = draft && draft.ids.length > 0 ? draft.ids : saved;
    setSelected(sanitizeSelection(base, categories));
    if (draft) setConsent(draft.consent);
    else if (currentUser && currentUser.notifyDaily !== undefined) setConsent(!!currentUser.notifyDaily);
    setHydrated(true);
  }, [loading, hydrated, categories, saved, isOnboarding, currentUser]);

  // Persist the draft on every change, not on unmount — a refresh, a crash and
  // a backgrounded tab all skip unmount handlers.
  useEffect(() => {
    if (!hydrated || !isOnboarding) return;
    writeDraft(selected, consent);
  }, [selected, consent, hydrated, isOnboarding]);

  const toggle = (id: string) => {
    setError(null);
    setSelected(prev => (prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]));
  };

  const persist = async (ids: string[], skipped: boolean) => {
    setBusy(skipped ? 'skip' : 'save');
    setError(null);
    try {
      // ONE write. The spec forbids writing per card tap, and is right to: the
      // grid is a rapid multi-select, so a write per tap is a burst of document
      // writes plus a live-listener echo on every one of them.
      await saveInterests({
        interests: sanitizeSelection(ids, categories),
        interestsSkipped: skipped,
        notifyDaily: consent,
        notifyFeatured: consent,
        notifyChannel: (consent ? 'whatsapp' : 'none') as NotifyChannel,
      });
      clearDraft();
      if (onDone) onDone();
    } catch {
      setError(isAr ? 'ما زبطت. جرّب كمان مرة.' : 'That did not save. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const heading = isAr ? 'شو بيهمك؟' : 'What are you into?';
  const sub = isAr
    ? 'اختار الفئات الي بتحب تشوف مزاداتها، وبنبعتلك تنبيه أول ما ينزل إشي جديد فيها.'
    : 'Pick the categories you want to see auctions from, and we will alert you the moment something new lands.';

  const grid = (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" id="interests-grid">
      {categories.map((c: InterestCategory) => {
        const Icon = ICONS[c.icon] || Package;
        const on = selected.includes(c.id);
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => toggle(c.id)}
            aria-pressed={on}
            data-interest-id={c.id}
            // Selected state is a 2px orange border AND an orange fill AND a
            // check — the spec calls out that a faint tint is not enough, and
            // on a sunlit phone outdoors it genuinely is not.
            className={`relative flex flex-col items-center justify-center gap-2 rounded-2xl border-2 p-4 min-h-[104px] transition-all cursor-pointer ${
              on
                ? 'border-[#FF6B00] bg-[#FF6B00]/12 text-[#FF6B00] shadow-[0_2px_10px_rgba(255,107,0,0.18)]'
                : 'border-line bg-surface-raised text-fg-muted hover:border-[#FF6B00]/40'
            }`}
          >
            {on && (
              <span
                aria-hidden="true"
                className="absolute top-2 end-2 flex h-5 w-5 items-center justify-center rounded-full bg-[#FF6B00] text-white"
              >
                <Check className="w-3.5 h-3.5" strokeWidth={3} />
              </span>
            )}
            <Icon className="w-7 h-7" strokeWidth={1.9} />
            <span className={`text-[13px] leading-tight text-center ${on ? 'font-bold' : 'font-semibold'}`}>
              {isAr ? c.nameAr : c.nameEn}
            </span>
          </button>
        );
      })}
    </div>
  );

  const consentToggle = (
    <button
      type="button"
      role="switch"
      aria-checked={consent}
      onClick={() => setConsent(v => !v)}
      id="interests-consent-toggle"
      className="w-full flex items-center gap-3 rounded-2xl border border-line bg-surface-raised p-4 text-start cursor-pointer"
    >
      <MessageCircle className="w-5 h-5 shrink-0 text-[#25D366]" strokeWidth={2} />
      <span className="flex-1 min-w-0 text-[13px] font-semibold text-fg leading-snug">
        {isAr
          ? 'ابعتولي تنبيهات على واتساب بالمزادات الجديدة'
          : 'Send me WhatsApp alerts about new auctions'}
      </span>
      <span
        aria-hidden="true"
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          consent ? 'bg-[#FF6B00]' : 'bg-fg-muted/30'
        }`}
      >
        <span
          // The knob takes a THEME TOKEN, not a raw colour: the ratchet in
          // src/theme.guard.test.ts scans raw source (comments included) for
          // hardcoded light-mode backgrounds. The admin switches in
          // SystemSection already use this same token for their knob.
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface-raised shadow transition-all ${
            consent ? 'start-[1.375rem]' : 'start-0.5'
          }`}
        />
      </span>
    </button>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center p-10 text-fg-muted">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  // ---- Settings mount: a block inside Profile, no full-screen chrome. ----
  if (!isOnboarding) {
    const savedConsent = currentUser && currentUser.notifyDaily !== undefined ? !!currentUser.notifyDaily : true;
    const dirty =
      selected.slice().sort().join('|') !== saved.slice().sort().join('|') || consent !== savedConsent;
    return (
      <div className="space-y-4" id="interests-settings">
        {grid}
        {consentToggle}
        {error && <p className="text-[12px] font-semibold text-red-500">{error}</p>}
        <button
          type="button"
          disabled={!dirty || busy !== null}
          onClick={() => persist(selected, false)}
          id="interests-save"
          className="w-full rounded-2xl bg-[#FF6B00] py-3.5 text-sm font-black text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          {busy === 'save' ? (isAr ? 'عم نحفظ…' : 'Saving…') : (isAr ? 'احفظ التغييرات' : 'Save changes')}
        </button>
        {/* Turning the toggle off here is the real opt-out path, so say plainly
            what it does rather than leaving it to the switch alone. */}
        <p className="text-[11px] text-fg-muted leading-snug">
          {isAr
            ? 'لما تطفي التنبيهات، بنوقف نبعتلك الملخص اليومي وتنبيهات المزادات المميزة.'
            : 'Turning alerts off stops both the daily digest and featured-auction alerts.'}
        </p>
      </div>
    );
  }

  // ---- Onboarding mount: the full-screen step. ----
  return (
    <div
      className="flex h-full w-full flex-col overflow-y-auto bg-surface px-5 pt-8 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]"
      id="onboarding-interests"
    >
      <div className="mx-auto w-full max-w-lg flex-1 flex flex-col">
        <h1 className="text-[26px] font-black leading-tight text-fg">{heading}</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-fg-muted">{sub}</p>

        <div className="mt-6">{grid}</div>

        <div className="mt-5">{consentToggle}</div>

        {error && <p className="mt-3 text-[12px] font-semibold text-red-500">{error}</p>}

        {/* Footer pinned to the bottom of the scroll content rather than
            position:fixed, which would fight the scroll container on a small
            screen with a long grid. */}
        <div className="mt-auto pt-6 space-y-3">
          <button
            type="button"
            disabled={!canContinue(selected) || busy !== null}
            onClick={() => persist(selected, false)}
            id="interests-continue"
            className="w-full rounded-2xl bg-[#FF6B00] py-4 text-base font-black text-white transition-opacity disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {busy === 'save' ? (isAr ? 'عم نحفظ…' : 'Saving…') : (isAr ? 'يلا نبلش' : 'Continue')}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => persist([], true)}
            id="interests-skip"
            className="w-full py-2 text-sm font-bold text-fg-muted disabled:opacity-40 cursor-pointer"
          >
            {busy === 'skip' ? (isAr ? 'لحظة…' : 'One moment…') : (isAr ? 'تخطي الآن' : 'Skip for now')}
          </button>
        </div>
      </div>
    </div>
  );
};
