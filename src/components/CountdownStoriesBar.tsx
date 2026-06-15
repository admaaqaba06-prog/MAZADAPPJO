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

  // Filter live or upcoming auctions for premium show
  const displayItems = [
    {
      id: 'auction-phone-15',
      title: isAr ? 'آيفون ١٥ برو' : 'Phone 15 Pro',
      price: 280,
      time: '55m 50s',
      bg: 'bg-[#1E1F35]', // Deep indigo/purple
      icon: <Smartphone className="w-8 h-8 text-[#A8AEC6] stroke-[1.25]" />,
      actionId: 'auction-iphone-15', // Fallback link
    },
    {
      id: 'auction-macbook-pro',
      title: isAr ? 'ماك بوك برو' : 'MacBook Pro',
      price: 650,
      time: '1h 25m',
      bg: 'bg-[#0E1B29]', // Navy/Dark blue
      icon: <Laptop className="w-8 h-8 text-[#98C2E6] stroke-[1.25]" />,
      actionId: 'auction-macbook',
    },
    {
      id: 'auction-rolex-sub',
      title: isAr ? 'رولكس صبمارينر' : 'Rolex Submari...',
      price: 3200,
      time: '1h 55m',
      bg: 'bg-[#211B14]', // Dark warm brown
      icon: <Gem className="w-8 h-8 text-[#DCA268] stroke-[1.25]" />,
      actionId: 'auction-rolex',
    },
    {
      id: 'auction-air-jordan',
      title: isAr ? 'إير جوردان' : 'Air Jorda...',
      price: 95,
      time: '2h',
      bg: 'bg-[#F2F2EF]', // Off-white/beige
      icon: <Shirt className="w-8 h-8 text-[#5C5C59] stroke-[1.25]" />,
      actionId: 'auction-vintage-jacket',
    }
  ];

  // Dynamically link to existing items if available in DB
  const handleItemClick = (fallbackId: string, customId: string) => {
    const found = auctions.find(a => a.id === customId || a.id === fallbackId);
    if (found) {
      setActiveAuctionId(found.id);
      setActiveView('live');
    } else if (auctions.length > 0) {
      // Fallback to first live auction
      setActiveAuctionId(auctions[0].id);
      setActiveView('live');
    }
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
          3 live
        </span>
      </div>

      {/* Horizontal horizontal list */}
      <div className="flex gap-3 overflow-x-auto px-4 scrollbar-none pb-1">
        {displayItems.map((item) => {
          const isLightBg = item.bg === 'bg-[#F2F2EF]';
          return (
            <button
              key={item.id}
              onClick={() => handleItemClick(item.actionId, item.id)}
              className="flex flex-col items-stretch focus:outline-none shrink-0 group cursor-pointer text-left"
              style={{ width: '82px' }}
              id={`story-item-${item.id}`}
            >
              {/* Card Body */}
              <div className={`aspect-[1/1] w-20 h-20 rounded-[20px] ${item.bg} flex items-center justify-center relative shadow-sm border border-gray-100/10`}>
                {/* Large Icon */}
                <div className="transform group-hover:scale-110 transition-transform duration-300">
                  {item.icon}
                </div>

                {/* Overlaid Bottom Timer Capsule */}
                <div className={`absolute bottom-2.5 left-1/2 -translate-x-1/2 bg-black/75 px-1.5 py-0.5 rounded-full flex items-center gap-1 shrink-0`}>
                  <Clock className="w-2.5 h-2.5 text-white/90" />
                  <span className="text-[8px] font-black tracking-tight text-white/90 font-mono uppercase whitespace-nowrap leading-none mt-[0.5px]">
                    {item.time}
                  </span>
                </div>
              </div>

              {/* Text metadata below the card */}
              <div className="mt-1.5 text-center px-0.5">
                <span className="text-[10px] font-bold text-gray-700 truncate block leading-none">
                  {item.title}
                </span>
                <span className="text-[11px] font-black text-[#FF6B00] block mt-1 tracking-tight">
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
