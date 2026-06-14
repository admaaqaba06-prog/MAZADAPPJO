import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { AuctionItem } from '../types';
import { Flame, Clock } from 'lucide-react';

export const CountdownStoriesBar: React.FC = () => {
  const { auctions, setActiveAuctionId, setActiveView, language } = useApp();
  const [ticks, setTicks] = useState(Date.now());
  const isAr = language === 'ar';

  useEffect(() => {
    const timer = setInterval(() => {
      setTicks(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Filter live auctions and sort by closest remaining time
  const liveAuctions = auctions
    .filter(a => a.status === 'live')
    .sort((a, b) => a.endTime - b.endTime);

  if (liveAuctions.length === 0) return null;

  return (
    <div className="w-full bg-white pt-2 pb-4 border-b border-gray-100" id="countdown-stories-bar">
      <div className="px-4 mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="flex h-2.5 w-2.5 items-center justify-center relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-600"></span>
          </span>
          <h3 className="text-xs font-black text-gray-900 tracking-wide uppercase flex items-center gap-1">
            <Flame className="w-3.5 h-3.5 text-orange-500 fill-orange-500 animate-pulse" />
            {isAr ? 'مزادات عاجلة تنتهي قريباً' : 'Ending Soon'}
          </h3>
        </div>
        <span className="text-[9.5px] font-black text-gray-400 uppercase tracking-widest font-mono">
          {liveAuctions.length} {isAr ? 'نشط' : 'LIVE'}
        </span>
      </div>

      <div className="flex gap-4 overflow-x-auto px-4 scrollbar-none pb-1 relative">
        {liveAuctions.map((auction) => {
          const rawDiff = auction.endTime - ticks;
          const isExpired = rawDiff <= 0;

          // Format remaining time in a ultra-compact manner e.g., "12m 4s" or "Ended"
          let compactTime = 'Ended';
          if (!isExpired) {
            const h = Math.floor(rawDiff / 3600000);
            const m = Math.floor((rawDiff % 3600000) / 60000);
            const s = Math.floor((rawDiff % 60000) / 1000);

            if (h > 0) {
              compactTime = `${h}h ${m}m`;
            } else if (m > 0) {
              compactTime = `${m}m ${s}s`;
            } else {
              compactTime = `${s}s`;
            }
          }

          // Calculate ring dash-array based on remaining hour (assume 1h scope max for full circle)
          const maxScope = 60 * 60 * 1000; // 1 hour
          const completion = Math.max(0, Math.min(100, (rawDiff / maxScope) * 100));
          const strokeWidth = 2.5;
          const radius = 28;
          const circumference = 2 * Math.PI * radius;
          const strokeDashoffset = circumference - (completion / 100) * circumference;

          return (
            <button
              key={auction.id}
              onClick={() => {
                setActiveAuctionId(auction.id);
                setActiveView('live');
              }}
              className="flex flex-col items-center gap-1.5 focus:outline-none shrink-0 group relative cursor-pointer"
              style={{ width: '70px' }}
              id={`story-item-${auction.id}`}
            >
              {/* Image Circle with SVG timer ring */}
              <div className="relative w-16 h-16 flex items-center justify-center rounded-full bg-white select-none">
                {/* SVG Ring */}
                <svg className="absolute w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 64 64">
                  {/* Gray background track */}
                  <circle
                    cx="32"
                    cy="32"
                    r={radius}
                    fill="transparent"
                    stroke="#F3F4F6"
                    strokeWidth={strokeWidth}
                  />
                  {/* Orange countdown indicator */}
                  <circle
                    cx="32"
                    cy="32"
                    r={radius}
                    fill="transparent"
                    stroke={rawDiff < 5 * 60 * 1000 ? '#EF4444' : '#FF6B00'}
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    strokeDashoffset={isExpired ? circumference : strokeDashoffset}
                    strokeLinecap="round"
                    className="transition-all duration-1000"
                  />
                </svg>

                {/* Inner Thumbnail */}
                <div className="w-[52px] h-[52px] rounded-full overflow-hidden border border-gray-100 bg-gray-50 relative z-10 scale-95 group-hover:scale-100 transition-transform">
                  <img
                    src={auction.thumbnailUrl || auction.videoUrl}
                    alt={auction.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  {/* Blinking red badge for hot listings */}
                  {rawDiff < 5 * 60 * 1000 && !isExpired && (
                    <div className="absolute inset-0 bg-red-600/15 animate-pulse flex items-center justify-center" />
                  )}
                </div>

                {/* Compact Countdown pill */}
                <div className="absolute -bottom-1 z-20 bg-gray-900 border border-white/10 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 shadow-xs">
                  <Clock className={`w-2 h-2 ${rawDiff < 5 * 60 * 1000 && !isExpired ? 'text-red-500 animate-ping' : 'text-orange-500'}`} />
                  <span className={`text-[8px] font-extrabold text-white tracking-tighter ${rawDiff < 5 * 60 * 1000 && !isExpired ? 'text-red-400 font-black' : ''}`}>
                    {isExpired ? (isAr ? 'منتهى' : 'Ended') : compactTime}
                  </span>
                </div>
              </div>

              {/* Title label */}
              <span className="text-[9.5px] text-gray-700 font-extrabold truncate w-[68px] text-center group-hover:text-[#FF6B00] transition-colors leading-tight">
                {auction.title}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
