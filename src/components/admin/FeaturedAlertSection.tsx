/**
 * Featured auction alert (CR-03) — admin.
 *
 * DELIBERATELY SEPARATE FROM FeaturedSection, which sits directly above it.
 * That one is merchandising: it pins up to six lots and drags them into an
 * order, and an admin does it casually and often. This one MESSAGES PEOPLE. The
 * two share a word and nothing else, and putting the send behind the same pin
 * control would turn a reordering habit into a broadcast habit.
 *
 * Everything that matters is enforced in the callable, not here: the weekly cap,
 * the required reason, quiet hours, the kill switch. This screen's job is to
 * tell the truth BEFORE the admin invests any effort — the quota is read on
 * mount so a spent cap disables the form and explains itself, rather than
 * letting someone pick a lot, write a reason, and only then be refused.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Megaphone, Search, Loader2, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { getCallableFunction } from '../../services/firebase';
import { useAdminAuctionSearch } from '../../hooks/useAdminAuctionSearch';
import { AuctionItem } from '../../types';

export interface FeaturedAlertSectionProps {
  isAr: boolean;
}

interface Quota {
  used: number;
  max: number;
  capped: boolean;
  nextAllowedAt: number | null;
  message: string | null;
  messageEn: string | null;
}

interface SendSummary {
  sent: number;
  failed: number;
  attempted: number;
  skippedNoMatch: number;
  skippedOptedOut: number;
  skippedNoPhone: number;
  skippedAlreadySent: number;
}

/** Mirrors REASON_MAX in functions/featuredAlert.js. */
const REASON_MAX = 120;

