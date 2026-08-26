import React from 'react';
import { Heart, ArrowRight } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { PremiumAuctionCard } from './DiscoveryFeedView';

/**
 * Saved lots.
 *
 * THE GAP THIS CLOSES: the Discover cards grew a watchlist heart, and
 * `toggleWatchlist` has always persisted to localStorage, but nothing in the app
 * ever LISTED what you saved. LiveStreamView reads the same array for its own
 * save toggle, so the state was real — it just had no drawer that opened. A save
 * button with nowhere to see saves is worse than no save button.
 *
 * Reuses `PremiumAuctionCard` rather than restyling a second card. That card owns
 * the countdown, the live/awaiting/ended states, the your-standing chip and the
 * ended-winner route to the order; a bespoke card here would drift from it on the
 * first change to any of those.
 *
 * ONLY LOADED LOTS CAN BE SHOWN, and the count makes that explicit rather than
 * hiding it. `auctions` is the filtered, currently-loaded set — a saved lot from
 * an old session that the feed has not paged in resolves to nothing. Showing
 * "12 saved · 9 shown" is honest; silently rendering nine and calling it the
 * whole watchlist is not.
 */
export const WatchlistView: React.FC = () => {
  const {
    watchlist,
    toggleWatchlist,
    auctions,
    currentUser,
    bids,
    orders,
    sellerProfiles,
    language,
    setActiveAuctionId,
    setActiveView,
    setGlobalSelectedOrderId,
  } = useApp();

  const isAr = language === 'ar';

  // Watchlist order, not feed order: the list should read newest-saved-first the
  // way the user built it, so it is driven by `watchlist` and looks each id up
  // rather than filtering `auctions` and inheriting the feed's sort.
  const saved = watchlist
    .map(id => auctions.find(a => a.id === id))
    .filter((a): a is NonNullable<typeof a> => !!a);

  const unavailable = watchlist.length - saved.length;

  const handleJoinLive = (id: string) => {
    setActiveAuctionId(id);
    setActiveView('live');
  };

  return (
    <div
      className="flex-1 min-h-0 w-full overflow-y-auto bg-surface pb-[calc(6rem+env(safe-area-inset-bottom))] font-sans text-fg"
      style={{ direction: isAr ? 'rtl' : 'ltr' }}
      id="watchlist-root"
    >
      <header className="sticky top-0 z-30 border-b border-line/60 bg-surface/90 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveView('discovery')}
            aria-label={isAr ? 'رجوع' : 'Back'}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-line/70 bg-surface-raised text-fg-muted shadow-xs transition-colors hover:bg-surface-sunken cursor-pointer"
          >
            {/* rtl:rotate-180 rather than swapping the icon: one element, and the
                arrow always points back toward the feed. */}
            <ArrowRight className="h-4 w-4 rtl:rotate-180" />
          </button>
          <h1 className="text-[17px] font-bold tracking-tight">
            {isAr ? 'المفضلة' : 'Saved'}
          </h1>
          {saved.length > 0 && (
            <span className="rounded-full bg-[#FF6B00]/10 px-2 py-0.5 text-[11px] font-bold text-[#FF6B00]">
              {saved.length}
            </span>
          )}
        </div>
        {unavailable > 0 && (
          <p className="mt-1.5 text-[11px] font-medium text-fg-muted">
            {isAr
              ? `${unavailable} من محفوظاتك غير متاحة للعرض حالياً`
              : `${unavailable} saved ${unavailable === 1 ? 'lot is' : 'lots are'} not loaded right now`}
          </p>
        )}
      </header>

      {saved.length === 0 ? (
        /* Empty state routes back into the feed. A dead end here is how a user
           decides the feature is broken. */
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-sunken">
            <Heart className="h-7 w-7 text-fg-muted/60" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-[15px] font-bold">
              {isAr ? 'لا يوجد شيء محفوظ بعد' : 'Nothing saved yet'}
            </h2>
            <p className="text-xs font-medium leading-relaxed text-fg-muted">
              {isAr
                ? 'اضغط ♥ على أي مزاد ليظهر هنا، وترجع له بسرعة قبل ما ينتهي.'
                : 'Tap ♥ on any auction to keep it here and come back before it ends.'}
            </p>
          </div>
          <button
            onClick={() => setActiveView('discovery')}
            className="mt-1 rounded-2xl bg-[#FF6B00] px-5 py-3 text-xs font-bold text-white transition-transform active:scale-95 cursor-pointer"
          >
            {isAr ? 'تصفّح المزادات' : 'Browse auctions'}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 p-4 md:grid-cols-3 md:gap-6 xl:grid-cols-4">
          {saved.map(item => (
            <PremiumAuctionCard
              key={item.id}
              item={item}
              currentUser={currentUser}
              bids={bids}
              orders={orders}
              sellerProfiles={sellerProfiles}
              isAr={isAr}
              onJoinLive={handleJoinLive}
              onSelectLot={handleJoinLive}
              setGlobalSelectedOrderId={setGlobalSelectedOrderId}
              setActiveView={setActiveView}
              isWatched={watchlist.includes(item.id)}
              onToggleWatch={toggleWatchlist}
            />
          ))}
        </div>
      )}
    </div>
  );
};
