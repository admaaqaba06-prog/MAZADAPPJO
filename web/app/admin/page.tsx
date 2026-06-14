'use client';

import React, { useState, useEffect } from 'react';
import { 
  Building, 
  Coins, 
  AlertTriangle, 
  CheckCircle, 
  Users, 
  BadgeCheck, 
  Search, 
  TrendingUp, 
  Scale, 
  ShieldAlert,
  ArrowUpRight,
  UserX,
  CreditCard
} from 'lucide-react';

export default function AdminDashboardPage() {
  
  // Real stats metrics values
  const [metrics, setMetrics] = useState({
    totalGMV: 247500,
    activeAuctions: 8,
    escrowLocked: 42100,
    disputeRate: 1.2
  });

  // Dispute tickets listings
  const [disputes, setDisputes] = useState([
    {
      id: 'DISP-8822',
      lotTitle: 'Rolex Daytona Cosmograph Premium Watch',
      buyer: 'rami_al_hassan',
      seller: 'PremiumTimesJO',
      amount: 14500,
      reason: 'Claimed bezel hairline scratches unnoted in stream.',
      status: 'PENDING'
    },
    {
      id: 'DISP-8711',
      lotTitle: 'Apple Vision Pro (Dual Loop Bands)',
      buyer: 'faisal_99',
      seller: 'AmmanTechHub',
      amount: 2100,
      reason: 'Missing original international warranty card leaflets.',
      status: 'PENDING'
    }
  ]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDispute, setSelectedDispute] = useState<any>(null);

  const handleResolveDisputeAction = (disputeId: string, resolution: 'REFUND' | 'RELEASE') => {
    // Optimistic state updates
    setDisputes(prev => prev.map(disp => {
      if (disp.id === disputeId) {
        return { ...disp, status: resolution === 'REFUND' ? 'REFUNDED' : 'RELEASED_TO_SELLER' };
      }
      return disp;
    }));
    
    // Auto sync metric pools
    if (resolution === 'RELEASE') {
      setMetrics(prev => ({
        ...prev,
        escrowLocked: prev.escrowLocked - disputes.find(d => d.id === disputeId)!.amount
      }));
    }
    
    setSelectedDispute(null);
  };

  return (
    <div className="min-h-screen bg-[#0B0B0B] text-white font-sans flex flex-col">
      
      {/* Upper Navigation Border Header */}
      <header className="border-b border-white/10 px-8 py-5 flex justify-between items-center bg-[#0d0d0d]">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-white font-mono uppercase">MAZAD JO CONTROL CENTER</h1>
            <span className="bg-[#FF6B00]/10 border border-[#FF6B00]/30 text-[#FF6B00] text-[8px] px-1.5 py-0.5 rounded uppercase font-black tracking-widest leading-none">ADMIN ONLY</span>
          </div>
          <p className="text-[10px] text-gray-500 font-mono tracking-wider">SECURED LEDGER PROTOCOLS ACTIVE</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs font-semibold">Security Level: Platinum</p>
            <p className="text-[9px] text-[#10B981] font-mono">ALL SYSTEMS CLOUD-VETTING STATUS: OK</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center font-bold text-xs">A</div>
        </div>
      </header>

      {/* Main Control Panel Dashboard Grid */}
      <main className="flex-1 p-8 space-y-8 max-w-7xl mx-auto w-full">
        
        {/* Upper Big Metrics Cards Row */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-[#171717] rounded-2xl p-6 border border-white/5 space-y-2 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5"><TrendingUp className="w-16 h-16 text-white" /></div>
            <p className="text-xs text-gray-400 font-mono uppercase tracking-widest">Gross Volume (GMV)</p>
            <h3 className="text-3xl font-extrabold tracking-tight text-[#FF6B00]">{metrics.totalGMV.toLocaleString()} <span className="text-xs font-normal">JOD</span></h3>
            <p className="text-[10px] text-[#10B981] font-medium">+15.8% Growth vs last month</p>
          </div>

          <div className="bg-[#171717] rounded-2xl p-6 border border-white/5 space-y-2 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5"><Building className="w-16 h-16 text-white" /></div>
            <p className="text-xs text-gray-400 font-mono uppercase tracking-widest">Active Stream Rooms</p>
            <h3 className="text-3xl font-extrabold tracking-tight text-white">{metrics.activeAuctions}</h3>
            <p className="text-[10px] text-gray-400">Low-latency Mux pipelines live</p>
          </div>

          <div className="bg-[#171717] rounded-2xl p-6 border border-white/5 space-y-2 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5"><Coins className="w-16 h-16 text-white" /></div>
            <p className="text-xs text-gray-400 font-mono uppercase tracking-widest">Locked In Escrows</p>
            <h3 className="text-3xl font-extrabold tracking-tight text-[#10B981]">{metrics.escrowLocked.toLocaleString()} <span className="text-xs font-normal">JOD</span></h3>
            <p className="text-[10px] text-gray-400">Held pending delivery signature</p>
          </div>

          <div className="bg-[#171717] rounded-2xl p-6 border border-white/5 space-y-2 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5"><Scale className="w-16 h-16 text-white" /></div>
            <p className="text-xs text-gray-400 font-mono uppercase tracking-widest">Dispute Ratio</p>
            <h3 className="text-3xl font-extrabold tracking-tight text-white">{metrics.disputeRate}%</h3>
            <p className="text-[10px] text-[#10B981] font-medium">Extremely high trust rating</p>
          </div>
        </section>

        {/* Lower row: Split Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Dispute ticket controller card column */}
          <div className="lg:col-span-2 bg-[#171717] rounded-2xl border border-white/5 p-6 space-y-6">
            <div className="flex justify-between items-center border-b border-white/5 pb-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-[#FF6B00] flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-orange-500" /> Active Escrow Dispute Center
              </h3>
              <span className="text-[10px] text-gray-400 font-mono">Pending action: {disputes.filter(d => d.status === 'PENDING').length}</span>
            </div>

            {/* List and manage disputes */}
            <div className="space-y-4">
              {disputes.map(disp => (
                <div key={disp.id} className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-3 hover:border-white/10 transition-all">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] font-mono text-[#FF6B00] bg-[#FF6B00]/10 border border-[#FF6B00]/20 px-2 py-0.5 rounded">
                        {disp.id}
                      </span>
                      <h4 className="text-sm font-bold mt-1.5">{disp.lotTitle}</h4>
                    </div>

                    <span className={`text-[9px] font-mono font-black px-2 py-0.5 rounded uppercase tracking-wider ${
                      disp.status === 'PENDING' 
                        ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400' 
                        : disp.status === 'RELEASED_TO_SELLER'
                        ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                        : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
                    }`}>
                      {disp.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-xs font-mono text-gray-400">
                    <div>Buyer: <strong className="text-white">@{disp.buyer}</strong></div>
                    <div>Seller: <strong className="text-white">@{disp.seller}</strong></div>
                    <div className="col-span-2">Held Escrow Bond: <strong className="text-[#10B981]">{disp.amount.toLocaleString()} JOD</strong></div>
                  </div>

                  <p className="text-xs text-gray-300 bg-white/2 p-2.5 rounded-lg border border-white/2">
                    Claim Description: "{disp.reason}"
                  </p>

                  {disp.status === 'PENDING' && (
                    <div className="flex gap-2.5 pt-1">
                      <button 
                        onClick={() => handleResolveDisputeAction(disp.id, 'REFUND')}
                        className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-[10px] uppercase py-2 rounded-lg transition-all"
                      >
                        Refund Escrow to Buyer
                      </button>
                      <button 
                        onClick={() => handleResolveDisputeAction(disp.id, 'RELEASE')}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-[10px] uppercase py-2 rounded-lg transition-all"
                      >
                        Release Payout to Seller
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Right column: Risk Compliance Actions panel */}
          <div className="space-y-6">
            <div className="bg-[#171717] rounded-2xl border border-white/5 p-6 space-y-6">
              <h3 className="text-xs font-black uppercase tracking-widest text-[#FF6B00]">SECURE AUDITING TOOLS</h3>
              
              <div className="space-y-4 text-xs leading-relaxed">
                <div className="p-3.5 rounded-xl bg-orange-500/5 border border-orange-500/10 text-orange-300">
                  <p className="font-bold flex items-center gap-1.5 mb-1 text-[11px] uppercase">
                    <BadgeCheck className="w-4 h-4 text-orange-400" /> CLIQ ESCROW INTEGRATION
                  </p>
                  Our smart escrow system handles digital handshakes. Jordan Central Financial holds money until users click 'Delivery Verified'.
                </div>

                <div className="p-3.5 rounded-xl bg-white/2 border border-white/5 space-y-3">
                  <h4 className="font-bold uppercase tracking-wide text-[10px] text-gray-300">Fast Suspensation (Risk Guard)</h4>
                  <p className="text-gray-400 text-[11px]">Directly suspend accounts exhibiting sniping bid bots or invalid top-up receipt screenshots.</p>
                  
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="Username / Email..."
                      className="flex-1 bg-black border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
                    />
                    <button className="bg-[#EF4444] text-white px-3 rounded-lg flex items-center justify-center">
                      <UserX className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>

      </main>

    </div>
  );
}