export const FeaturedAlertSection: React.FC<FeaturedAlertSectionProps> = ({ isAr }) => {
  const [term, setTerm] = useState('');
  const [picked, setPicked] = useState<AuctionItem | null>(null);
  const [reason, setReason] = useState('');
  const [sendToAll, setSendToAll] = useState(false);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [busy, setBusy] = useState<null | 'dry' | 'send'>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ dryRun: boolean; summary: SendSummary } | null>(null);

  // Only live lots can be alerted on — the callable refuses anything else, so
  // offering them here would only produce a refusal the admin cannot act on.
  const search = useAdminAuctionSearch(term, ['live']);

  const loadQuota = useCallback(async () => {
    try {
      const fn = await getCallableFunction<Record<string, never>, Quota>('featuredAlertQuota');
      const res = await fn({} as Record<string, never>);
      setQuota(res.data);
    } catch {
      // A quota we cannot read must NOT read as "you have slots". The callable
      // enforces the cap regardless; leaving this null keeps the form usable
      // and lets the real refusal come from the server.
      setQuota(null);
    }
  }, []);

  useEffect(() => {
    void loadQuota();
  }, [loadQuota]);

  const trimmed = reason.trim();
  const capped = quota?.capped === true;
  const canSend = !!picked && trimmed.length >= 3 && trimmed.length <= REASON_MAX && !capped && busy === null;

  const submit = async (dryRun: boolean) => {
    if (!picked) return;
    setBusy(dryRun ? 'dry' : 'send');
    setError(null);
    setResult(null);
    try {
      const fn = await getCallableFunction<
        { auctionId: string; featuredReason: string; sendToAll: boolean; dryRun: boolean },
        { ok: boolean; dryRun: boolean; summary: SendSummary }
      >('broadcastFeaturedAuction');
      const res = await fn({ auctionId: picked.id, featuredReason: trimmed, sendToAll, dryRun });
      setResult({ dryRun: res.data.dryRun, summary: res.data.summary });
      if (!dryRun) await loadQuota();
    } catch (e: any) {
      // The callable puts the human-readable refusal in `message` — including
      // the cap message, which names the date the next alert is allowed.
      setError(e?.message || (isAr ? 'ما قدرنا نبعت التنبيه.' : 'Could not send the alert.'));
      await loadQuota();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="bg-surface-raised border border-line rounded-3xl p-5 space-y-4" id="featured-alert-section">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-[#FF6B00]/10 flex items-center justify-center text-[#FF6B00]">
          <Megaphone className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <h3 className="font-sans font-black text-xs text-fg uppercase tracking-wide">
            {isAr ? 'تنبيه مزاد مميز' : 'Featured auction alert'}
          </h3>
          <p className="text-[10px] text-fg-muted">
            {isAr
              ? 'رسالة واتساب لمرة وحدة عن مزاد يستاهل الوقفة'
              : 'A one-off WhatsApp alert about a standout lot'}
          </p>
        </div>
      </div>

      {/* Quota, stated before anything is typed. */}
      {quota && (
        <div
          className={`rounded-2xl border p-3 text-[11px] font-semibold leading-snug ${
            capped
              ? 'border-amber-500/40 bg-amber-500/10 text-amber-600'
              : 'border-line bg-surface-sunken text-fg-muted'
          }`}
        >
          {capped ? (
            <span className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{isAr ? quota.message : quota.messageEn}</span>
            </span>
          ) : (
            <span>
              {isAr
                ? `استخدمت ${quota.used} من ${quota.max} تنبيهات هذا الأسبوع.`
                : `${quota.used} of ${quota.max} alerts used this week.`}
            </span>
          )}
        </div>
      )}

      {/* Pick the lot. A search box, not a browse list, for the same reason
          FeaturedSection uses one: the admin auctions subscription is capped
          well below the real inventory, so browsing cannot reach most of it. */}
      {picked ? (
        <div className="flex items-center gap-3 rounded-2xl border border-line p-3">
          <img src={picked.thumbnailUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
          <span className="flex-1 min-w-0 text-xs font-bold text-fg truncate">{picked.title}</span>
          <button
            type="button"
            onClick={() => setPicked(null)}
            aria-label={isAr ? 'إلغاء الاختيار' : 'Clear'}
            className="p-1.5 rounded-full text-fg-muted hover:text-fg hover:bg-surface-sunken cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-2xl border border-line px-3 py-2">
            <Search className="w-4 h-4 shrink-0 text-fg-muted" />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder={isAr ? 'دوّر على مزاد مباشر…' : 'Search a live auction…'}
              className="flex-1 min-w-0 bg-transparent text-xs text-fg outline-none"
            />
            {search.loading && <Loader2 className="w-4 h-4 animate-spin text-fg-muted" />}
          </div>
          {search.active && search.results.length > 0 && (
            <div className="max-h-48 overflow-y-auto space-y-1">
              {search.results.slice(0, 8).map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => { setPicked(a); setTerm(''); }}
                  className="w-full flex items-center gap-2 rounded-xl p-2 text-start hover:bg-surface-sunken cursor-pointer"
                >
                  <img src={a.thumbnailUrl} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                  <span className="flex-1 min-w-0 text-[11px] font-semibold text-fg truncate">{a.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* The reason. Required, and short — it renders directly under the
          product name in the message. */}
      <div className="space-y-1">
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={REASON_MAX}
          placeholder={isAr ? 'ليش مميز؟ مثلاً: سعره بادي من ٥ دنانير' : 'Why featured? e.g. starts at 5 JOD'}
          id="featured-alert-reason"
          className="w-full rounded-2xl border border-line bg-surface-sunken px-3 py-2.5 text-xs text-fg outline-none focus:border-[#FF6B00]"
        />
        <p className="text-[10px] text-fg-muted">
          {isAr
            ? `بيظهر بالرسالة تحت اسم المنتج مباشرة · ${trimmed.length}/${REASON_MAX}`
            : `Shown directly under the product name · ${trimmed.length}/${REASON_MAX}`}
        </p>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={sendToAll}
        onClick={() => setSendToAll((v) => !v)}
        className="w-full flex items-center gap-3 rounded-2xl border border-line p-3 text-start cursor-pointer"
      >
        <span className="flex-1 min-w-0 text-[11px] font-semibold text-fg">
          {isAr ? 'ارسال للجميع (تجاهل الاهتمامات)' : 'Send to everyone (ignore interests)'}
        </span>
        <span
          aria-hidden="true"
          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
            sendToAll ? 'bg-[#FF6B00]' : 'bg-fg-muted/30'
          }`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-surface-raised shadow transition-all ${
              sendToAll ? 'start-[1.125rem]' : 'start-0.5'
            }`}
          />
        </span>
      </button>

      {error && (
        <p className="rounded-2xl border border-red-500/40 bg-red-500/10 p-3 text-[11px] font-semibold text-red-500 leading-snug">
          {error}
        </p>
      )}

      {result && (
        <p className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-[11px] font-semibold text-emerald-600 leading-snug flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            {result.dryRun
              ? (isAr ? 'تجربة — ما انبعت إشي. ' : 'Dry run — nothing sent. ')
              : (isAr ? 'انبعت. ' : 'Sent. ')}
            {isAr
              ? `${result.summary.sent} مستلم · ${result.summary.failed} فشل · ${result.summary.skippedNoMatch} ما بتهمهم`
              : `${result.summary.sent} recipients · ${result.summary.failed} failed · ${result.summary.skippedNoMatch} no match`}
          </span>
        </p>
      )}

      <div className="flex gap-2">
        {/* Dry run first is the habit worth building, so it gets equal weight
            in the layout rather than hiding behind the send. */}
        <button
          type="button"
          disabled={!canSend}
          onClick={() => submit(true)}
          className="flex-1 rounded-2xl border border-line py-2.5 text-[11px] font-black text-fg disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          {busy === 'dry' ? (isAr ? 'عم نجرب…' : 'Testing…') : (isAr ? 'تجربة' : 'Dry run')}
        </button>
        <button
          type="button"
          disabled={!canSend}
          onClick={() => submit(false)}
          className="flex-1 rounded-2xl bg-[#FF6B00] py-2.5 text-[11px] font-black text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          {busy === 'send' ? (isAr ? 'عم نبعت…' : 'Sending…') : (isAr ? 'ابعت التنبيه' : 'Send alert')}
        </button>
      </div>
    </div>
  );
};

export default FeaturedAlertSection;
