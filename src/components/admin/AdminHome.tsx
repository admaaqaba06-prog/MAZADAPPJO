import React from 'react';
import { computeAttentionCounts, type AttentionInput, type AdminTabId } from '../../utils/adminNav';

interface Props {
  isAr: boolean;
  counts: AttentionInput;
  metrics: { escrowHeld: number; liveAuctions: number; members: number };
  onSelectTab: (t: AdminTabId) => void;
}

export const AdminHome: React.FC<Props> = ({ isAr, counts, metrics, onSelectTab }) => {
  const c = computeAttentionCounts(counts);
  const rows: { id: AdminTabId; n: number; ar: string; en: string }[] = [
    { id: 'verify', n: counts.pendingVerify, ar: 'إيصالات بانتظار التحقق', en: 'Payments & members to verify' },
    { id: 'fulfillment', n: counts.overdueFulfillment, ar: 'طلبات متأخرة للمتابعة', en: 'Fulfillments overdue' },
    { id: 'disputes', n: counts.openDisputes, ar: 'نزاعات مفتوحة', en: 'Disputes open' },
    { id: 'payouts', n: counts.pendingPayouts, ar: 'سحوبات بانتظار الموافقة', en: 'Payouts pending' },
    { id: 'launch', n: counts.pendingListings, ar: 'مزادات بانتظار الاعتماد', en: 'Listings awaiting approval' },
  ];
  const active = rows.filter(r => r.n > 0);
  return (
    <div className="space-y-5">
      <div className="bg-white rounded-3xl border border-gray-200 p-5">
        <h2 className="text-sm font-black text-gray-950 mb-3">{isAr ? 'بحاجة إلى انتباهك' : 'Needs your attention'}</h2>
        {c.total === 0 ? (
          <p className="text-xs font-semibold text-gray-400">{isAr ? 'كل شيء تحت السيطرة — لا يوجد ما ينتظر.' : 'All clear — nothing waiting.'}</p>
        ) : (
          <div className="space-y-2">
            {active.map(r => (
              <button key={r.id} type="button" onClick={() => onSelectTab(r.id)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border border-gray-200 hover:border-orange-300 hover:bg-orange-50/40 transition text-start">
                <span className="text-xs font-bold text-gray-800">{isAr ? r.ar : r.en}</span>
                <span className="min-w-6 h-6 px-2 inline-flex items-center justify-center rounded-full bg-[#FF6B00] text-white text-xs font-black">{r.n}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { ar: 'المبالغ المحتجزة', en: 'Escrow held', v: metrics.escrowHeld, suffix: isAr ? ' د.أ' : ' JOD' },
          { ar: 'مزادات مباشرة', en: 'Live auctions', v: metrics.liveAuctions, suffix: '' },
          { ar: 'الأعضاء', en: 'Members', v: metrics.members, suffix: '' },
        ].map((m, i) => (
          <div key={i} className="bg-white rounded-3xl border border-gray-200 p-5">
            <span className="block text-xs font-semibold text-gray-400">{isAr ? m.ar : m.en}</span>
            <span dir="ltr" className="block mt-1 text-2xl font-black text-gray-950">{(m.v ?? 0).toLocaleString('en-US')}{m.suffix}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminHome;
