'use client';

import React, { useState, useEffect } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';

interface AuctionTimerProps {
  endTime: number;
  onExpire?: () => void;
}

export const AuctionTimer: React.FC<AuctionTimerProps> = ({ endTime, onExpire }) => {
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    const updateTimer = () => {
      const now = Date.now();
      const difference = endTime - now;
      
      if (difference <= 0) {
        setTimeLeft(0);
        if (onExpire) onExpire();
        return;
      }
      
      setTimeLeft(difference);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [endTime, onExpire]);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const isLowTime = timeLeft < 30000; // <30 seconds

  return (
    <div 
      className={`px-3 py-1.5 rounded-xl border backdrop-blur-md flex items-center gap-2 shadow-lg transition-all ${
        isLowTime 
          ? 'bg-[#EF4444]/20 border-[#EF4444]/40 animate-pulse text-[#EF4444]' 
          : 'bg-black/50 border-white/10 text-white'
      }`}
    >
      <Clock className={`w-3.5 h-3.5 ${isLowTime ? 'text-[#EF4444]' : 'text-[#FF6B00]'}`} />
      
      <div className="font-mono text-xs font-bold flex items-center gap-1.5">
        <span className="text-[9px] uppercase tracking-wider text-gray-400">LOT CLOSES IN:</span>
        <span className="tracking-wide text-sm">{formatTime(timeLeft)}</span>
      </div>

      {isLowTime && (
        <span className="text-[8px] font-black uppercase bg-[#EF4444] text-white px-1 rounded flex items-center gap-0.5">
          <AlertTriangle className="w-2.5 h-2.5 text-white" /> SNIPING COVERAGE ACTIVE
        </span>
      )}
    </div>
  );
};
