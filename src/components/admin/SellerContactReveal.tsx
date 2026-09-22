import React, { useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { Phone, Loader2, AlertCircle } from 'lucide-react';

/**
 * "Who listed this, and how do I reach them?" — inside the admin dashboard.
 *
 * WHY THIS EXISTS. That question had no answer in the product. Auction Lookup
 * shows `sellerName` and nothing else; the Members list shows a name without a
 * phone. An admin who needed to call a seller about their listing had to run a
 * script with a service-account key, which is a lot of ceremony for the most
 * ordinary operational task there is.
 *
 * TWO READS, ON DEMAND, ONLY WHEN ASKED. The search index deliberately does NOT
 * carry `sellerId` — it is queried with a public search-only key, and putting
 * user ids in a publicly-searchable index invites enumeration. So the id is
 * resolved from the auction document instead:
 *
 *   auctions/{auctionId}.sellerId  ->  users/{sellerId}
 *
 * Both are `getDoc`, never `onSnapshot`. AuctionLookupSection documents itself
 * as creating no Firestore listeners, and this keeps that true: nothing is read
 * until an admin presses the button, and nothing stays subscribed afterwards.
 *
 * Rules already allow exactly this and nothing more: `auctions` is
 * `allow read: if true`, and `users` is `allow read: if isSignedIn() &&
 * (isOwner(userId) || isAdmin())`. A non-admin who somehow rendered this
 * component would get a permission error from Firestore, not data — the gate is
 * the rule, not this UI.
 */

interface Props {
  auctionId: string;
  isAr: boolean;
}

interface Contact {
  name: string | null;
  phone: string | null;
  transferPhone: string | null;
  email: string | null;
  city: string | null;
  isBlocked: boolean;
  uid: string;
}

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; contact: Contact }
  | { kind: 'missing'; reason: 'no-auction' | 'no-seller-id' | 'no-user-doc'; uid?: string }
  | { kind: 'error'; message: string };

const clean = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length > 0 ? s : null;
};

export const SellerContactReveal: React.FC<Props> = ({ auctionId, isAr }) => {
  const [state, setState] = useState<State>({ kind: 'idle' });

  const reveal = async () => {
    setState({ kind: 'loading' });
    try {
      const auctionSnap = await getDoc(doc(db, 'auctions', auctionId));
      if (!auctionSnap.exists()) {
        setState({ kind: 'missing', reason: 'no-auction' });
        return;
      }
      const a = auctionSnap.data() || {};
      // `sellerId` is the REAL creating uid even on Mazad's own drops, which is
      // why it is preferred over any display identity. `createdById` is the
      // fallback for older documents written before sellerId was standard.
      const uid = clean(a.sellerId) || clean(a.createdById);
      if (!uid) {
        setState({ kind: 'missing', reason: 'no-seller-id' });
        return;
      }

      const userSnap = await getDoc(doc(db, 'users', uid));
      if (!userSnap.exists()) {
        // Reported, never invented. The courier card in OurDropsSection
        // substitutes a plausible-looking fake number when the user document is
        // missing; an admin acting on a fabricated contact is worse than an
        // admin who knows there is nothing to act on.
        setState({ kind: 'missing', reason: 'no-user-doc', uid });
        return;
      }
      const u = userSnap.data() || {};
      setState({
        kind: 'ok',
        contact: {
          uid,
          name: clean(u.name),
          phone: clean(u.phoneNumber) || clean(u.phone),
          transferPhone: clean(u.transferPhone),
          email: clean(u.email),
          city: clean(u.city),
          isBlocked: u.isBlocked === true,
        },
      });
    } catch (e: unknown) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  if (state.kind === 'idle') {
    return (
      <button
        type="button"
        onClick={reveal}
        className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-black text-fg-muted hover:text-accent transition-colors cursor-pointer"
      >
        <Phone className="w-3 h-3" aria-hidden="true" />
        {isAr ? 'إظهار بيانات البائع' : 'Show seller contact'}
      </button>
    );
  }

  if (state.kind === 'loading') {
    return (
      <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-fg-muted">
        <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
        {isAr ? 'جارٍ الجلب…' : 'Loading…'}
      </p>
    );
  }

  if (state.kind === 'error') {
    return (
      <p className="mt-2 inline-flex items-start gap-1.5 text-[11px] font-bold text-rose-600">
        <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" />
        <span>{isAr ? 'تعذّر الجلب' : 'Lookup failed'} — {state.message}</span>
      </p>
    );
  }

  if (state.kind === 'missing') {
    const msg =
      state.reason === 'no-auction'
        ? (isAr ? 'لم يُعثر على المزاد.' : 'Auction not found.')
        : state.reason === 'no-seller-id'
          ? (isAr ? 'هذا المزاد لا يحمل معرّف بائع.' : 'This auction carries no seller id.')
          : (isAr
              ? `لا يوجد حساب لهذا المعرّف (${state.uid}) — لا توجد بيانات تواصل.`
              : `No user document for ${state.uid} — there is nothing to contact.`);
    return (
      <p className="mt-2 inline-flex items-start gap-1.5 text-[11px] font-bold text-amber-700">
        <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" />
        <span>{msg}</span>
      </p>
    );
  }

  const c = state.contact;
  const Row = ({ label, value, href }: { label: string; value: string | null; href?: string }) =>
    value ? (
      <p className="text-[11px] font-bold text-fg-muted">
        {label}:{' '}
        {href ? (
          <a href={href} dir="ltr" className="text-accent hover:underline font-black">{value}</a>
        ) : (
          <span className="text-fg" dir="ltr">{value}</span>
        )}
      </p>
    ) : null;

  return (
    <div className="mt-2 rounded-xl bg-surface-sunken/70 border border-line/60 p-2.5 space-y-1">
      <Row label={isAr ? 'الاسم' : 'Name'} value={c.name} />
      {/* tel: and mailto: so a phone taps straight through to a call. */}
      <Row label={isAr ? 'الهاتف' : 'Phone'} value={c.phone} href={c.phone ? `tel:${c.phone}` : undefined} />
      {c.transferPhone && c.transferPhone !== c.phone ? (
        <Row label={isAr ? 'كليك' : 'CliQ'} value={c.transferPhone} />
      ) : null}
      <Row label={isAr ? 'البريد' : 'Email'} value={c.email} href={c.email ? `mailto:${c.email}` : undefined} />
      <Row label={isAr ? 'المدينة' : 'City'} value={c.city} />
      {!c.phone && !c.email ? (
        <p className="text-[11px] font-bold text-amber-700">
          {isAr ? 'لا يوجد هاتف ولا بريد على هذا الحساب.' : 'This account has neither a phone nor an email.'}
        </p>
      ) : null}
      {c.isBlocked ? (
        <p className="text-[11px] font-black text-rose-600">
          {isAr ? '⚠ هذا الحساب محظور' : '⚠ This account is blocked'}
        </p>
      ) : null}
    </div>
  );
};

export default SellerContactReveal;
