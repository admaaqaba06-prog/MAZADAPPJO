/**
 * Wave 4 — "Our drops": Mazad's own inventory pipeline.
 *
 * Was LaunchSection, which mixed two unrelated jobs — building and launching
 * MAZAD's own auctions (operator work) with approving CUSTOMERS' submitted lots
 * (refereeing). MJ named that as one of the confusing tabs. The approval queue
 * is now an `approve_listing` row in the Action Center, where every other
 * needs-a-human item lives; what remains here is planned work you come to
 * deliberately, not an exception that comes to you.
 */
import React, { useState, useEffect } from 'react';
import { Tv, CheckCircle, Trash2 } from 'lucide-react';
import { AdminListSkeleton, EmptyState } from '../FeedbackStates';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../services/firebase';
import type { ViewingMode } from '../../utils/viewing';
import { DIRECTORY_CHUNK, directoryPage, truncation } from '../../utils/adminDirectory';
import { ViewingSelector } from './ViewingSelector';

/**
 * Launch (Job 6): the seller-listing lifecycle console — behavior-preserving
 * extraction of the former `listings` tab body. Three sub-lists (pending
 * approval, completed auctions + escrow-repair tools, master directory) plus a
 * prominent "create auction drop" CTA at the top. Purely presentational; every
 * write handler is injected from the shell and invoked byte-identically. The
 * only local state is `repairResults` (used solely here); the reject-reason
 * draft state is shared with Payouts and therefore injected. Handler props are
 * aliased to their original names so the moved JSX is unchanged.
 */

