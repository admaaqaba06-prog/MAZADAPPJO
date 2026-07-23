import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Smartphone, 
  Laptop, 
  Gem, 
  Shirt, 
  Clock 
} from 'lucide-react';

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

  // Filter live or upcoming auctions for premium show (ensure they haven't expired)
  const activeAuctions = auctions.filter(a => 
    (a.status === 'live' || a.status === 'upcoming') && 
    (!a.endTime || a.endTime > ticks)
  );

  if (activeAuctions.length === 0) {
    return null;
  }

  const getCategoryIcon = (category: string) => {
    const cat = (category || '').toLowerCase();
    if (cat.includes('elect') || cat.includes('phone') || cat.includes('laptop')) {
      return <Laptop className="w-8 h-8 text-[#98C2E6] stroke-[1.25]" />;
    } else if (cat.includes('watch') || cat.includes('rolex') || cat.includes('jewel') || cat.includes('gem')) {
      return <Gem className="w-8 h-8 text-[#DCA268] stroke-[1.25]" />;
    } else if (cat.includes('fash') || cat.includes('cloth') || cat.includes('shirt') || cat.includes('jacket')) {
      return <Shirt className="w-8 h-8 text-[#5C5C59] stroke-[1.25]" />;
    } else {
      return <Smartphone className="w-8 h-8 text-[#A8AEC6] stroke-[1.25]" />;
    }
  };

  const getCategoryBg = (category: string) => {
    const cat = (category || '').toLowerCase();
    if (cat.includes('elect') || cat.includes('phone') || cat.includes('laptop')) {
      return 'bg-[#0E1B29]';
    } else if (cat.includes('watch') || cat.includes('rolex') || cat.includes('jewel') || cat.includes('gem')) {
      return 'bg-[#211B14]';
    } else if (cat.includes('fash') || cat.includes('cloth') || cat.includes('shirt') || cat.includes('jacket')) {
      return 'bg-[#F2F2EF]';
    } else {
      return 'bg-[#1E1F35]';
    }
  };

  // Resolve dynamic stats & imagery with actual DB data
  const resolvedItems = activeAuctions.map(matched => {
    const price = matched.currentPrice || matched.startingPrice || 0;
    
    const displayTitle = matched.title.length > 12 
      ? matched.title.substring(0, 12) + '...' 
      : matched.title;

    let timeLeftStr = '00:00';
    if (matched.endTime) {
      const secondsLeft = Math.max(0, Math.floor((matched.endTime - ticks) / 1000));
      if (secondsLeft <= 0) {
        timeLeftStr = '00:00';
      } else {
        const mm = Math.floor(secondsLeft / 60);
        if (mm >= 60) {
          const hh = Math.floor(mm / 60);
          timeLeftStr = `${hh}H ${mm % 60}M`;
        } else {
          const ss = secondsLeft % 60;
          timeLeftStr = `${mm}M ${ss}S`;
        }
      }
    }

    let coverUrl = 'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=400&q=80';
    let isVideo = false;
    if (matched.thumbnailUrl) {
      coverUrl = matched.thumbnailUrl;
    } else if (matched.videoUrl) {
      coverUrl = matched.videoUrl;
      isVideo = true;
    }

    return {
      id: matched.id,
      title: displayTitle,
      price,
      time: timeLeftStr,
      bg: getCategoryBg(matched.category),
      icon: getCategoryIcon(matched.category),
      coverUrl,
      isVideo,
      matchedId: matched.id
    };
  });

  const handleItemClick = (matchedId: string) => {
    setActiveAuctionId(matchedId);
    setActiveView('live');
  };

  return (
    <div className="w-full bg-white pt-3 pb-6 border-b border-gray-100" id="countdown-stories-bar">
      {/* Header Row */}
      <div className="px-4 mb-3.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="flex h-2.5 w-2.5 items-center justify-center relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-600"></span>
          </span>
          <h3 className="text-sm font-bold text-gray-950 font-sans tracking-tight">
            {isAr ? 'ينتهي قريباً' : 'Ending soon'}
          </h3>
        </div>
        <span className="text-[11px] font-bold text-gray-400 font-mono">
          {activeAuctions.length} {isAr ? 'نشط' : 'live'}
        </span>
      </div>

      {/* Horizontal list */}
      <div className="flex gap-3 overflow-x-auto px-4 scrollbar-none pb-1">
        {resolvedItems.map((item) => {
          return (
            <button
              key={item.id}
              onClick={() => handleItemClick(item.matchedId)}
              className="flex flex-col items-stretch focus:outline-none shrink-0 group cursor-pointer text-left"
              style={{ width: '82px' }}
              id={`story-item-${item.id}`}
            >
              {/* Card Body with dynamic cover backgrounds */}
              <div className={`aspect-[1/1] w-20 h-20 rounded-[24px] ${item.bg} flex items-center justify-center relative shadow-xs border border-gray-100 overflow-hidden`}>
                
                {/* Full-bleed cover background */}
                {item.coverUrl && (
                  <>
                    {item.isVideo ? (
                      <video 
                        src={item.coverUrl} 
                        muted 
                        playsInline 
                        loop 
                        autoPlay 
                        className="absolute inset-0 w-full h-full object-cover z-0 transition-transform duration-500 group-hover:scale-110"
                      />
                    ) : (
                      <img 
                        src={item.coverUrl} 
                        alt={item.title} 
                        className="absolute inset-0 w-full h-full object-cover z-0 transition-transform duration-500 group-hover:scale-110"
                        referrerPolicy="no-referrer"
                      />
                    )}
                    {/* Semitransparent dynamic black curtain to ensure icon and countdown readability */}
                    <div className="absolute inset-0 bg-black/45 z-10 transition-colors duration-300 group-hover:bg-black/55" />
                  </>
                )}

                {/* Overlaid Category Icon */}
                <div className="transform group-hover:scale-110 transition-transform duration-300 z-20 mix-blend-screen opacity-95 filter drop-shadow-[0_1.5px_3px_rgba(0,0,0,0.65)]">
                  {item.icon}
                </div>

                {/* Overlaid Bottom Timer Capsule */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-[1.5px] px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0 z-20 shadow-xs border border-white/5">
                  <Clock className="w-2.5 h-2.5 text-white/95" />
                  <span className="text-[8px] font-black tracking-tight text-white/95 font-mono uppercase whitespace-nowrap leading-none mt-[0.5px]">
                    {item.time}
                  </span>
                </div>
              </div>

              {/* Text metadata below the card */}
              <div className="mt-2 text-center px-0.5">
                <span className="text-[10px] font-bold text-gray-700 truncate block leading-tight">
                  {item.title}
                </span>
                <span className="text-[11px] font-black text-[#FF6B00] block mt-1 tracking-tight leading-none">
                  {item.price.toLocaleString()} JOD
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
