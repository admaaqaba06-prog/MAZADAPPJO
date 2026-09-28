import React, { useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { Loader2, Eye, AlertCircle } from 'lucide-react';

/**
 * The phone a manual CliQ transfer was sent from — revealed on demand.
 *
 * WHY IT IS NOT JUST A FIELD ON THE ORDER. It used to be. `cliqSenderPhone`
 * sat on `orders/{orderId}`, which grants `allow read` to the buyer AND THE
 * SELLER; Firestore has no field-level read denylist, so a granted read returns
 * every field. The admin UI guarded the display (`isAdmin && ...`), but a
 * seller reading the document directly walked straight past that — and
 * revealCounterpartyContact exists precisely to withhold a counterparty's
 * contact until payment is verified.
 *
 * The full number now lives in `cliqPaymentSenders/{orderId}`, which is
 * `allow read: if isAdmin()`. The order keeps only `cliqSenderPhoneMasked`.
 *
 * ON DEMAND, NOT ON RENDER. Same discipline as SellerContactReveal: a single
 * `getDoc` when an admin actually presses the button, never an `onSnapshot`,
 * and nothing subscribed afterwards. That matters here because the payment
 * queue renders many of these at once — reading every one eagerly would be a
 * read per order per refresh, for a number that is usually not needed.
 *
 * The gate is the RULE, not this component. A non-admin who somehow rendered it
 * gets a permission error from Firestore, not data.
 */
interface Props {
  orderId: string;
  /** `••••123` from the order doc — shown until an admin asks for the rest. */
  masked?: string;
  /** Legacy orders written before the split still carry the full number. */
  legacyFull?: string;
  isAr: boolean;
}

export default function CliqSenderReveal({ orderId, masked, legacyFull, isAr }: Props) {
  const [full, setFull] = useState<string | null>(legacyFull || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  if (!masked && !legacyFull) return null;

  const reveal = async () => {
    if (loading || full) return;
    setLoading(true);
    setError(false);
    try {
      const snap = await getDoc(doc(db, 'cliqPaymentSenders', orderId));
      const value = snap.exists() ? (snap.data().senderPhone as string | undefined) : undefined;
      if (value) setFull(value);
      else setError(true); // pre-split order with no record — say so, don't show a blank
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <p className="text-[10px] text-[#FF6B00] font-mono font-bold mt-1 flex items-center gap-1.5 flex-wrap">
      <span className="text-fg-muted font-semibold">{isAr ? 'مُرسِل كليك:' : 'CliQ from:'}</span>
      <span dir="ltr">{full || masked}</span>
      {!full && (
        <button
          type="button"
          onClick={reveal}
          disabled={loading}
          className="inline-flex items-center gap-1 text-[9px] font-black text-fg-muted hover:text-[#FF6B00] transition-colors cursor-pointer disabled:opacity-50"
          aria-label={isAr ? 'إظهار الرقم كاملاً' : 'Reveal full number'}
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
          <span>{isAr ? 'إظهار' : 'Reveal'}</span>
        </button>
      )}
      {error && (
        <span className="inline-flex items-center gap-1 text-[9px] text-amber-700 font-bold">
          <AlertCircle className="w-3 h-3" />
          {isAr ? 'غير متوفر' : 'not available'}
        </span>
      )}
    </p>
  );
}
