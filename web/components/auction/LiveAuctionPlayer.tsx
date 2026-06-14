'use client';

import React, { useRef, useState, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  AlertCircle,
  VideoOff
} from 'lucide-react';

interface LiveAuctionPlayerProps {
  playbackId: string;
}

export const LiveAuctionPlayer: React.FC<LiveAuctionPlayerProps> = ({ playbackId }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Playback HLS streams logic simulation or direct Native HLS mounting
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Standard low-latency fallback source setup
    const hlsUrl = `https://stream.mux.com/${playbackId}.m3u8`;
    
    // In actual production, we check Hls.isSupported() or support native safari playback
    video.src = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4'; // fallback premium loop asset
    video.load();
    
    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setIsPlaying(true);
        })
        .catch(() => {
          // Auto-muted policies on client browser requires mute default
          setIsMuted(true);
          video.muted = true;
          video.play();
        });
    }

    return () => {
      video.pause();
    };
  }, [playbackId]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      video.play();
      setIsPlaying(true);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  return (
    <div className="w-full h-full relative bg-[#050505] overflow-hidden flex items-center justify-center">
      {/* Target HTML5 Player with inline browser referrer configurations */}
      <video
        ref={videoRef}
        referrerPolicy="no-referrer"
        playsInline
        muted={isMuted}
        loop
        autoPlay
        className="w-full h-full object-cover transition-opacity duration-300"
        style={{ filter: 'brightness(0.9)' }}
      />

      {/* Dimmed gradient overlays to increase text contrast readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/60 pointer-events-none" />

      {/* Embedded Controls Panel Overlay */}
      <div className="absolute bottom-16 left-4 flex gap-2 z-20">
        <button 
          onClick={togglePlay}
          className="w-8 h-8 rounded-lg bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center hover:bg-black/60 transition-all text-white"
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
        </button>

        <button 
          onClick={toggleMute}
          className="w-8 h-8 rounded-lg bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center hover:bg-black/60 transition-all text-white"
        >
          {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
        </button>
      </div>

      {hasError && (
        <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center p-6 text-center space-y-3 z-30">
          <VideoOff className="w-10 h-10 text-rose-500" />
          <h4 className="text-xs font-bold tracking-widest uppercase text-white font-mono">Stream Standby Offline</h4>
          <p className="text-[10px] text-gray-500 max-w-xs font-mono leading-relaxed">
            The broadcaster is currently preparing stream data packet pipes. Bid functions remain operational.
          </p>
        </div>
      )}
    </div>
  );
};
