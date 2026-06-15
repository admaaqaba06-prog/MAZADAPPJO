import React, { useState, useEffect } from 'react';
import { db } from '../services/firebase';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';

export const ReelsView: React.FC = () => {
  const [auctions, setAuctions] = useState<any[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, 'auctions'),
      where('status', '==', 'live'),
      orderBy('approvedAt', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const liveAuctions = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAuctions(liveAuctions);
    }, (error) => {
      console.warn("ReelsView index might not be built yet, querying by status only:", error);
      const qFallback = query(collection(db, 'auctions'), where('status', '==', 'live'));
      const unsubFallback = onSnapshot(qFallback, (snap) => {
        const liveAuctions = snap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setAuctions(liveAuctions);
      });
      return unsubFallback;
    });
    
    return () => unsubscribe();
  }, []);

  return (
    <div className="p-4 bg-zinc-950 text-white min-h-screen" dir="rtl" id="reels-view-direct-panel">
      <h2 className="text-lg font-bold mb-4">🎥 المزايدات المباشرة (بثث Reels)</h2>
      {auctions.length === 0 ? (
        <p className="text-zinc-400 text-sm">لا يوجد مزادات حية حالياً.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {auctions.map((item) => (
            <div key={item.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
              <video src={item.videoUrl} controls className="w-full h-48 object-cover rounded-lg" playsInline />
              <div>
                <h3 className="font-extrabold text-sm">{item.title}</h3>
                <p className="text-xs text-zinc-400 mt-1">{item.description}</p>
                <div className="flex justify-between items-center mt-3 pt-3 border-t border-zinc-800/60">
                  <span className="text-xs text-[#FF6B00] font-black">{item.currentPrice || item.startingPrice} JOD</span>
                  <span className="text-[10px] bg-red-500/10 border border-red-500/20 text-red-500 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider animate-pulse">LIVE</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ReelsView;
