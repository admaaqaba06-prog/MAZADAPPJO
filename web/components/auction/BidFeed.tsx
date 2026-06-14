import React from 'react';
import { Sparkles, MessageSquare } from 'lucide-react';

interface ChatMessage {
  id: string;
  user: string;
  text: string;
  bid?: boolean;
}

interface BidFeedProps {
  chats: ChatMessage[];
}

export const BidFeed: React.FC<BidFeedProps> = ({ chats }) => {
  return (
    <div className="space-y-2 mt-4 max-h-[300px] overflow-y-auto pr-1">
      {chats.map((chat) => (
        <div 
          key={chat.id} 
          className={`p-2 rounded-xl border transition-all text-[11px] ${
            chat.bid 
              ? 'bg-[#FF6B00]/10 border-[#FF6B00]/30 text-white shadow-sm' 
              : 'bg-white/2 border-white/5 text-gray-300'
          }`}
        >
          <div className="flex justify-between items-center mb-0.5">
            <span className={`font-black uppercase tracking-wide text-[9px] ${chat.bid ? 'text-[#FF6B00]' : 'text-gray-400'}`}>
              {chat.user}
            </span>
            {chat.bid && (
              <span className="bg-[#FF6B00] text-black text-[8px] font-black px-1 rounded flex items-center gap-0.5 uppercase tracking-widest scale-95 origin-right">
                <Sparkles className="w-2.5 h-2.5 text-black fill-current" /> BID
              </span>
            )}
          </div>
          <p className="leading-relaxed font-mono">{chat.text}</p>
        </div>
      ))}
    </div>
  );
};
