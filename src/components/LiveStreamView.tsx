import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { 
  FolderLock
} from 'lucide-react';
import { AuctionDetailsModal } from './AuctionDetailsModal';
import { MobileLiveAuctionLayout } from './MobileLiveAuctionLayout';
import { DesktopLiveAuctionLayout } from './DesktopLiveAuctionLayout';

// Names & logs for realistic simulation
const JORDANIAN_NAMES = [
  'أحمد الشمري', 'تالا القضاة', 'حمزة الكردي', 'ديما عبيد', 'زيد الفايز', 
  'فرح حداد', 'تامر المصري', 'ليث الزعبي', 'رنا التل', 'رائد العبادي',
  'Yousef K.', 'Noor A.', 'Samer J.', 'Rama F.', 'Omar M.', 'Hala S.'
];

export const LiveStreamView: React.FC = () => {
  const { 
    currentUser, 
    auctions, 
    activeAuctionId, 
    setActiveAuctionId, 
    setActiveView, 
    placeBid, 
    wallet,
    language,
    watchlist,
    toggleWatchlist,
    chatMessages,
    sendChatMessage
  } = useApp();

  const isAr = language === 'ar';
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoContainerRef = useRef<HTMLDivElement | null>(null);

  // Core visual settings
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [showToast, setShowToast] = useState<string | null>(null);
  const [selectedLotDetailsId, setSelectedLotDetailsId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState<string>('');

  // Local overrides for dynamic feedback
  const [localCurrentPrices, setLocalCurrentPrices] = useState<Record<string, number>>({});
  const [simulatedBids, setSimulatedBids] = useState<Record<string, Array<{id: string, name: string, amount: number, time: string}>>>({});
  const [simulatedActivities, setSimulatedActivities] = useState<Record<string, Array<{id: string, name: string, type: 'join' | 'like' | 'save' | 'follow', textAr: string, textEn: string, time: string}>>>({});
  
  // Immersive overlay states (messages and alerts that fade away dynamically)
  const [activeComments, setActiveComments] = useState<Array<any>>([]);
  const [activeActivities, setActiveActivities] = useState<Array<any>>([]);

  // Stream viewer count simulation
  const [viewerCount, setViewerCount] = useState<number>(2354);

  // Get live and upcoming auctions
  const liveAuctions = useMemo(() => {
    const filtered = auctions.filter(a => a.status === 'live' || a.status === 'upcoming');
    const displayList = filtered.length > 0 ? filtered : auctions;
    return [...displayList].sort((a, b) => {
      const tA = a.approvedAt ? (a.approvedAt.seconds ? a.approvedAt.seconds * 1000 : Number(a.approvedAt)) : (a.createdAt || 0);
      const tB = b.approvedAt ? (b.approvedAt.seconds ? b.approvedAt.seconds * 1000 : Number(b.approvedAt)) : (b.createdAt || 0);
      return tB - tA;
    });
  }, [auctions]);

  // Set initial active auction if none is set
  useEffect(() => {
    if (liveAuctions.length > 0 && !activeAuctionId) {
      setActiveAuctionId(liveAuctions[0].id);
    }
  }, [liveAuctions, activeAuctionId, setActiveAuctionId]);

  // Active auction item helper
  const activeAuction = useMemo(() => {
    return liveAuctions.find(a => a.id === activeAuctionId) || liveAuctions[0];
  }, [liveAuctions, activeAuctionId]);

  const activePrice = activeAuction 
    ? (localCurrentPrices[activeAuction.id] || activeAuction.currentPrice) 
    : 0;

  // Sync video source & playback when active lot swaps
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeAuction) return;

    video.src = activeAuction.videoUrl;
    video.load();
    video.muted = isMuted;

    if (isPlaying) {
      video.play().catch(err => {
        console.warn("Autoplay was blocked, muted instead:", err);
        video.muted = true;
        setIsMuted(true);
        video.play().catch(e => console.error("Playback failed entirely:", e));
      });
    } else {
      video.pause();
    }
  }, [activeAuctionId, activeAuction?.videoUrl]);

  // Manage mute state on video tag
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // Fullscreen support
  const toggleFullscreen = () => {
    if (!videoContainerRef.current) return;
    if (!document.fullscreenElement) {
      videoContainerRef.current.requestFullscreen().catch((err) => {
        console.error("Error attempting to enable fullscreen:", err);
      });
    } else {
      document.exitFullscreen();
    }
  };

  // Handle countdown timers per card
  const [timeLeftStr, setTimeLeftStr] = useState<string>('00:00:00');
  useEffect(() => {
    if (!activeAuction) return;
    const interval = setInterval(() => {
      const remainingSecs = Math.max(0, Math.floor((activeAuction.endTime - Date.now()) / 1000));
      if (remainingSecs > 0) {
        const hrs = Math.floor(remainingSecs / 3600);
        const mins = Math.floor((remainingSecs % 3600) / 60);
        const secs = remainingSecs % 60;
        setTimeLeftStr(
          `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
        );
      } else {
        const now = new Date();
        const hrs = 4 - (now.getHours() % 4);
        const mins = 59 - now.getMinutes();
        const secs = 59 - now.getSeconds();
        setTimeLeftStr(
          `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
        );
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeAuction]);

  // Active auction watchlist checks
  const isSaved = activeAuction ? watchlist.includes(activeAuction.id) : false;

  // Sync active comments state with chatMessages from global store
  useEffect(() => {
    if (!activeAuction) return;
    const lotChats = chatMessages.filter(msg => msg.auctionId === activeAuction.id);
    if (lotChats.length === 0) return;
    
    // Get the most recent chat message
    const latestChat = lotChats[lotChats.length - 1];
    
    // Avoid duplicating
    if (activeComments.some(c => c.id === latestChat.id)) return;
    
    // Append and keep only the latest 5 comments
    const newComment = { ...latestChat, localTimestamp: Date.now() };
    setActiveComments(prev => [...prev.slice(-4), newComment]);
    
    // Set timer to fade it out after 7 seconds
    const timer = setTimeout(() => {
      setActiveComments(prev => prev.filter(c => c.id !== latestChat.id));
    }, 7000);
    
    return () => clearTimeout(timer);
  }, [chatMessages, activeAuction?.id]);

  // Sync active activities state with generated live events
  useEffect(() => {
    if (!activeAuction) return;
    const currentSimulatedActivities = simulatedActivities[activeAuction.id] || [];
    if (currentSimulatedActivities.length === 0) return;
    
    // Get the latest event (which is index 0 in our prepended simulation array)
    const latestAct = currentSimulatedActivities[0];
    if (activeActivities.some(a => a.id === latestAct.id)) return;
    
    // Append and keep only latest 4 activities
    setActiveActivities(prev => [...prev.slice(-3), latestAct]);
    
    // Set timer to fade it out after 6 seconds
    const timer = setTimeout(() => {
      setActiveActivities(prev => prev.filter(a => a.id !== latestAct.id));
    }, 6000);
    
    return () => clearTimeout(timer);
  }, [simulatedActivities, activeAuction?.id]);

  // Simulated live activity & bids loop
  useEffect(() => {
    if (!activeAuction) return;

    // Build default activity & bids if empty
    if (!simulatedBids[activeAuction.id]) {
      const basePrice = activeAuction.currentPrice;
      const initialBids = [
        { id: `bid-1-${activeAuction.id}`, name: JORDANIAN_NAMES[0], amount: basePrice - 75, time: '2 mins ago' },
        { id: `bid-2-${activeAuction.id}`, name: JORDANIAN_NAMES[1], amount: basePrice - 50, time: '1 min ago' },
      ].filter(b => b.amount > 0);
      setSimulatedBids(prev => ({ ...prev, [activeAuction.id]: initialBids }));
    }

    if (!simulatedActivities[activeAuction.id]) {
      const initialActivities = [
        { id: `act-1-${activeAuction.id}`, name: JORDANIAN_NAMES[3], type: 'join' as const, textAr: 'انضم إلى البث', textEn: 'joined the room', time: '1 min ago' },
        { id: `act-2-${activeAuction.id}`, name: JORDANIAN_NAMES[4], type: 'like' as const, textAr: 'أعجب بالمعروض المباشر', textEn: 'sent a heart to this lot', time: '45s ago' },
      ];
      setSimulatedActivities(prev => ({ ...prev, [activeAuction.id]: initialActivities }));
    }

    // Interval to inject dynamic events
    const interval = setInterval(() => {
      setViewerCount(prev => Math.max(120, prev + Math.floor(Math.random() * 21) - 10));

      const randUser = JORDANIAN_NAMES[Math.floor(Math.random() * JORDANIAN_NAMES.length)];
      const dice = Math.random();

      if (dice < 0.35) {
        // Someone joins the stream
        const newAct = {
          id: `act-dyn-${Date.now()}`,
          name: randUser,
          type: 'join' as const,
          textAr: 'انضم إلى البث',
          textEn: 'joined',
          time: isAr ? 'الآن' : 'now'
        };
        setSimulatedActivities(prev => ({
          ...prev,
          [activeAuction.id]: [newAct, ...(prev[activeAuction.id] || [])].slice(0, 15)
        }));
      } else if (dice < 0.65) {
        // Someone likes
        const newAct = {
          id: `act-dyn-${Date.now()}`,
          name: randUser,
          type: 'like' as const,
          textAr: 'أرسل قلباً للبث المباشر',
          textEn: 'liked',
          time: isAr ? 'الآن' : 'now'
        };
        setSimulatedActivities(prev => ({
          ...prev,
          [activeAuction.id]: [newAct, ...(prev[activeAuction.id] || [])].slice(0, 15)
        }));
      } else if (dice < 0.85) {
        // Someone follows
        const newAct = {
          id: `act-dyn-${Date.now()}`,
          name: randUser,
          type: 'follow' as const,
          textAr: 'تابع البائع للتو ⭐️',
          textEn: 'followed ⭐️',
          time: isAr ? 'الآن' : 'now'
        };
        setSimulatedActivities(prev => ({
          ...prev,
          [activeAuction.id]: [newAct, ...(prev[activeAuction.id] || [])].slice(0, 15)
        }));
      } else {
        // Someone places a live bid
        const currentLocalPrice = localCurrentPrices[activeAuction.id] || activeAuction.currentPrice;
        const raise = Math.random() < 0.5 ? 10 : 25;
        const newBidVal = currentLocalPrice + raise;

        setLocalCurrentPrices(prev => ({ ...prev, [activeAuction.id]: newBidVal }));

        const newBid = {
          id: `bid-dyn-${Date.now()}`,
          name: randUser,
          amount: newBidVal,
          time: isAr ? 'الآن' : 'now'
        };

        const newAct = {
          id: `act-dyn-${Date.now()}`,
          name: randUser,
          type: 'like' as const,
          textAr: `زايد بقيمة +${raise} د.أ`,
          textEn: `bid +${raise}`,
          time: isAr ? 'الآن' : 'now'
        };

        setSimulatedBids(prev => ({
          ...prev,
          [activeAuction.id]: [newBid, ...(prev[activeAuction.id] || [])].slice(0, 12)
        }));

        setSimulatedActivities(prev => ({
          ...prev,
          [activeAuction.id]: [newAct, ...(prev[activeAuction.id] || [])].slice(0, 15)
        }));
      }

    }, 5500);

    return () => clearInterval(interval);
  }, [activeAuctionId, activeAuction, localCurrentPrices, isAr]);

  const triggerToast = (msg: string) => {
    setShowToast(msg);
    setTimeout(() => setShowToast(null), 3000);
  };

  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      video.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleMuteToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMuted(!isMuted);
    triggerToast(!isMuted ? (isAr ? '🔊 تم تشغيل الصوت المباشر' : '🔊 Stream unmuted') : (isAr ? '🔇 تم كتم الصوت' : '🔇 Stream muted'));
  };

  const executeBid = async (amount: number) => {
    if (currentUser?.isBlocked) {
      triggerToast(isAr ? '❌ حسابك محظور من المزايدة حالياً!' : '❌ Your account is blocked from bidding!');
      return;
    }
    const res = await placeBid(activeAuction.id, amount);
    if (!res.success) {
      triggerToast(res.message);
    } else {
      triggerToast(isAr ? '🚀 تم تقديم المزايدة بنجاح!' : '🚀 Bid Placed Successfully!');
      
      // Update local overrides immediately for lag-free premium feel
      setLocalCurrentPrices(prev => ({ ...prev, [activeAuction.id]: amount }));

      const newBid = {
        id: `user-bid-${Date.now()}`,
        name: currentUser?.name || (isAr ? 'أنت' : 'You'),
        amount: amount,
        time: isAr ? 'الآن' : 'now'
      };

      const newAct = {
        id: `user-act-${Date.now()}`,
        name: currentUser?.name || (isAr ? 'أنت' : 'You'),
        type: 'like' as const,
        textAr: `قدّم مزايدة جديدة بقيمة ${amount} د.أ`,
        textEn: `bid +${amount - activePrice}`,
        time: isAr ? 'الآن' : 'now'
      };

      setSimulatedBids(prev => ({
        ...prev,
        [activeAuction.id]: [newBid, ...(prev[activeAuction.id] || [])].slice(0, 12)
      }));

      setSimulatedActivities(prev => ({
        ...prev,
        [activeAuction.id]: [newAct, ...(prev[activeAuction.id] || [])].slice(0, 15)
      }));
    }
  };

  const handleLikeToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerToast(isAr ? '❤️ أرسلت تفاعلاً للبث المباشر!' : '❤️ Sent stream appreciation!');
    
    // Add to activity
    const newAct = {
      id: `act-like-${Date.now()}`,
      name: currentUser?.name || (isAr ? 'أنت' : 'You'),
      type: 'like' as const,
      textAr: 'أرسل قلباً للبث المباشر',
      textEn: 'sent a love reaction',
      time: isAr ? 'الآن' : 'now'
    };
    setSimulatedActivities(prev => ({
      ...prev,
      [activeAuction.id]: [newAct, ...(prev[activeAuction.id] || [])].slice(0, 15)
    }));
  };

  const handleSaveToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleWatchlist(activeAuction.id);
    const saved = !isSaved;
    triggerToast(saved ? (isAr ? '🔖 تم الحفظ في قائمتك!' : '🔖 Saved to Watchlist!') : (isAr ? 'تمت الإزالة من المفضلة' : 'Removed from Watchlist'));
  };

  const handleShareClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(window.location.href);
    triggerToast(isAr ? '🔗 تم نسخ رابط البث لمشاركته!' : '🔗 Broadcast link copied to clipboard!');
  };

  const handleCommentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    sendChatMessage(commentText);
    setCommentText('');
  };

  if (!activeAuction) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center text-center bg-[#070709] p-6 text-gray-400 h-full" id="no-live-stream-fallback">
        <FolderLock className="w-12 h-12 text-[#FF6B00] mb-3 animate-bounce" />
        <h3 className="font-extrabold text-sm uppercase text-white">{isAr ? 'لا يوجد بثوث نشطة حالياً' : 'No channels active'}</h3>
        <button 
          onClick={() => setActiveView('discovery')}
          className="mt-6 px-5 py-2.5 bg-[#FF6B00] text-white rounded-xl text-xs font-black shadow-md uppercase hover:bg-orange-500 transition-colors cursor-pointer"
        >
          {isAr ? 'العودة للرئيسية' : 'Back to Home'}
        </button>
      </div>
    );
  }

  const [isMobile, setIsMobile] = useState<boolean>(false);
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const nextBidAmount = activePrice + 10;

  return (
    <div className="w-full h-full relative" id="live-stream-viewport-wrapper">
      {isMobile ? (
        <MobileLiveAuctionLayout
          liveAuctions={liveAuctions}
          activeAuctionId={activeAuctionId}
          onSelectAuction={(id) => setActiveAuctionId(id)}
          activeAuction={activeAuction}
          activePrice={activePrice}
          timeLeftStr={timeLeftStr}
          isMuted={isMuted}
          isPlaying={isPlaying}
          onMuteToggle={handleMuteToggle}
          onPlayPauseToggle={togglePlayPause}
          onShareClick={handleShareClick}
          onSaveToggle={handleSaveToggle}
          onLikeToggle={handleLikeToggle}
          isSaved={isSaved}
          viewerCount={viewerCount}
          activeComments={activeComments}
          activeActivities={activeActivities}
          commentText={commentText}
          setCommentText={setCommentText}
          onCommentSubmit={handleCommentSubmit}
          nextBidAmount={nextBidAmount}
          onBidExecute={executeBid}
          wallet={wallet}
          currentUser={currentUser}
          language={language}
          isAr={isAr}
          onOpenDetails={(id) => setSelectedLotDetailsId(id)}
          videoRef={videoRef}
          videoContainerRef={videoContainerRef}
          showToast={showToast}
          onClose={() => setActiveView('discovery')}
        />
      ) : (
        <DesktopLiveAuctionLayout
          activeAuction={activeAuction}
          activePrice={activePrice}
          timeLeftStr={timeLeftStr}
          isMuted={isMuted}
          isPlaying={isPlaying}
          onMuteToggle={handleMuteToggle}
          onPlayPauseToggle={togglePlayPause}
          onShareClick={handleShareClick}
          onSaveToggle={handleSaveToggle}
          onLikeToggle={handleLikeToggle}
          isSaved={isSaved}
          viewerCount={viewerCount}
          activeComments={activeComments}
          activeActivities={activeActivities}
          commentText={commentText}
          setCommentText={setCommentText}
          onCommentSubmit={handleCommentSubmit}
          nextBidAmount={nextBidAmount}
          onBidExecute={executeBid}
          wallet={wallet}
          currentUser={currentUser}
          isAr={isAr}
          onOpenDetails={(id) => setSelectedLotDetailsId(id)}
          liveAuctions={liveAuctions}
          onSelectAuction={(id) => setActiveAuctionId(id)}
          videoRef={videoRef}
          videoContainerRef={videoContainerRef}
          showToast={showToast}
          toggleFullscreen={toggleFullscreen}
        />
      )}

      {/* Slide-up lot specifications sheet details modal */}
      {selectedLotDetailsId && (
        <AuctionDetailsModal 
          lotId={selectedLotDetailsId} 
          onClose={() => setSelectedLotDetailsId(null)} 
        />
      )}
    </div>
  );
};
