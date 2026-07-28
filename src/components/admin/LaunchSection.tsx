import React, { useState, useEffect } from 'react';
import { Tv, CheckCircle, Trash2 } from 'lucide-react';
import { AdminListSkeleton, EmptyState } from '../FeedbackStates';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../services/firebase';
import type { ViewingMode } from '../../utils/viewing';
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

  useEffect(() => {
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
  }, [auctionId]);

  const lockedEscrows = escrows.filter(e => e.status === 'locked');
  const losingLockedEscrows = lockedEscrows.filter(e => winnerId ? e.bidderId !== winnerId : true);

  return (
    <div className="bg-zinc-50 border border-dashed border-zinc-200 rounded-xl p-4 mt-3 text-xs space-y-3">
      <div className="flex items-center justify-between border-b border-zinc-200 pb-2">
        <span className="font-extrabold text-zinc-700 tracking-wide font-mono text-[10px] uppercase">
          🛡️ Admin Diagnostic Panel
        </span>
        <span className="bg-zinc-200/60 text-zinc-600 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold">
          LIVE TELEMETRY
        </span>
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
          <div className="bg-white border border-gray-200 rounded-lg p-2.5 max-h-36 overflow-y-auto space-y-1.5 font-mono text-[10px]">
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

export interface LaunchSectionProps {
  isAr: boolean;
  isLoading: boolean;
  pendingListingDrops: any[];   // auctions pending public release
  auctions: any[];              // full auction directory (completed + master list)
  orders: any[];                // realOrders — for the "order already exists" repair guard
  users: any[];                 // for winner contact lookup
  rejectingId: string | null;
  setRejectingId: (id: string | null) => void;
  rejectionReason: string;
  setRejectionReason: (reason: string) => void;
  onApproveListing: (auctionId: string, viewing?: ViewingMode, viewingPlace?: string) => void | Promise<any>; // approveListing
  onRejectListing: (auctionId: string, reason?: string) => void | Promise<any>;              // rejectListing
  onRepairOrder: (auctionId: string) => Promise<{ success: boolean; message?: string }>;     // repairEndedAuctionOrder
  onRepairEscrow: (auctionId: string) => Promise<{ success: boolean; message?: string }>;    // repairStuckEscrowsForEndedAuction
  onDeleteAuction: (auctionId: string) => void | Promise<any>;                               // deleteAuction
  onSetViewing: (auctionId: string, viewing: ViewingMode | '', viewingPlace: string) => Promise<{ success: boolean; message?: string }>; // setAuctionViewing
  onCreateDrop: () => void;                                                                   // setActiveView('auction-drop-builder')
}

export const LaunchSection: React.FC<LaunchSectionProps> = ({
  isAr,
  isLoading,
  pendingListingDrops,
  auctions,
  orders,
  users,
  rejectingId,
  setRejectingId,
  rejectionReason,
  setRejectionReason,
  onApproveListing,
  onRejectListing,
  onRepairOrder,
  onRepairEscrow,
  onDeleteAuction,
  onSetViewing,
  onCreateDrop,
}) => {
  const [repairResults, setRepairResults] = useState<Record<string, string>>({});
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
  const approveListing = onApproveListing;
  const rejectListing = onRejectListing;
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
            <div className="bg-white border border-gray-200 p-5 rounded-2xl shadow-xs">
              <h3 className="text-xs font-extrabold text-gray-900 flex items-center gap-2">
                <Tv className="w-4 h-4 text-[#FF6B00]" /> 
                {isAr ? 'طلبات التحقق والموافقة على المزادات' : 'AUCTION LOT APPROVAL SYSTEM'}
              </h3>
              <p className="text-[11px] text-gray-400 mt-1">
                {isAr ? 'قم بمراجعة المعروضات الجديدة التي أضافها المستخدمون للتصديق عليها وإتاحتها للبث المباشر.' : 'Review new auction entries submitted by merchants, launch them live, or purge existing database records.'}
              </p>
            </div>

            {/* List 1: Pending lots awaiting approvals */}
            <div className="space-y-3">
              <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-widest px-0.5">
                {isAr ? 'طلبات الإطلاق المعلقة بانتظار الموافقة' : 'LOTS AWAITING PUBLIC RELEASE'}
              </h3>

              {isLoading ? (
                <AdminListSkeleton />
              ) : pendingListingDrops.length > 0 ? (
                pendingListingDrops.map((item) => {
                  // Client-side go-live gate. hasMedia is a HARD requirement:
                  // no photo/video means the lot cannot be approved at all,
                  // regardless of the checklist. The three ticks are the admin's
                  // explicit quality confirmation; all three plus media unlock
                  // APPROVE. The test-title match is a SOFT warning only.
                  const checklist: LotChecklist = checklistById[item.id] || { photo: false, category: false, name: false };
                  const hasMedia = !!(item.thumbnailUrl || item.videoUrl || (item.mediaUrls && item.mediaUrls.length));
                  const allChecked = checklist.photo && checklist.category && checklist.name;
                  const canApprove = allChecked && hasMedia;
                  const looksLikeTest = /test|tset|اختبار|dummy|sample/i.test(String(item.title || ''));
                  const checklistItems: { key: keyof LotChecklist; en: string; ar: string }[] = [
                    { key: 'photo', en: 'Real product photo (not a poster/branding slide)', ar: 'صورة منتج حقيقية (وليست بوستر أو تصميم دعائي)' },
                    { key: 'category', en: 'Category is correct', ar: 'التصنيف صحيح' },
                    { key: 'name', en: 'Descriptive name, not a test', ar: 'اسم وصفي وليس تجريبياً' },
                  ];
                  return (
                  <div key={item.id} className="bg-white border border-gray-200 p-5 rounded-2xl space-y-4 shadow-xs transition-all hover:border-gray-200">
                    <div className="flex gap-4">
                      {/* Click to open full size. A 64px object-cover crop hides
                          both detail and framing, so an approver could not
                          actually inspect what they were approving. */}
                      <a
                        href={item.thumbnailUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={isAr ? 'فتح الصورة بالحجم الكامل' : 'Open full size'}
                        className="shrink-0 cursor-zoom-in"
                      >
                        <img
                          src={item.thumbnailUrl}
                          alt="Lot Cover"
                          className="w-16 h-16 rounded-xl object-cover border border-gray-200 shadow-xs hover:border-gray-400 transition-colors"
                        />
                      </a>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="bg-orange-50 text-[#FF6B00] border border-orange-100 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                            {item.category}
                          </span>
                          {/* Concierge flag (Wave E2 sets it; tolerate its absence) */}
                          {(item.listedByMazad || item.isConcierge) && (
                            <span className="bg-violet-50 text-violet-600 border border-violet-100 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                              {isAr ? 'كونسيرج مزاد' : 'Mazad Concierge'}
                            </span>
                          )}
                        </div>
                        <h4 className="font-extrabold text-sm text-gray-900 truncate mt-2">{item.title}</h4>
                        <p className="text-xs text-gray-500 mt-1">
                          {isAr ? 'سعر الابتداء: ' : 'Starting Bid: '} <span className="font-mono text-gray-800 font-bold">{item.startingPrice.toLocaleString()} JOD</span>
                        </p>
                        <p className="text-[10px] text-gray-400 font-mono mt-0.5 truncate">
                          {isAr ? 'البائع: ' : 'Seller: '}{item.sellerName || item.createdByName || (isAr ? 'غير معروف' : 'Unknown')}
                          {item.createdAt ? (
                            <span> · {isAr ? 'قُدّم ' : 'Submitted '}{new Date(item.createdAt).toLocaleString(isAr ? 'ar-JO' : 'en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                          ) : null}
                        </p>
                        {item.vendorName && (
                          <p className="text-[10px] text-gray-400 font-mono mt-0.5 truncate">
                            {isAr ? 'المورّد: ' : 'Vendor: '}{item.vendorName}
                          </p>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-gray-600 leading-relaxed bg-gray-50/50 p-3 rounded-xl border border-gray-100">{item.description}</p>

                    {item.videoUrl && (
                      <div className="bg-gray-50 border border-gray-200 p-3 rounded-xl space-y-2">
                        <span className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider block">
                          🎥 {isAr ? 'معاينة محتوى الفيديو المرفق' : 'ATTACHED DEMO VIDEO'}
                        </span>
                        {/* NO forced aspect ratio. This used to be `aspect-video`
                            (16:9) capped at 160px tall, but sellers shoot PORTRAIT
                            phone video — object-contain then squeezed it into a
                            thin sliver between two black bars, which is exactly
                            what an approver cannot judge a lot from. Let the media
                            keep its own shape and give it real height: portrait
                            renders tall, landscape still fills the width. */}
                        <div className="w-full bg-black rounded-lg overflow-hidden flex items-center justify-center border border-gray-200 shadow-inner">
                          <video
                            src={item.videoUrl}
                            controls
                            className="max-h-[420px] w-auto max-w-full object-contain rounded-lg"
                            playsInline
                            preload="metadata"
                          />
                        </div>
                      </div>
                    )}

                    {rejectingId === item.id ? (
                      <div className="space-y-2">
                        <textarea
                          placeholder={isAr ? 'اكتب سبب الرفض ليصل للبائع...' : 'Enter a rejection reason for the seller...'}
                          value={rejectionReason}
                          onChange={(e) => setRejectionReason(e.target.value)}
                          className="w-full text-xs p-2.5 border border-rose-200 rounded-xl bg-rose-50/20 focus:outline-none focus:ring-1 focus:ring-rose-400"
                          rows={2}
                          maxLength={300}
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              rejectListing(item.id, rejectionReason.trim() || undefined);
                              clearStagedViewing(item.id);
                              setRejectingId(null);
                              setRejectionReason('');
                            }}
                            className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs py-2 rounded-xl transition-all shadow-xs"
                          >
                            {isAr ? 'تأكيد الرفض وإبلاغ البائع' : 'CONFIRM REJECT & NOTIFY SELLER'}
                          </button>
                          <button
                            onClick={() => {
                              setRejectingId(null);
                              setRejectionReason('');
                            }}
                            className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs px-4 py-2 rounded-xl transition-all border border-gray-200"
                          >
                            {isAr ? 'إلغاء' : 'Cancel'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {/* Per-lot viewing. Optional: approving without a choice
                            leaves it unset, and the lot simply says nothing about
                            viewing rather than claiming a location. */}
                        <ViewingSelector
                          value={viewingById[item.id] || ''}
                          onChange={(next) =>
                            setViewingById((prev) => {
                              const updated = { ...prev };
                              if (next) updated[item.id] = next;
                              else delete updated[item.id];
                              return updated;
                            })
                          }
                          place={viewingPlaceById[item.id] || ''}
                          onPlaceChange={(next) =>
                            setViewingPlaceById((prev) => ({ ...prev, [item.id]: next }))
                          }
                          isAr={isAr}
                        />

                        {/* Quality gate — the admin must confirm all three
                            before APPROVE un-greys, and no lot without media can
                            go live at all. Purely a client-side guard on the
                            approve action; the call itself is unchanged. */}
                        <div className="bg-amber-50/40 border border-amber-100 rounded-xl p-3 space-y-2.5">
                          <span className="text-[10px] font-extrabold text-amber-800 uppercase tracking-wider block">
                            ✅ {isAr ? 'تأكيد الجودة قبل النشر' : 'PRE-LAUNCH QUALITY CHECK'}
                          </span>

                          {!hasMedia && (
                            <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-2.5 py-2 text-[11px] font-bold flex items-center gap-1.5">
                              <span>⛔</span>
                              <span>{isAr ? 'لا توجد صورة/فيديو — لا يمكن الموافقة' : 'No photo/video — cannot approve'}</span>
                            </div>
                          )}

                          {looksLikeTest && (
                            <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-2.5 py-2 text-[11px] font-bold flex items-center gap-1.5">
                              <span>⚠️</span>
                              <span>{isAr ? 'يبدو أنه إعلان تجريبي' : 'Looks like a test listing'}</span>
                            </div>
                          )}

                          <div className="space-y-1.5">
                            {checklistItems.map(({ key, en, ar }) => (
                              <label
                                key={key}
                                className="flex items-start gap-2 text-[11px] text-gray-700 font-medium cursor-pointer select-none"
                              >
                                <input
                                  type="checkbox"
                                  checked={checklist[key]}
                                  onChange={() =>
                                    setChecklistById((prev) => {
                                      const current = prev[item.id] || { photo: false, category: false, name: false };
                                      return { ...prev, [item.id]: { ...current, [key]: !current[key] } };
                                    })
                                  }
                                  className="mt-0.5 w-3.5 h-3.5 rounded accent-[#FF6B00] shrink-0 cursor-pointer"
                                />
                                <span>{isAr ? ar : en}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        <div className="flex gap-2">
                        <button
                          disabled={!canApprove}
                          onClick={async () => {
                            // Hard client-side gate: never fire the approve call
                            // unless all ticks are in and the lot has media.
                            if (!canApprove) return;
                            // Same call, same arguments — the args are read
                            // before anything is cleared. Only the cleanup is new.
                            try {
                              await approveListing(item.id, viewingById[item.id], viewingPlaceById[item.id]);
                            } catch (err) {
                              // Approve blew up: keep the staged choice so the
                              // admin can retry without re-picking it.
                              console.error('Approve listing failed; keeping staged viewing choice:', err);
                              return;
                            }
                            clearStagedViewing(item.id);
                            clearChecklist(item.id);
                          }}
                          className={`flex-1 font-extrabold text-xs py-2 rounded-xl transition-all shadow-xs text-white ${canApprove ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-gray-300 cursor-not-allowed'}`}
                        >
                          {isAr ? 'الموافقة وإطلاق البث فوراً' : 'APPROVE & GO LIVE'}
                        </button>
                        <button
                          onClick={() => {
                            setRejectingId(item.id);
                            setRejectionReason('');
                          }}
                          className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs py-2 rounded-xl transition-all border border-gray-200"
                        >
                          {isAr ? 'رفض الطلب' : 'REJECT'}
                        </button>
                        </div>
                      </div>
                    )}
                  </div>
                  );
                })
              ) : (
                <EmptyState
                  title={isAr ? 'لا توجد معروضات معلقة' : 'No pending lots'}
                  description={isAr ? 'جميع طلبات المزادات المقترحة من البائعين تمت مراجعتها.' : 'No new listings submitted by merchants are currently awaiting public release.'}
                  language={isAr ? 'ar' : 'en'}
                />
              )}
            </div>

            {/* List 2: Concluded Auctions Fulfillments */}
            <div className="space-y-3 pt-4 border-t border-gray-100">
              <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-widest px-0.5 flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                {isAr ? 'المزادات المنتهية والترتيبات اللوجستية' : 'RECENTLY COMPLETED AUCTIONS & FULFILLMENT'}
              </h3>

              {(() => {
                const completedAuctions = auctions.filter(a => a.status === 'completed' || (a.status === 'live' && a.endTime < Date.now()));
                
                if (completedAuctions.length === 0) {
                  return (
                    <div className="text-center py-10 bg-white border border-gray-200 rounded-2xl p-6 text-gray-400 text-xs shadow-xs">
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
                        <div key={item.id} className="bg-white border border-gray-200 p-5 rounded-2xl space-y-4 shadow-xs">
                          {/* Minimal item tag */}
                          <div className="flex gap-3 items-center">
                            <img src={item.thumbnailUrl} alt="Cover" className="w-11 h-11 rounded-lg object-cover border border-gray-200 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <h4 className="font-extrabold text-xs text-gray-900 truncate leading-none mt-1">{item.title}</h4>
                              <p className="text-[11px] text-gray-500 mt-2 font-mono">
                                {isAr ? 'السعر النهائي المبيع: ' : 'Winning Bid: '}
                                <strong className="text-emerald-600 font-extrabold">{item.currentPrice.toLocaleString()} JOD</strong>
                                {item.vendorName && (
                                  <span className="text-gray-400"> · {isAr ? 'المورّد: ' : 'Vendor: '}{item.vendorName}</span>
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
                                  <span className="text-gray-400 text-[9px] uppercase font-mono block mb-0.5">{isAr ? 'اسم العميل الفائز:' : 'FULL NAME'}</span>
                                  <span className="font-bold text-gray-900">{winnerNameStr}</span>
                                </div>
                                <div>
                                  <span className="text-gray-400 text-[9px] uppercase font-mono block mb-0.5">{isAr ? 'رقم الهاتف للتوصيل:' : 'TELEPHONE'}</span>
                                  <a href={`tel:${winnerPhoneStr}`} className="font-black text-[#FF6B00] hover:underline font-mono">{winnerPhoneStr}</a>
                                </div>
                                <div className="sm:mt-1">
                                  <span className="text-gray-400 text-[9px] uppercase font-mono block mb-0.5">{isAr ? 'البريد الإلكتروني:' : 'EMAIL'}</span>
                                  <span className="font-medium text-gray-800 font-mono truncate block">{winnerEmailStr}</span>
                                </div>
                                <div className="sm:mt-1">
                                  <span className="text-gray-400 text-[9px] uppercase font-mono block mb-0.5">{isAr ? 'المدينة والمنطقة:' : 'REGION'}</span>
                                  <span className="font-bold text-gray-900">{winnerCityStr}</span>
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
                              <span className="text-[10px] text-gray-405 font-mono uppercase font-bold tracking-wider">Escrow Locked 🔒</span>
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

                          {/* Temporary admin-only diagnostic panel */}
                          <AuctionEscrowDiagnosticPanel 
                            auctionId={item.id} 
                            winnerId={item.currentBidderId || null} 
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
            <div className="space-y-3 pt-4 border-t border-gray-100">
              <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-widest px-0.5 flex items-center gap-1.5">
                <Trash2 className="w-4 h-4 text-red-600" />
                {isAr ? 'قائمة التحكم السريع وحذف المزادات' : 'MASTER PLATFORM LISTINGS DIRECTORY'}
              </h3>

              {auctions.length === 0 ? (
                <div className="text-center py-8 bg-white border border-gray-200 rounded-2xl p-4 text-gray-400 text-xs shadow-xs">
                  {isAr ? 'لا توجد مزادات في قاعدة البيانات.' : 'No registered entries found.'}
                </div>
              ) : (
                <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100 overflow-hidden shadow-xs">
                  {auctions.map((item) => {
                    let statusLabel = item.status.toUpperCase();
                    let statusColor = 'bg-gray-100 text-gray-500';
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
                      <div key={item.id} className="text-left transition-colors hover:bg-gray-50/55">
                      <div className="p-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <img 
                            src={item.thumbnailUrl} 
                            alt={item.title} 
                            className="w-10 h-10 rounded-lg object-cover border border-gray-200 shrink-0" 
                          />
                          <div className="min-w-0 flex-1">
                            <h4 className="font-extrabold text-[12px] text-gray-900 truncate" title={item.title}>
                              {item.title}
                            </h4>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span className={`text-[8.5px] font-black px-1.5 py-0.5 rounded ${statusColor}`}>
                                {statusLabel}
                              </span>
                              <span className="text-[10px] text-gray-400 font-mono">
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
                            className="text-[10px] font-bold text-gray-500 hover:text-gray-800 underline underline-offset-2 cursor-pointer"
                          >
                            {isAr ? 'تعديل المعاينة' : 'Edit viewing'}
                            {item.viewing ? ` · ${item.viewing}` : ''}
                          </button>
                        ) : (
                          <div className="bg-gray-50 border border-gray-200 rounded-xl p-2.5 space-y-2">
                            <ViewingSelector
                              value={editViewing}
                              onChange={setEditViewing}
                              place={editPlace}
                              onPlaceChange={setEditPlace}
                              isAr={isAr}
                            />
                            {editResult && (
                              <p className="text-[10px] font-bold text-gray-600">{editResult}</p>
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
                                className="flex-1 bg-white hover:bg-gray-100 border border-gray-200 text-gray-700 font-bold text-[10px] py-1.5 rounded-lg transition-all cursor-pointer"
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
            </div>

          </div>
  );
};

export default LaunchSection;