// Moved verbatim from AdminDashboardView (used only by this section): the
// per-auction live escrow telemetry panel.
const AuctionEscrowDiagnosticPanel: React.FC<{
  auctionId: string;
  winnerId: string | null;
  repairResult: string | null;
}> = ({ auctionId, winnerId, repairResult }) => {
  const [escrows, setEscrows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // Collapsed by default, and the subscription only opens when it is. This
  // panel used to mount for EVERY completed lot in the directory, each opening
  // its own onSnapshot on `escrows` — one listener per lot, all of them live,
  // none of them read unless an admin actually looked. Harmless at today's 1
  // completed lot in the window; linear in completed lots as volume grows,
  // which is exactly the "handle hundreds without slowing down" ask (#207).
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const escrowsRef = collection(db, 'escrows');
    const q = query(escrowsRef, where('auctionId', '==', auctionId));
    
    const unsub = onSnapshot(q, (snap) => {
      const list: any[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() });
      });
      setEscrows(list);
      setLoading(false);
    }, (err) => {
      console.error("Error subscribing to escrows for diagnostics:", err);
      setLoading(false);
    });
    
    return unsub;
  }, [auctionId, open]);

  const lockedEscrows = escrows.filter(e => e.status === 'locked');
  const losingLockedEscrows = lockedEscrows.filter(e => winnerId ? e.bidderId !== winnerId : true);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full mt-3 bg-zinc-50 border border-dashed border-zinc-200 rounded-xl p-2.5 text-[10px] font-mono font-bold uppercase text-zinc-500 hover:text-zinc-800 hover:border-zinc-300 transition-colors cursor-pointer"
      >
        🛡️ Show escrow diagnostics
      </button>
    );
  }

  return (
    <div className="bg-zinc-50 border border-dashed border-zinc-200 rounded-xl p-4 mt-3 text-xs space-y-3">
      <div className="flex items-center justify-between border-b border-zinc-200 pb-2">
        <span className="font-extrabold text-zinc-700 tracking-wide font-mono text-[10px] uppercase">
          🛡️ Admin Diagnostic Panel
        </span>
        <button
          onClick={() => setOpen(false)}
          className="bg-zinc-200/60 text-zinc-600 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold hover:bg-zinc-300 transition-colors cursor-pointer"
        >
          LIVE TELEMETRY — HIDE
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <p className="text-zinc-500 font-medium font-sans">Locked Escrows Count:</p>
          <p className="font-mono text-sm font-black text-zinc-900">
            {lockedEscrows.length} {lockedEscrows.length > 0 ? '🔒' : '✅'}
          </p>
        </div>

        <div className="space-y-1">
          <p className="text-zinc-500 font-medium font-sans">Winner ID (Kept Locked):</p>
          <p className="font-mono text-[10px] font-semibold text-zinc-800 break-all">
            {winnerId ? `🏆 ${winnerId}` : 'None / No Bids'}
          </p>
        </div>
      </div>

      <div className="space-y-1.5 pt-1">
        <p className="text-zinc-500 font-medium font-sans">Losing Locked Escrows ({losingLockedEscrows.length}):</p>
        {loading ? (
          <p className="text-zinc-400 font-mono text-[10px] animate-pulse">Loading escrows...</p>
        ) : losingLockedEscrows.length === 0 ? (
          <p className="text-emerald-600 font-bold text-[11px] font-sans">✅ All losing escrows refunded/released</p>
        ) : (
          <div className="bg-surface-raised border border-line rounded-lg p-2.5 max-h-36 overflow-y-auto space-y-1.5 font-mono text-[10px]">
            {losingLockedEscrows.map((e) => (
              <div key={e.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-zinc-100 last:border-0 pb-1.5 last:pb-0">
                <div className="min-w-0">
                  <span className="font-bold text-zinc-800">{e.bidderName || 'Bidder'}</span>
                  <span className="text-zinc-400 text-[9px] block truncate max-w-[200px]">{e.bidderId}</span>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-rose-500 font-black">{(e.amount || 0).toLocaleString()} JOD</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {repairResult && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3 font-medium text-[11px] leading-relaxed font-sans">
          <strong className="block mb-1 text-amber-950">🔧 Repair Action Result:</strong>
          {repairResult}
        </div>
      )}
    </div>
  );
};

export interface OurDropsSectionProps {
  isAr: boolean;
  isLoading: boolean;
  auctions: any[];              // the CAPPED admin window (ADMIN_AUCTIONS_CAP), not every auction
  auctionsTotalCount: number | null; // true collection size, so the cap can be shown rather than hidden
  orders: any[];                // realOrders — for the "order already exists" repair guard
  users: any[];                 // for winner contact lookup
  rejectingId: string | null;
  setRejectingId: (id: string | null) => void;
  rejectionReason: string;
  setRejectionReason: (reason: string) => void;
  onRepairOrder: (auctionId: string) => Promise<{ success: boolean; message?: string }>;     // repairEndedAuctionOrder
  onRepairEscrow: (auctionId: string) => Promise<{ success: boolean; message?: string }>;    // repairStuckEscrowsForEndedAuction
  onDeleteAuction: (auctionId: string) => void | Promise<any>;                               // deleteAuction
  onSetViewing: (auctionId: string, viewing: ViewingMode | '', viewingPlace: string) => Promise<{ success: boolean; message?: string }>; // setAuctionViewing
  onCreateDrop: () => void;                                                                   // setActiveView('auction-drop-builder')
}

export const OurDropsSection: React.FC<OurDropsSectionProps> = ({
  isAr,
  isLoading,
  auctions,
  auctionsTotalCount,
  orders,
  users,
  rejectingId,
  setRejectingId,
  rejectionReason,
  setRejectionReason,
  onRepairOrder,
  onRepairEscrow,
  onDeleteAuction,
  onSetViewing,
  onCreateDrop,
}) => {
  const [repairResults, setRepairResults] = useState<Record<string, string>>({});
  // The master directory renders one DIRECTORY_CHUNK at a time. It used to
  // render the whole capped array — fine at 100 rows, but each row carries an
  // image and the cap is the only thing that was bounding the DOM.
  const [directoryPages, setDirectoryPages] = useState(1);
  // Per-lot viewing, chosen per pending card before approving. Local because no
  // other surface needs it. Keyed by auction id so several cards can be staged
  // independently. Unset = approve without stating viewing (renders nothing).
  // Master-directory viewing CORRECTION (distinct from the staging state above,
  // which belongs to the pending-approval cards). Keyed by auction id; a row is
  // only in the map while its editor is open.
  const [editViewingId, setEditViewingId] = useState<string | null>(null);
  const [editViewing, setEditViewing] = useState<ViewingMode | ''>('');
  const [editPlace, setEditPlace] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editResult, setEditResult] = useState<string | null>(null);

  const [viewingById, setViewingById] = useState<Record<string, ViewingMode>>({});
  const [viewingPlaceById, setViewingPlaceById] = useState<Record<string, string>>({});
  // Per-lot quality checklist — the admin must tick all three before the
  // APPROVE button un-greys. Keyed by auction id (mirrors viewingById) so each
  // pending card tracks its own confirmations independently. Absent = all false.
  type LotChecklist = { photo: boolean; category: boolean; name: boolean };
  const [checklistById, setChecklistById] = useState<Record<string, LotChecklist>>({});
  // Drop a lot's ticks once a verdict is in — a resubmitted listing reuses the
  // same doc id, so stale ticks must not carry over onto the fresh card.
  const clearChecklist = (auctionId: string) => {
    setChecklistById((prev) => {
      if (!(auctionId in prev)) return prev;
      const updated = { ...prev };
      delete updated[auctionId];
      return updated;
    });
  };
  // A resubmitted listing reuses the same doc id, so a staged choice left over
  // from the previous version would sit pre-selected on the new card and an
  // inattentive approve would write a claim meant for the old lot. Drop the
  // staged choice once a verdict is in — approve or reject.
  const clearStagedViewing = (auctionId: string) => {
    setViewingById((prev) => {
      if (!(auctionId in prev)) return prev;
      const updated = { ...prev };
      delete updated[auctionId];
      return updated;
    });
    setViewingPlaceById((prev) => {
      if (!(auctionId in prev)) return prev;
      const updated = { ...prev };
      delete updated[auctionId];
      return updated;
    });
  };
  // Aliases keep the moved JSX byte-identical to the former listings body.
  const repairEndedAuctionOrder = onRepairOrder;
  const repairStuckEscrowsForEndedAuction = onRepairEscrow;
  const deleteAuction = onDeleteAuction;

  return (
    <div className="space-y-6">
      {/* Create auction drop — primary CTA (was the standalone nav button) */}
      <button
        type="button"
        onClick={onCreateDrop}
        className="w-full flex items-center justify-center gap-2 bg-[#FF6B00] hover:bg-orange-500 text-white font-black text-sm py-3.5 rounded-2xl transition-all shadow-sm"
      >
        <span>{isAr ? '＋ إنشاء مزاد جديد' : '＋ Create auction drop'}</span>
      </button>
            
            {/* Header */}
            <div className="bg-surface-raised border border-line p-5 rounded-2xl shadow-xs">
              <h3 className="text-xs font-extrabold text-fg flex items-center gap-2">
                <Tv className="w-4 h-4 text-[#FF6B00]" />
                {isAr ? 'مزادات مزاد جو' : 'OUR DROPS'}
              </h3>
              <p className="text-[11px] text-fg-muted mt-1">
                {isAr
                  ? 'ابنِ مزادات مزاد جو وجدولها وأطلقها. مراجعة مزادات البائعين انتقلت إلى مركز الإجراءات.'
                  : "Build, schedule and launch Mazad's own auctions. Reviewing sellers' lots moved to the Action Center."}
              </p>
            </div>

            {/* List 2: Concluded Auctions Fulfillments */}
            <div className="space-y-3 pt-4 border-t border-line">
              <h3 className="text-[11px] font-black text-fg-muted uppercase tracking-widest px-0.5 flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                {isAr ? 'المزادات المنتهية والترتيبات اللوجستية' : 'RECENTLY COMPLETED AUCTIONS & FULFILLMENT'}
              </h3>

              {(() => {
                // `typeof === 'number'` before the comparison: an awaiting-first-bid
                // lot now carries endTime null, and `null < Date.now()` is true —
                // which would list a lot that has not started under COMPLETED.
                const completedAuctions = auctions.filter(a => a.status === 'completed' || (a.status === 'live' && typeof a.endTime === 'number' && a.endTime < Date.now()));
                
                if (completedAuctions.length === 0) {
                  return (
                    <div className="text-center py-10 bg-surface-raised border border-line rounded-2xl p-6 text-fg-muted text-xs shadow-xs">
                      {isAr ? 'لم ينتهِ أي مزاد بعد في النظام لتسجيل فائزين.' : 'No auctions have closed yet.'}
                    </div>
                  );
                }

                return (
                  <div className="space-y-4">
                    {completedAuctions.map((item) => {
                      const winnerUser = users.find(u => u.id === item.currentBidderId);
                      const winnerNameStr = winnerUser?.name || item.currentBidderName || (isAr ? 'لا يوجد مزايدين' : 'No bids placed');
                      const winnerPhoneStr = winnerUser?.phoneNumber || winnerUser?.transferPhone || (item.currentBidderId ? '+962 7 9888 1234' : 'N/A');
                      const winnerEmailStr = winnerUser?.email || (item.currentBidderId ? 'winner@example.com' : 'N/A');
                      const winnerCityStr = winnerUser?.city || (item.currentBidderId ? 'Amman' : 'N/A');

                      return (
                        <div key={item.id} className="bg-surface-raised border border-line p-5 rounded-2xl space-y-4 shadow-xs">
                          {/* Minimal item tag */}
                          <div className="flex gap-3 items-center">
                            <img src={item.thumbnailUrl} alt="Cover" className="w-11 h-11 rounded-lg object-cover border border-line shrink-0" />
                            <div className="min-w-0 flex-1">
                              <h4 className="font-extrabold text-xs text-fg truncate leading-none mt-1">{item.title}</h4>
                              <p className="text-[11px] text-fg-muted mt-2 font-mono">
                                {isAr ? 'السعر النهائي المبيع: ' : 'Winning Bid: '}
                                <strong className="text-emerald-600 font-extrabold">{item.currentPrice.toLocaleString()} JOD</strong>
                                {item.vendorName && (
                                  <span className="text-fg-muted"> · {isAr ? 'المورّد: ' : 'Vendor: '}{item.vendorName}</span>
                                )}
                              </p>
                            </div>
                          </div>

                          {/* Winner Details Card - Plain clear details for courier */}
                          {item.currentBidderId ? (
                            <div className="bg-emerald-50/30 border border-emerald-100 rounded-xl p-3.5 space-y-3">
                              <span className="text-[9px] font-black text-emerald-800 uppercase tracking-widest font-mono block">
                                🏆 {isAr ? 'بيانات التوصيل والتواصل مع المشري الفائز' : '🏆 CLIENT SHIPMENT & COORDINATES'}
                              </span>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs leading-normal">
                                <div>
                                  <span className="text-fg-muted text-[9px] uppercase font-mono block mb-0.5">{isAr ? 'اسم العميل الفائز:' : 'FULL NAME'}</span>
                                  <span className="font-bold text-fg">{winnerNameStr}</span>
                                </div>
                                <div>
                                  <span className="text-fg-muted text-[9px] uppercase font-mono block mb-0.5">{isAr ? 'رقم الهاتف للتوصيل:' : 'TELEPHONE'}</span>
                                  <a href={`tel:${winnerPhoneStr}`} className="font-black text-[#FF6B00] hover:underline font-mono">{winnerPhoneStr}</a>
                                </div>
                                <div className="sm:mt-1">
                                  <span className="text-fg-muted text-[9px] uppercase font-mono block mb-0.5">{isAr ? 'البريد الإلكتروني:' : 'EMAIL'}</span>
                                  <span className="font-medium text-fg font-mono truncate block">{winnerEmailStr}</span>
                                </div>
                                <div className="sm:mt-1">
                                  <span className="text-fg-muted text-[9px] uppercase font-mono block mb-0.5">{isAr ? 'المدينة والمنطقة:' : 'REGION'}</span>
                                  <span className="font-bold text-fg">{winnerCityStr}</span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs text-amber-800 italic bg-amber-50/50 p-3 rounded-xl border border-amber-100">
                              {isAr ? 'انتهى هذا المزاد دون الحصول على أي عطاءات.' : 'Closed with zero bids.'}
                            </div>
                          )}

                          {item.currentBidderId && (
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                              <span className="text-[10px] text-fg-muted font-mono uppercase font-bold tracking-wider">Escrow Locked 🔒</span>
                              <div className="flex items-center gap-2">
                                {!orders.some(o => o.auctionId === item.id) && (
                                  <button 
                                    onClick={async () => {
                                      const res = await repairEndedAuctionOrder(item.id);
                                      if (res.success) {
                                        alert(res.message);
                                      } else {
                                        alert("Error: " + res.message);
                                      }
                                    }}
                                    className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-extrabold text-[11px] rounded-xl transition-all"
                                  >
                                    {isAr ? 'إصلاح وإنشاء طلب 🔧' : 'REPAIR ORDER 🔧'}
                                  </button>
                                )}
                                <button 
                                  onClick={async () => {
                                    if (confirm(isAr ? 'هل أنت متأكد من تسوية الضمانات العالقة للمزايدين الخاسرين في هذا المزاد؟' : 'Are you sure you want to repair stuck escrows for losing bidders in this auction?')) {
                                      const res = await repairStuckEscrowsForEndedAuction(item.id);
                                      if (res.success) {
                                        setRepairResults(prev => ({ ...prev, [item.id]: res.message || "Successfully repaired!" }));
                                        alert(res.message);
                                      } else {
                                        setRepairResults(prev => ({ ...prev, [item.id]: "Error: " + res.message }));
                                        alert("Error: " + res.message);
                                      }
                                    }
                                  }}
                                  className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-[11px] rounded-xl transition-all"
                                >
                                  {isAr ? 'إرجاع الضمانات العالقة 🔒' : 'REPAIR ESCROWS 🔒'}
                                </button>
                                <button 
                                  onClick={() => alert(isAr ? `تم نسخ معلومات الفائز وتأكيد بوليصة شحن المزاد بانتظار تسليم شركة الشحن في ${winnerCityStr}.` : `Copied winner’s shipping coordinates for Jordan regional dispatch!`)}
                                  className="px-3.5 py-1.5 bg-gray-900 hover:bg-gray-800 text-white font-extrabold text-[11px] rounded-xl transition-all"
                                >
                                  {isAr ? 'نسخ بيانات الشحن والتنسيق ✈️' : 'DISPATCH LOT ✈️'}
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Temporary admin-only diagnostic panel.
                              A live second-chance offer names the runner-up, and
                              currentBidderId still names the defaulter it replaced —
                              so previewing off currentBidderId showed the admin
                              "we will refund the runner-up" immediately before the
                              server correctly did the opposite. */}
                          <AuctionEscrowDiagnosticPanel
                            auctionId={item.id}
                            winnerId={
                              (item.secondChanceOffer?.status === 'pending_seller' ||
                               item.secondChanceOffer?.status === 'pending_buyer' ||
                               item.secondChanceOffer?.status === 'confirmed')
                                ? (item.secondChanceOffer?.bidderId || null)
                                : (item.currentBidderId || null)
                            }
                            repairResult={repairResults[item.id] || null}
                          />
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* List 3: Master listings deletion */}
            <div className="space-y-3 pt-4 border-t border-line">
              <h3 className="text-[11px] font-black text-fg-muted uppercase tracking-widest px-0.5 flex items-center gap-1.5">
                <Trash2 className="w-4 h-4 text-red-600" />
                {isAr ? 'قائمة التحكم السريع وحذف المزادات' : 'MASTER PLATFORM LISTINGS DIRECTORY'}
              </h3>

              {(() => {
                const cut = truncation(auctions.length, auctionsTotalCount);
                if (!cut.truncated) return null;
                return (
                  <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-2.5 text-[11px] font-semibold">
                    {isAr
                      ? `يعرض ${auctions.length} من ${auctionsTotalCount} — ${cut.hidden} غير محمّلة. استخدم البحث للوصول إليها.`
                      : `Showing ${auctions.length} of ${auctionsTotalCount} — ${cut.hidden} not loaded. Use Auction Lookup to reach them.`}
                  </div>
                );
              })()}

              {auctions.length === 0 ? (
                <div className="text-center py-8 bg-surface-raised border border-line rounded-2xl p-4 text-fg-muted text-xs shadow-xs">
                  {isAr ? 'لا توجد مزادات في قاعدة البيانات.' : 'No registered entries found.'}
                </div>
              ) : (
                <div className="bg-surface-raised border border-line rounded-2xl divide-y divide-line overflow-hidden shadow-xs">
                  {directoryPage<any>(auctions, directoryPages).rows.map((item: any) => {
                    let statusLabel = item.status.toUpperCase();
                    let statusColor = 'bg-surface-sunken text-fg-muted';
                    if (item.status === 'live') {
                      statusLabel = isAr ? 'مباشر الآن 🟢' : 'LIVE';
                      statusColor = 'bg-emerald-50 text-emerald-800 border border-emerald-100';
                    } else if (item.status === 'processing' || item.status === 'pending') {
                      statusLabel = isAr ? 'قيد المراجعة ⏳' : 'PENDING';
                      statusColor = 'bg-amber-50 text-amber-800 border border-amber-100';
                    } else if (item.status === 'completed') {
                      statusLabel = isAr ? 'منتهي 🏆' : 'CLOSED';
                      statusColor = 'bg-blue-50 text-blue-800 border border-blue-100';
                    }

                    const editing = editViewingId === item.id;

                    return (
                      <div key={item.id} className="text-left transition-colors hover:bg-surface-sunken/55">
                      <div className="p-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <img 
                            src={item.thumbnailUrl} 
                            alt={item.title} 
                            className="w-10 h-10 rounded-lg object-cover border border-line shrink-0" 
                          />
                          <div className="min-w-0 flex-1">
                            <h4 className="font-extrabold text-[12px] text-fg truncate" title={item.title}>
                              {item.title}
                            </h4>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span className={`text-[8.5px] font-black px-1.5 py-0.5 rounded ${statusColor}`}>
                                {statusLabel}
                              </span>
                              <span className="text-[10px] text-fg-muted font-mono">
                                {item.currentPrice.toLocaleString()} JOD
                              </span>
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            const conf = window.confirm(
                              isAr
                                ? `⚠️ هل أنت متأكد من مسح وحذف المزاد "${item.title}" بشكل كلي ونهائي من قاعدة البيانات؟`
                                : `⚠️ Are you sure you want to completely delete "${item.title}" from the real database?`
                            );
                            if (conf) {
                              deleteAuction(item.id);
                            }
                          }}
                          className="px-3 py-1.5 bg-red-50 hover:bg-red-100 border border-red-100 text-red-650 text-[10px] font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1 shrink-0"
                        >
                          <span>{isAr ? 'مسح' : 'Erase'}</span>
                        </button>
                      </div>

                      {/* Viewing CORRECTION. approveListing can only set viewing at
                          the moment of approval, and a live lot has left the
                          pending queue — so without this a wrong place was only
                          fixable from the Firebase console. Clearing (no chip
                          selected) removes the claim entirely. */}
                      <div className="px-3 pb-3 -mt-1">
                        {!editing ? (
                          <button
                            type="button"
                            onClick={() => {
                              setEditViewingId(item.id);
                              setEditViewing(
                                item.viewing === 'office' || item.viewing === 'store' || item.viewing === 'private'
                                  ? item.viewing
                                  : ''
                              );
                              setEditPlace(typeof item.viewingPlace === 'string' ? item.viewingPlace : '');
                              setEditResult(null);
                            }}
                            className="text-[10px] font-bold text-fg-muted hover:text-fg underline underline-offset-2 cursor-pointer"
                          >
                            {isAr ? 'تعديل المعاينة' : 'Edit viewing'}
                            {item.viewing ? ` · ${item.viewing}` : ''}
                          </button>
                        ) : (
                          <div className="bg-surface-sunken border border-line rounded-xl p-2.5 space-y-2">
                            <ViewingSelector
                              value={editViewing}
                              onChange={setEditViewing}
                              place={editPlace}
                              onPlaceChange={setEditPlace}
                              isAr={isAr}
                            />
                            {editResult && (
                              <p className="text-[10px] font-bold text-fg-muted">{editResult}</p>
                            )}
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={editSaving}
                                onClick={async () => {
                                  setEditSaving(true);
                                  setEditResult(null);
                                  const res = await onSetViewing(item.id, editViewing, editPlace);
                                  setEditSaving(false);
                                  if (res.success) {
                                    setEditViewingId(null);
                                  } else {
                                    setEditResult(res.message || (isAr ? 'فشل الحفظ.' : 'Save failed.'));
                                  }
                                }}
                                className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-[10px] py-1.5 rounded-lg transition-all cursor-pointer"
                              >
                                {editSaving
                                  ? (isAr ? 'جارٍ الحفظ…' : 'Saving…')
                                  : (isAr ? 'حفظ' : 'Save')}
                              </button>
                              <button
                                type="button"
                                onClick={() => { setEditViewingId(null); setEditResult(null); }}
                                className="flex-1 bg-surface-raised hover:bg-surface-sunken border border-line text-fg font-bold text-[10px] py-1.5 rounded-lg transition-all cursor-pointer"
                              >
                                {isAr ? 'إلغاء' : 'Cancel'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {(() => {
                const page = directoryPage<any>(auctions, directoryPages);
                if (!page.hasMore) return null;
                return (
                  <button
                    type="button"
                    onClick={() => setDirectoryPages((n) => n + 1)}
                    className="w-full py-2.5 rounded-xl border border-line bg-surface-raised text-[11px] font-black text-fg-muted hover:bg-surface-sunken transition-colors cursor-pointer"
                  >
                    {isAr
                      ? `عرض ${Math.min(DIRECTORY_CHUNK, page.remaining)} أخرى (${page.remaining} متبقية)`
                      : `Show ${Math.min(DIRECTORY_CHUNK, page.remaining)} more (${page.remaining} left)`}
                  </button>
                );
              })()}
            </div>

          </div>
  );
};

export default OurDropsSection;
