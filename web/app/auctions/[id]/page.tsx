'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useApp } from '@/lib/store/useApp'; // Zustand Store interface
import { LiveAuctionPlayer } from '@/components/auction/LiveAuctionPlayer';
import { BidBar } from '@/components/auction/BidBar';
import { BidFeed } from '@/components/auction/BidFeed';
import { AuctionTimer } from '@/components/auction/AuctionTimer';
import { io, Socket } from 'socket.io-client';
import { 
  Tv, 
  Users, 
  Heart, 
  Share2, 
  Coins, 
  AlertTriangle, 
  CheckCircle2, 
  ShieldCheck, 
  Award,
  Wallet
} from 'lucide-react';

interface AuctionViewerProps {
  params: {
    id: string;
  };
}

export default function LiveAuctionViewerPage({ params }: AuctionViewerProps) {
  const auctionId = params.id;
  
  // Real-time states
  const [auction, setAuction] = useState<any>(null);
  const [highBid, setHighBid] = useState<number>(0);
  const [highBidderName, setHighBidderName] = useState<string>('');
  const [viewerCount, setViewerCount] = useState<number>(1);
  const [endTime, setEndTime] = useState<number>(0);
  const [isEnded, setIsEnded] = useState<boolean>(false);
  const [chats, setChats] = useState<Array<{ id: string; user: string; text: string; bid?: boolean }>>([
    { id: '1', user: 'Layla Al-Saeed', text: 'Stunning lot, pristine hallmarks!' },
    { id: '2', user: 'Tareq JO', text: 'Comes with original service box and stickers?' }
  ]);
  const [heartCount, setHeartCount] = useState<number>(12800);
  const [flyingHearts, setFlyingHearts] = useState<Array<{ id: number; left: number }>>([]);
  const socketRef = useRef<Socket | null>(null);

  // Load baseline auction telemetry data
  useEffect(() => {
    async function loadAuctionBaseline() {
      try {
        const res = await fetch(`/api/auctions/${auctionId}`);
        const data = await res.json();
        setAuction(data);
        setHighBid(Number(data.currentHighBid || data.startingBid));
        setHighBidderName(data.highBidder?.email ? data.highBidder.email.split('@')[0] : 'No Bids');
        setEndTime(new Date(data.scheduledAt).getTime() + 600000); // 10 Min baseline placeholder
      } catch (error) {
        console.error('Error establishing link back to cluster central database.', error);
      }
    }
    loadAuctionBaseline();
  }, [auctionId]);

  // Connect sockets to Fastify backend realtimes
  useEffect(() => {
    const socket = io(process.env.NEXT_PUBLIC_WS_URL || 'wss://api.mazzado.com', {
      transports: ['websocket'],
      upgrade: false
    });
    socketRef.current = socket;

    socket.emit('auction:join', { auctionId });

    socket.on('auction:state', (state: any) => {
      setHighBid(state.highBid > 0 ? state.highBid : highBid);
      setHighBidderName(state.highBidderUsername || highBidderName);
      setViewerCount(state.viewerCount);
      if (state.endTime > 0) setEndTime(state.endTime);
    });

    socket.on('bid:new', (data: any) => {
      setHighBid(data.amount);
      setHighBidderName(data.username);
      // Append top real-time chat banner
      setChats(prev => [
        ...prev,
        { 
          id: Math.random().toString(), 
          user: data.username, 
          text: `🎯 PLACED ATHLETIC BID OF ${data.amount} JOD!`, 
          bid: true 
        }
      ]);
    });

    socket.on('auction:extended', (data: any) => {
      setEndTime(data.newEndTime);
      setChats(prev => [
        ...prev,
        { 
          id: Math.random().toString(), 
          user: 'System Admin', 
          text: `⚠️ ANTI-SNIPING DETECTED: Stream extended by +30 seconds.`, 
          bid: false 
        }
      ]);
    });

    socket.on('viewer:count', (data: any) => {
      setViewerCount(data.count);
    });

    return () => {
      socket.emit('auction:leave', { auctionId });
      socket.disconnect();
    };
  }, [auctionId]);

  const sendLocalChat = (text: string) => {
    setChats(prev => [...prev, { id: Math.random().toString(), user: 'You', text }]);
  };

  const handleTriggerHeart = () => {
    setHeartCount(prev => prev + 1);
    const newHeart = { id: Date.now(), left: Math.random() * 80 + 10 };
    setFlyingHearts(prev => [...prev, newHeart]);
    setTimeout(() => {
      setFlyingHearts(prev => prev.filter(h => h.id !== newHeart.id));
    }, 2000);
  };

  if (!auction) {
    return (
      <div className="h-dvh flex items-center justify-center bg-[#0B0B0B] text-white">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 border-[#FF6B00] border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs text-white/50 tracking-widest font-mono uppercase">Syncing Jordan Live Grid Channels...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh w-full bg-[#0B0B0B] text-white flex flex-col md:flex-row overflow-hidden overscroll-behavior-none select-none font-sans">
      
      {/* 1. Left Stream Core Viewer Stage */}
      <div className="flex-1 hierarchy-viewport relative flex flex-col bg-black justify-between h-[60dvh] md:h-full">
        {/* Background Stream Player */}
        <LiveAuctionPlayer playbackId={auction.muxPlaybackId || 'dummy-mux-play'} />

        {/* Floating top bar overlay */}
        <div className="absolute top-0 inset-x-0 p-4 flex items-center justify-between z-20 bg-gradient-to-b from-black/80 to-transparent">
          <div className="flex items-center gap-2">
            <div className="bg-[#EF4444] px-2 py-0.5 rounded text-[10px] uppercase font-black tracking-widest animate-pulse flex items-center gap-1.5 shadow-lg">
              <span className="w-1.5 h-1.5 bg-white rounded-full"></span> Live
            </div>
            <div className="bg-black/60 border border-white/15 px-2.5 py-0.5 rounded text-[10px] tracking-widest font-mono flex items-center gap-1">
              <Users className="w-3 h-3 text-cyan-400" /> {viewerCount} VIEWERS
            </div>
          </div>

          <div className="bg-black/60 border border-white/15 rounded-xl px-3 py-1 flex items-center gap-2 text-xs">
            <div className="w-6 h-6 rounded-full bg-[#FF6B00] flex items-center justify-center font-bold text-[10px] text-black">JO</div>
            <div>
              <p className="font-extrabold text-[9px] uppercase tracking-wide leading-none text-white">{auction.seller?.email ? auction.seller.email.split('@')[0] : 'Owner'}</p>
              <p className="text-[7px] text-[#10B981] font-mono leading-none tracking-widest">VERIFIED MERCHANT</p>
            </div>
          </div>
        </div>

        {/* Floating Right Actions */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-5 z-25 items-center">
          <button 
            onClick={handleTriggerHeart}
            className="w-12 h-12 rounded-full bg-black/60 border border-white/10 flex flex-col items-center justify-center hover:scale-105 active:scale-95 transition-all text-rose-500 fill-current shadow-xl"
          >
            <Heart className="w-5 h-5 text-rose-500 fill-rose-500 animate-pulse" />
            <span className="text-[8px] font-bold text-white mt-0.5">{heartCount}</span>
          </button>
          
          <button className="w-10 h-10 rounded-full bg-black/60 border border-white/10 flex items-center justify-center hover:scale-105 transition-all text-white shadow-xl">
            <Share2 className="w-4 h-4" />
          </button>
        </div>

        {/* Render Floating hearts inside container view */}
        <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
          {flyingHearts.map(heart => (
            <div
              key={heart.id}
              className="absolute bottom-32 text-rose-500 text-2xl font-black fill-current animate-bounce duration-1000 ease-out flex items-center justify-center"
              style={{
                left: `${heart.left}%`,
                animation: 'heartFly 1.8s forwards'
              }}
            >
              ❤️
            </div>
          ))}
        </div>

        {/* Dynamic Countdown Overlay with sniper notifications */}
        <div className="absolute left-4 bottom-24 z-20">
          <AuctionTimer 
            endTime={endTime} 
            onExpire={() => setIsEnded(true)} 
          />
        </div>

        {/* Sticky bottom bidding controller bar */}
        <div className="w-full z-30">
          <BidBar 
            auctionId={auctionId} 
            startingBid={Number(auction.startingBid)} 
            currentHighBid={highBid} 
            minIncrement={Number(auction.startingBid) < 1000 ? 50 : 100} 
          />
        </div>
      </div>

      {/* 2. Right Desktop Live Chat Sidebar */}
      <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-white/10 bg-[#0B0B0B] flex flex-col h-[40dvh] md:h-full justify-between pb-safe">
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-[#FF6B00]">LIVE CHAT AND BID ENGINE</h3>
          <span className="w-2 h-2 rounded-full bg-[#10B981] animate-ping"></span>
        </div>

        {/* Messages list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-xs">
          <div className="bg-[#171717] p-3 rounded-xl border border-white/5 space-y-1 text-[11px]">
            <p className="text-[#FF6B00] font-black uppercase text-[9px] tracking-wider flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-orange-400" /> SECURE ESCROW RE-ROUTING
            </p>
            <p className="text-gray-400 leading-relaxed">
              Bids lock available balances immediately. Funds released upon delivery signature.
            </p>
          </div>

          <BidFeed chats={chats} />
        </div>

        {/* Simple inline Chat controller input */}
        <div className="p-3 border-t border-white/10 bg-[#111111]/90 flex gap-2">
          <input
            type="text"
            placeholder="Type comment..."
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                sendLocalChat(e.currentTarget.value);
                e.currentTarget.value = '';
              }
            }}
            className="flex-1 bg-black border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#FF6B00]"
          />
        </div>
      </div>

      {/* Embedded CSS custom Keyframe animations for real-time heart fly parameters */}
      <style jsx global>{`
        @keyframes heartFly {
          0% {
            transform: translateY(0) scale(0.6) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(-280px) scale(1.4) rotate(15deg);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
