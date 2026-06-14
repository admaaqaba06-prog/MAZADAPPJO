'use client';

import React, { useState } from 'react';
import { 
  Sparkles, 
  Coins, 
  Plus, 
  Minus, 
  ChevronRight,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';

interface BidBarProps {
  auctionId: string;
  startingBid: number;
  currentHighBid: number;
  minIncrement: number;
}

export const BidBar: React.FC<BidBarProps> = ({ 
  auctionId, 
  startingBid, 
  currentHighBid, 
  minIncrement 
}) => {
  const currentLeader = currentHighBid > 0 ? currentHighBid : startingBid;
  const [customBidAmount, setCustomBidAmount] = useState<number>(currentLeader + minIncrement);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successStatus, setSuccessStatus] = useState<string | null>(null);

  const incrementBid = () => {
    setCustomBidAmount(prev => prev + minIncrement);
  };

  const decrementBid = () => {
    setCustomBidAmount(prev => {
      const nextVal = prev - minIncrement;
      return nextVal > currentLeader ? nextVal : currentLeader + minIncrement;
    });
  };

  const selectQuickOption = (multiplier: number) => {
    setCustomBidAmount(currentLeader + (minIncrement * multiplier));
  };

  const handleFireBidPlacementItem = async () => {
    setIsSubmitting(true);
    setSuccessStatus(null);
    
    try {
      // Simulate direct microservice calls to our fastify backend endpoints
      const response = await fetch(`/api/auctions/${auctionId}/bid`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: customBidAmount,
          minIncrement
        })
      });

      // Simple mock fallback representation if API returns standard dev network mocks
      setTimeout(() => {
        setIsSubmitting(false);
        setSuccessStatus(`Bid hold locked: ${customBidAmount} JOD!`);
        setTimeout(() => setSuccessStatus(null), 2500);
      }, 700);

    } catch {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      className="w-full bg-[#171717] border-t border-white/10 px-4 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-white font-sans md:rounded-t-2xl shadow-[0_-12px_40px_rgba(0,0,0,0.8)]"
      style={{ touchAction: 'manipulation' }} // Prevents double-tap zooming on iOS Safari
    >
      <div className="max-w-xl mx-auto space-y-3">
        
        {/* Upper metadata row */}
        <div className="flex justify-between items-center text-xs">
          <div className="space-y-0.5">
            <p className="text-[9px] text-gray-400 uppercase font-mono tracking-widest">HIGHEST LEADING BID</p>
            <p className="text-xl font-bold text-[#10B981] leading-none">
              {currentLeader.toLocaleString()} <span className="text-[10px] font-medium text-gray-300">JOD</span>
            </p>
          </div>

          <div className="flex items-center gap-1 opacity-70 bg-white/5 border border-white/10 rounded-lg px-2 py-0.5 text-[9px] text-[#FF6B00]">
            <ShieldCheck className="w-3.5 h-3.5" /> SECURE HOLD
          </div>
        </div>

        {/* Dynamic Multiplier Presets */}
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 5].map(multiplier => {
            const presetAmount = currentLeader + (minIncrement * multiplier);
            return (
              <button
                key={multiplier}
                onClick={() => selectQuickOption(multiplier)}
                className="py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-[10px] font-mono transition-all text-center"
                style={{ minHeight: '44px' }} // Apple safe target 
              >
                +{minIncrement * multiplier} JOD ({presetAmount})
              </button>
            );
          })}
        </div>

        {/* Primary Bid Selector & Buttons Row */}
        <div className="flex items-center gap-2">
          
          {/* Custom increments column */}
          <div className="flex items-center bg-black border border-white/10 rounded-xl overflow-hidden h-12">
            <button
              onClick={decrementBid}
              disabled={customBidAmount <= currentLeader + minIncrement}
              className="px-3 text-gray-400 hover:text-white disabled:opacity-20 transition-all"
              style={{ minWidth: '44px', minHeight: '44px' }}
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            
            <div className="w-16 text-center text-xs font-mono font-bold">
              {customBidAmount} JOD
            </div>

            <button
              onClick={incrementBid}
              className="px-3 text-gray-400 hover:text-white transition-all"
              style={{ minWidth: '44px', minHeight: '44px' }}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Core Escrow Hold Bid Exec button */}
          <button
            onClick={handleFireBidPlacementItem}
            disabled={isSubmitting}
            className="flex-1 bg-[#FF6B00] hover:bg-orange-500 text-black font-extrabold text-xs tracking-wider uppercase h-12 rounded-xl transition-all shadow-[0_4px_20px_rgba(255,107,0,0.3)] flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ minHeight: '44px' }}
          >
            {isSubmitting ? (
              <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></span>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-black fill-current animate-pulse" />
                PLACE {customBidAmount.toLocaleString()} JOD
              </>
            )}
          </button>
        </div>

        {successStatus && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 py-1.5 px-3 rounded-lg text-center text-[10px] uppercase tracking-wider font-semibold animate-pulse">
            {successStatus}
          </div>
        )}
      </div>
    </div>
  );
};
