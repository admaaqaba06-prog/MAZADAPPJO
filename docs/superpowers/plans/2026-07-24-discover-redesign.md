# Discover Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the Discover page's redundant "watch live" CTAs (3→1), remove the duplicate "Ending soon" rail, move search+category filters to a sticky position above the fold, and remove the pending-listings box (both halves of which already have proper homes elsewhere) — without touching the per-card grid design, which is already good.

**Architecture:** This is pure JSX restructuring inside one existing page component (`src/components/DiscoveryFeedView.tsx`) plus one file deletion (`CountdownStoriesBar.tsx`). No new components, no new hooks, no backend/data changes. The sticky positioning is achieved by grouping the mobile top bar and the search+pills block under ONE shared sticky wrapper (rather than giving each its own independent `sticky top-0`, which would cause them to overlap instead of stack on scroll — a well-known CSS sticky-positioning pitfall).

**Tech Stack:** React 19 + Vite + TS (`strict` off), Tailwind, existing `isAr`/responsive (`lg:`) conventions already used throughout this file.

## Global Constraints

- **Do not touch the per-card grid design** (`AuctionCard`/grid rendering, `filteredAuctions.map(...)`) — confirmed good, out of scope.
- **Do not touch, move, or remove the Join Funnel Banner** (non-member 3-step conversion pitch + live social proof) or the **Won Orders Shortcut Banner** (buyer-won-auction shortcut) — both are unrelated, legitimate elements that must stay in their current relative position in the page flow (after the hero section, before the tabs). Only their *wrapper* structure may need adjusting as a side effect of extracting search+pills out of a div they currently share.
- **Do not change `handleWatchLive()`'s implementation** — only which elements call it.
- **Do not touch Seller Center or the Admin panel** — both already have the homes this redesign relies on (Seller Center's Auctions → Pending sub-tab; Admin → Auctions & Lots), confirmed in the design doc.
- **This is a highly visual, sticky-positioning change.** Build/tsc/test passing is necessary but NOT sufficient — Task 2 requires actual browser verification (dev server or preview) that the sticky behavior works on both breakpoints before it can be called done, per the project's UI-change convention.
- **Deploy caveat:** `tsc --noEmit` currently 0 errors — keep it that way.
- **Anchor edits by TEXT, not line numbers** (repo moves fast — confirm anchors are unique before editing).
- **Workflow:** Fable SDD (Opus fallback if Fable's spend cap is hit, per standing instruction); one commit per task minimum.

---

## File Structure

**Deleted:**
- `src/components/CountdownStoriesBar.tsx` — confirmed sole consumer was `DiscoveryFeedView.tsx`; the only other repo reference (`src/utils/sharedTicker.ts`) is a code comment, not an import.

**Modified:**
- `src/components/DiscoveryFeedView.tsx` — all other changes in this plan.

---

## Task 1: Remove duplicate CTAs, the Ending-soon rail, and the pending-listings box

**Files:**
- Modify: `src/components/DiscoveryFeedView.tsx`
- Delete: `src/components/CountdownStoriesBar.tsx`

**Interfaces:** None — this task only removes code, no new exports/props.

- [ ] **Step 1: Remove the `CountdownStoriesBar` import and mount**

Anchor (import, near the top with the other component imports):
```tsx
import { CountdownStoriesBar } from './CountdownStoriesBar';
```
Delete this line entirely.

Anchor (mount point):
```tsx
      {/* Countdown Stories Bar - Horizontally Scrollable rectangular cards */}
      <CountdownStoriesBar />
```
Delete both lines (the comment and the component tag) entirely.

- [ ] **Step 2: Delete the file**

```bash
rm src/components/CountdownStoriesBar.tsx
```

Confirm no other file imports it: `grep -rln "CountdownStoriesBar" src/` should return only `src/utils/sharedTicker.ts` (a comment, not an import — leave that comment as-is, it's harmless historical context) after this deletion. If it returns any `.tsx`/`.ts` file with an actual `import` statement, STOP and report — the "sole consumer" assumption would be wrong.

- [ ] **Step 3: Remove the desktop header's "Watch Live Drops" button**

Anchor — find this exact block:
```tsx
      {/* Premium Desktop Page Header (Apple / Stripe Dashboard style) */}
      <div className="hidden lg:flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 mt-2" id="discover-desktop-header">
        <div className="space-y-1">
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">
            {isAr ? 'اكتشف المزادات الحية والنشطة' : 'Discover Live Drops'}
          </h1>
          <p className="text-xs text-gray-500 font-medium">
            {isAr
              ? 'تصفح وشارك في مزادات فيديو حية. ادفع عبر كليك ومزاد بيحتفظ بمبلغك حتى تأكيد الاستلام.'
              : 'Browse and bid in real-time video drops. Pay via CliQ — Mazad holds your payment until you confirm receipt.'}
          </p>
        </div>
        <div>
          <button
            onClick={handleWatchLive}
            className="px-4 py-2 bg-[#E85D04] hover:bg-[#D05303] text-white font-bold text-xs rounded-xl flex items-center gap-2 active:scale-95 transition-all shadow-xs cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{isAr ? 'شاهد البث الآن' : 'Watch Live Drops'}</span>
          </button>
        </div>
      </div>
```

Replace with (keep the title + subtitle, drop the button + its wrapping `<div>`):
```tsx
      {/* Premium Desktop Page Header (Apple / Stripe Dashboard style) */}
      <div className="hidden lg:block mb-6 mt-2" id="discover-desktop-header">
        <div className="space-y-1">
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">
            {isAr ? 'اكتشف المزادات الحية والنشطة' : 'Discover Live Drops'}
          </h1>
          <p className="text-xs text-gray-500 font-medium">
            {isAr
              ? 'تصفح وشارك في مزادات فيديو حية. ادفع عبر كليك ومزاد بيحتفظ بمبلغك حتى تأكيد الاستلام.'
              : 'Browse and bid in real-time video drops. Pay via CliQ — Mazad holds your payment until you confirm receipt.'}
          </p>
        </div>
      </div>
```
(The outer wrapper no longer needs `flex flex-col md:flex-row md:items-center justify-between gap-4` since there's only one child now — simplified to `hidden lg:block`.)

- [ ] **Step 4: Collapse the mobile hero card's 3-state CTA to 2 states**

Anchor — find this exact block:
```tsx
            {/* Real CTA: join (non-members) / watch live or browse (members) */}
            {!isMember ? (
              <button
                onClick={() => setActiveView('wallet')}
                className="mt-4 self-start px-4 py-2.5 bg-[#E85D04] hover:bg-orange-600 text-white font-extrabold text-xs rounded-xl transition-all shadow-md shadow-orange-900/30 active:scale-95 cursor-pointer"
                id="mobile-hero-join-cta"
              >
                {isAr ? 'انضم من ١ دينار' : 'Join from 1 JD'}
              </button>
            ) : liveNowAuctions.length > 0 ? (
              <button
                onClick={handleWatchLive}
                className="mt-4 self-start px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs rounded-xl transition-all shadow-md shadow-red-900/30 active:scale-95 cursor-pointer flex items-center gap-1.5"
                id="mobile-hero-live-cta"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                {isAr ? 'شوف المباشر' : 'Watch live'}
              </button>
            ) : (
              <button
                onClick={() => document.getElementById('discover-feed-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="mt-4 self-start px-4 py-2.5 bg-white/10 hover:bg-white/15 border border-white/15 text-white font-extrabold text-xs rounded-xl transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                id="mobile-hero-browse-cta"
              >
                <ArrowDown className="w-3.5 h-3.5" />
                {isAr ? 'تصفّح' : 'Browse'}
              </button>
            )}
```

Replace with (drop the middle "watch live" branch — the green banner above is now the sole watch-live entry point; members always see Browse, regardless of whether anything is live right now):
```tsx
            {/* Real CTA: join (non-members) / browse (members) — the green
                live-now banner above is the sole "watch live" entry point. */}
            {!isMember ? (
              <button
                onClick={() => setActiveView('wallet')}
                className="mt-4 self-start px-4 py-2.5 bg-[#E85D04] hover:bg-orange-600 text-white font-extrabold text-xs rounded-xl transition-all shadow-md shadow-orange-900/30 active:scale-95 cursor-pointer"
                id="mobile-hero-join-cta"
              >
                {isAr ? 'انضم من ١ دينار' : 'Join from 1 JD'}
              </button>
            ) : (
              <button
                onClick={() => document.getElementById('discover-feed-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="mt-4 self-start px-4 py-2.5 bg-white/10 hover:bg-white/15 border border-white/15 text-white font-extrabold text-xs rounded-xl transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                id="mobile-hero-browse-cta"
              >
                <ArrowDown className="w-3.5 h-3.5" />
                {isAr ? 'تصفّح' : 'Browse'}
              </button>
            )}
```
Note: `liveNowAuctions` may become unused elsewhere in the file after this edit — do NOT remove its declaration in this step; it's still used by the green banner's condition (`{liveNowAuctions.length > 0 && (...)}`) and by `handleWatchLive`'s internals via a separate helper. Confirm with a grep before assuming it's dead: `grep -n "liveNowAuctions" src/components/DiscoveryFeedView.tsx` should still show multiple uses after this step.

- [ ] **Step 5: Remove the pending-listings box + its now-dead memo + the now-unused `approveListing` destructure**

Anchor — find this exact block (the entire IIFE, from the comment through its closing `})()}`):
```tsx
      {/* Pending Listings Banner (For Admins & Merchants) */}
      {pendingListingsToDisplay.length > 0 && (() => {
        const isStrictAdmin = isAdminUser(currentUser);
        return (
          <div className="mx-4 mb-4 p-4 bg-orange-50/70 border border-orange-100 rounded-2xl space-y-2.5">
            <div className="flex gap-2 items-start">
              <span className="w-2 h-2 bg-[#FF6B00] rounded-full mt-1.5 animate-ping shrink-0 animate-pulse"></span>
              <div>
                <h4 className="text-xs font-extrabold text-[#FF6B00] uppercase font-sans tracking-wide">
                  {isStrictAdmin 
                    ? (isAr ? '🛡️ مراجعة واعتماد المزادات المعلقة' : '🛡️ PENDING AUCTIONS RELEASES')
                    : (isAr ? '⏳ مزادك قيد المراجعة والتحقق' : '⏳ YOUR UNDER REVIEW AUCTION')
                  }
                </h4>
                <p className="text-[10px] text-gray-500 mt-0.5 leading-snug">
                  {isStrictAdmin
                    ? (isAr ? 'بصفتك مديراً للمنصة، يمكنك اعتماد وتفعيل هذه المزادات مباشرة لتظهر لجميع المزايدين:' : 'As an Administrator, you can instantly approve and launch these lots to the public live feed:')
                    : (isAr ? 'تم رفع معروضك بنجاح وهو قيد المراجعة الأمنية وسيظهر للمزايدين فور اعتماده:' : 'Your listing was successfully uploaded. It will appear on the active live feed once approved:')
                  }
                </p>
              </div>
            </div>
            
            <div className="space-y-2 pt-1 border-t border-orange-100">
              {pendingListingsToDisplay.map(item => (
                <div key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between bg-white border border-gray-150 p-2.5 rounded-xl gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <img src={item.thumbnailUrl} alt="Cover" className="w-8 h-8 rounded-lg object-cover border border-gray-150 shrink-0" loading="lazy" width="32" height="32" />
                    <div className="min-w-0">
                      <span className="font-bold text-xs text-gray-900 block truncate leading-tight">{item.title}</span>
                      <span className="text-[9px] text-gray-400 font-mono block mt-0.5">
                        {item.startingPrice.toLocaleString()} JOD
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex gap-1.5 shrink-0">
                    {isStrictAdmin ? (
                      <button
                        onClick={() => {
                          if (window.confirm(isAr ? `هل أنت متأكد من رغبتك في تفعيل المزاد "${item.title}" فوراً؟` : `Are you sure you want to approve "${item.title}" and go live now?`)) {
                            approveListing(item.id);
                          }
                        }}
                        className="text-[10px] font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg shadow-sm transition-all cursor-pointer flex items-center gap-1"
                      >
                        ✅ {isAr ? 'موافقة وتفعيل البث' : 'Approve & Go Live'}
                      </button>
                    ) : (
                      <span className="text-[9.5px] font-bold text-orange-600 bg-orange-50 border border-orange-100 px-2 py-1 rounded-lg">
                        {isAr ? '⏳ قيد المراجعة' : '⏳ IN REVIEW'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
```
Delete this entire block.

Then find and delete the now-dead memo (a separate location, earlier in the file, near the other `React.useMemo` declarations):
```tsx
  const pendingListingsToDisplay = React.useMemo(() => {
    const isStrictAdmin = isAdminUser(currentUser);
    return auctions.filter(a => {
      if (a.status !== 'processing' && a.status !== 'pending') return false;
      if (isStrictAdmin) return true; // Admins can see all pending lots to approve on-the-fly
      return a.sellerId === currentUser?.id; // Regular merchants see their own under-review lots
    });
  }, [auctions, currentUser]);
```
Delete this entire block. Before deleting, confirm it has no other consumer: `grep -n "pendingListingsToDisplay" src/components/DiscoveryFeedView.tsx` should, after Step 5's box removal, show ONLY the declaration line itself — if it shows any other usage, STOP and report.

Then remove the now-unused `approveListing` from the `useApp()` destructure (find it in the large destructure list near the top of the component — it's a lone line among many other destructured values):
```tsx
    approveListing,
```
Delete this single line. Confirm first it has no other use in this file: `grep -n "approveListing" src/components/DiscoveryFeedView.tsx` should show only this one destructure line before your edit (the box removed in this same step was its only consumer).

**Do NOT** remove `isAdminUser` (still used elsewhere in this file, e.g. `isStrictAdminUser` near the top of the component) or `isStrictAdminUser` (used for `unreadCount` logic, unrelated to this box).

- [ ] **Step 6: Verify**

```bash
npm run build && npx vitest run && npx tsc --noEmit
```
Expected: build succeeds, all existing tests pass (no test file targets this component directly, so no test count should change), 0 TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(discover): remove duplicate watch-live CTAs, ending-soon rail, pending-listings box

- Delete CountdownStoriesBar (Ending soon rail) — duplicated the main
  grid's own live auctions, sole consumer confirmed.
- Desktop header's Watch Live Drops button removed (green banner is
  now the sole watch-live CTA); title+subtitle kept.
- Mobile hero's Watch-live button state removed (same reason); Join
  and Browse states kept.
- Pending-listings box removed entirely — seller status already has a
  home in Seller Center's Pending sub-tab, admin approval already has
  a home in Admin > Auctions & Lots. Dead memo + unused destructure
  cleaned up alongside it.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Move search + category pills to a sticky position above the green banner

**Files:**
- Modify: `src/components/DiscoveryFeedView.tsx`

**Interfaces:** None — no new props/exports, purely a JSX relocation + wrapper restructuring.

**Depends on Task 1 being committed first** (this task's anchors assume Task 1's edits are already in place — e.g., the pending-listings box between the old search wrapper and the tabs section is already gone).

- [ ] **Step 1: Group the mobile top bar under one sticky outer wrapper**

Anchor — find this exact block (the existing mobile top bar):
```tsx
      {/* Top Mobile Bar Header - Exactly like the Screenshot, hidden on desktop */}
      <div className="p-4 flex items-center justify-between sticky top-0 bg-white z-40 lg:hidden">
        <div className="flex items-center gap-2">
          {/* Orange Brand Square M logo */}
          <div className="w-9 h-9 rounded-xl bg-[#E85D04] flex items-center justify-center font-black text-white text-base shadow-sm">
            M
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-gray-950 font-sans">
              {isAr ? 'مزاد جو' : 'Mazad Jo'}
            </h1>
          </div>
        </div>

        {/* Action Header controls */}
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
            className="px-2.5 py-1.5 border border-gray-200 hover:bg-gray-50 rounded-xl text-[11px] font-bold text-gray-700 font-sans transition-all shrink-0"
            id="discover-lang-btn"
          >
            {language === 'en' ? 'العربية' : 'EN'}
          </button>

          <button
            onClick={() => setShowNotifications(true)}
            className="relative p-2 border border-gray-200 hover:bg-gray-50 text-gray-600 rounded-xl transition-all cursor-pointer flex items-center justify-center shrink-0"
            title={isAr ? 'الإشعارات' : 'Notifications'}
            id="mobile-header-bell"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-[#E85D04] text-white text-[7.5px] font-black w-3.5 h-3.5 rounded-full flex items-center justify-center border border-white animate-pulse">
                {unreadCount}
              </span>
            )}
          </button>

          <button 
            onClick={() => setActiveView('upload')}
            className="px-3 py-1.5 border border-[#E85D04] bg-[#E85D04]/5 hover:bg-[#E85D04]/10 rounded-xl text-[11px] font-bold text-[#E85D04] flex items-center gap-1 transition-all shrink-0"
            id="sell-wizard-btn"
          >
            <Plus className="w-3 h-3 stroke-[3]" /> 
            <span>{isAr ? 'بيع' : 'Sell'}</span>
          </button>
        </div>
      </div>
```

Replace with (the bar's own content is unchanged; it's now nested inside a new sticky outer wrapper, and its own `sticky top-0 bg-white z-40` classes move up to that wrapper since the wrapper now owns the sticky behavior for both the bar AND the search block that follows it in Step 2):
```tsx
      {/* Sticky top zone: mobile bar (mobile only) + search/filters (all breakpoints).
          Grouped under ONE sticky wrapper so they stack as a unit on scroll —
          two independent `sticky top-0` siblings would overlap instead of stack. */}
      <div className="sticky top-0 z-40 bg-white" id="discover-sticky-header">
        {/* Top Mobile Bar Header - hidden on desktop (global header used instead) */}
        <div className="p-4 flex items-center justify-between lg:hidden">
          <div className="flex items-center gap-2">
            {/* Orange Brand Square M logo */}
            <div className="w-9 h-9 rounded-xl bg-[#E85D04] flex items-center justify-center font-black text-white text-base shadow-sm">
              M
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-gray-950 font-sans">
                {isAr ? 'مزاد جو' : 'Mazad Jo'}
              </h1>
            </div>
          </div>

          {/* Action Header controls */}
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
              className="px-2.5 py-1.5 border border-gray-200 hover:bg-gray-50 rounded-xl text-[11px] font-bold text-gray-700 font-sans transition-all shrink-0"
              id="discover-lang-btn"
            >
              {language === 'en' ? 'العربية' : 'EN'}
            </button>

            <button
              onClick={() => setShowNotifications(true)}
              className="relative p-2 border border-gray-200 hover:bg-gray-50 text-gray-600 rounded-xl transition-all cursor-pointer flex items-center justify-center shrink-0"
              title={isAr ? 'الإشعارات' : 'Notifications'}
              id="mobile-header-bell"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-[#E85D04] text-white text-[7.5px] font-black w-3.5 h-3.5 rounded-full flex items-center justify-center border border-white animate-pulse">
                  {unreadCount}
                </span>
              )}
            </button>

            <button 
              onClick={() => setActiveView('upload')}
              className="px-3 py-1.5 border border-[#E85D04] bg-[#E85D04]/5 hover:bg-[#E85D04]/10 rounded-xl text-[11px] font-bold text-[#E85D04] flex items-center gap-1 transition-all shrink-0"
              id="sell-wizard-btn"
            >
              <Plus className="w-3 h-3 stroke-[3]" /> 
              <span>{isAr ? 'بيع' : 'Sell'}</span>
            </button>
          </div>
        </div>

        {/* Search + category pills — moved here from lower on the page (was
            buried below the hero/rail). Sticky on both breakpoints: on mobile
            it sticks together with the bar above via the shared wrapper; on
            desktop the bar is hidden so this sticks alone, immediately below
            the always-visible global header (DesktopFrame.tsx), which lives
            outside this scrollable component and never moves. */}
        <div className="px-4 pb-3 pt-3 lg:pt-4 space-y-3">
          <div className="relative">
            <input
              type="text"
              placeholder={isAr ? 'ابحث: سيارات، ساعات، عقارات…' : 'Search: cars, watches, real estate…'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full bg-[#F2F2EF] border border-transparent rounded-[18px] py-3.5 ${isAr ? 'pr-11 pl-4' : 'pl-11 pr-4'} text-xs font-medium text-gray-900 placeholder-gray-450 focus:outline-none focus:bg-white focus:border-gray-250 transition-all font-sans`}
            />
            <Search className={`absolute ${isAr ? 'right-4' : 'left-4'} top-4 w-4.5 h-4.5 text-gray-400`} />
          </div>

          {/* Elegant Horizontal Categories Carousel */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1 font-sans">
            {categoriesList.map(cat => {
              const isSelected = selectedCategory === cat.name;
              return (
                <button
                  key={cat.name}
                  onClick={() => setSelectedCategory(cat.name)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold shrink-0 transition-all border ${isSelected ? 'bg-[#FF6B00] border-[#FF6B00] text-white shadow-xs' : 'bg-white text-gray-700 border-gray-200/80 hover:bg-gray-50'}`}
                >
                  {cat.icon}
                  <span>{isAr ? cat.arName : cat.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
```

- [ ] **Step 2: Remove search + category pills from their old position, leaving the Join Funnel Banner alone in its wrapper**

Anchor — find this exact block (the OLD wrapper that used to hold the Join Funnel Banner + search + pills together):
```tsx
      {/* Search Input bar with soft beige/gray layout bg */}
      <div className="p-4 space-y-4">
        {/* Join Funnel Banner (Non-members only): 3-step money story + join CTA */}
        {currentUser?.subscriptionStatus !== 'active' && (
          <div
            className="bg-orange-50/70 border border-orange-100 rounded-2xl p-3.5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-sans"
            style={{ direction: isAr ? 'rtl' : 'ltr' }}
            id="join-funnel-banner"
          >
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] font-bold text-gray-800 leading-snug">
                <span className="flex items-center gap-1">
                  <span className="text-[#FF6B00] font-black">①</span>
                  {isAr ? 'انضم من ١ دينار بالشهر' : 'Join from 1 JD/mo'}
                </span>
                <span className="text-orange-200">•</span>
                <span className="flex items-center gap-1">
                  <span className="text-[#FF6B00] font-black">②</span>
                  {isAr ? 'زايد مجاناً' : 'Bid freely'}
                </span>
                <span className="text-orange-200">•</span>
                <span className="flex items-center gap-1">
                  <span className="text-[#FF6B00] font-black">③</span>
                  {isAr ? 'ادفع فقط عند الفوز (+٥٪ عمولة)' : 'Pay only when you win (+5% premium)'}
                </span>
              </div>
              {/* Live social proof — real count of distinct people currently
                  leading live auctions; rendered only when > 0. */}
              {biddersNow > 0 && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className="text-[10.5px] font-extrabold text-red-600 leading-snug"
                  id="join-banner-live-proof"
                >
                  {isAr
                    ? (biddersNow === 1 ? '🔥 شخص واحد بيزايد الآن' : `🔥 ${biddersNow} أشخاص بيزايدوا الآن`)
                    : `🔥 ${biddersNow} bidding right now`}
                </motion.p>
              )}
            </div>
            <button
              onClick={() => setActiveView('wallet')}
              className="px-4 py-2 bg-[#FF6B00] hover:bg-orange-600 text-white font-extrabold text-[11px] rounded-xl transition-all shadow-xs active:scale-95 cursor-pointer shrink-0"
            >
              {isAr ? 'انضم الآن — ١ د.أ' : 'Join now — 1 JD'}
            </button>
          </div>
        )}

        <div className="relative">
          <input
            type="text"
            placeholder={isAr ? 'ابحث: سيارات، ساعات، عقارات…' : 'Search: cars, watches, real estate…'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full bg-[#F2F2EF] border border-transparent rounded-[18px] py-3.5 ${isAr ? 'pr-11 pl-4' : 'pl-11 pr-4'} text-xs font-medium text-gray-900 placeholder-gray-450 focus:outline-none focus:bg-white focus:border-gray-250 transition-all font-sans`}
          />
          <Search className={`absolute ${isAr ? 'right-4' : 'left-4'} top-4 w-4.5 h-4.5 text-gray-400`} />
        </div>

        {/* Elegant Horizontal Categories Carousel */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1 font-sans">
          {categoriesList.map(cat => {
            const isSelected = selectedCategory === cat.name;
            return (
              <button
                key={cat.name}
                onClick={() => setSelectedCategory(cat.name)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold shrink-0 transition-all border ${isSelected ? 'bg-[#FF6B00] border-[#FF6B00] text-white shadow-xs' : 'bg-white text-gray-700 border-gray-200/80 hover:bg-gray-50'}`}
              >
                {cat.icon}
                <span>{isAr ? cat.arName : cat.name}</span>
              </button>
            );
          })}
        </div>
      </div>
```

Replace with (Join Funnel Banner ONLY — search input and category pills deleted from here, since Step 1 already relocated them; wrapper simplified since it now has one child, not three):
```tsx
      {/* Join Funnel Banner (Non-members only): 3-step money story + join CTA.
          Unrelated to the redesign — left in its normal place in the page flow. */}
      {currentUser?.subscriptionStatus !== 'active' && (
        <div className="p-4">
          <div
            className="bg-orange-50/70 border border-orange-100 rounded-2xl p-3.5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-sans"
            style={{ direction: isAr ? 'rtl' : 'ltr' }}
            id="join-funnel-banner"
          >
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] font-bold text-gray-800 leading-snug">
                <span className="flex items-center gap-1">
                  <span className="text-[#FF6B00] font-black">①</span>
                  {isAr ? 'انضم من ١ دينار بالشهر' : 'Join from 1 JD/mo'}
                </span>
                <span className="text-orange-200">•</span>
                <span className="flex items-center gap-1">
                  <span className="text-[#FF6B00] font-black">②</span>
                  {isAr ? 'زايد مجاناً' : 'Bid freely'}
                </span>
                <span className="text-orange-200">•</span>
                <span className="flex items-center gap-1">
                  <span className="text-[#FF6B00] font-black">③</span>
                  {isAr ? 'ادفع فقط عند الفوز (+٥٪ عمولة)' : 'Pay only when you win (+5% premium)'}
                </span>
              </div>
              {/* Live social proof — real count of distinct people currently
                  leading live auctions; rendered only when > 0. */}
              {biddersNow > 0 && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className="text-[10.5px] font-extrabold text-red-600 leading-snug"
                  id="join-banner-live-proof"
                >
                  {isAr
                    ? (biddersNow === 1 ? '🔥 شخص واحد بيزايد الآن' : `🔥 ${biddersNow} أشخاص بيزايدوا الآن`)
                    : `🔥 ${biddersNow} bidding right now`}
                </motion.p>
              )}
            </div>
            <button
              onClick={() => setActiveView('wallet')}
              className="px-4 py-2 bg-[#FF6B00] hover:bg-orange-600 text-white font-extrabold text-[11px] rounded-xl transition-all shadow-xs active:scale-95 cursor-pointer shrink-0"
            >
              {isAr ? 'انضم الآن — ١ د.أ' : 'Join now — 1 JD'}
            </button>
          </div>
        </div>
      )}
```

**Do NOT touch** the "Won Orders Shortcut Banner" block that immediately follows this one in the file (starts with the comment `{/* Won Orders Shortcut Banner / Widget */}`) — it stays exactly as-is, in its current position, right after the Join Funnel Banner and before the tabs section.

- [ ] **Step 3: Verify the JSX order**

After Steps 1–2, confirm via `grep -n` that the top-to-bottom order in the file is now: sticky wrapper (mobile bar + search/pills) → green live-now banner → desktop header (title/subtitle only) → mobile hero card → Join Funnel Banner → Won Orders Shortcut Banner → Tabs → Grid. Use:
```bash
grep -n "discover-sticky-header\|live-now-strip\|discover-desktop-header\|Hero Welcome Banner Card\|join-funnel-banner\|Won Orders Shortcut\|Tabs active live feed" src/components/DiscoveryFeedView.tsx
```
Expected: line numbers appear in that exact relative order (ascending).

- [ ] **Step 4: Build + regression verify**

```bash
npm run build && npx vitest run && npx tsc --noEmit
```
Expected: build succeeds, all existing tests pass, 0 TypeScript errors.

- [ ] **Step 5: Manual visual verification (REQUIRED — do not skip)**

Start the dev server and open the Discover page in a real browser at both a mobile viewport width (~390px) and a desktop width (~1440px). Confirm:
- Search input + category pills are visible immediately below the top bar/nav on page load, above the green banner.
- Scrolling the page down: the search+pills block (and, on mobile, the bar above it) stays pinned to the top instead of scrolling away.
- The green "Live now" banner still appears/hides correctly based on whether any auction is genuinely live (unchanged logic — just confirm no regression).
- The Join Funnel Banner (for a non-member account) and the Won Orders Shortcut Banner (if applicable test data exists) still render correctly in their position after the hero section.
- No layout overlap, no double-rendered search bars, no visual glitches at the mobile/desktop breakpoint transition (~1024px).

Report exactly what you observed (with a description of what you saw, or a screenshot if your environment supports one) — do not report this step as passed without having actually looked at the rendered page.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(discover): move search + category filters to a sticky position

Grouped under one sticky wrapper with the mobile top bar (avoids the
independent-sticky-siblings overlap problem) so both breakpoints get
filtering as the first actionable thing below the top nav, matching
standard marketplace-browse convention (eBay/StockX/Whatnot put
search/filter immediately below the header, often sticky).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Post-implementation

- Finish via superpowers:finishing-a-development-branch → PR → merge (per MJ's standing instruction).
- No manual smoke test needed beyond Task 2's Step 5 browser check — this slice has no backend/data dependency, so there's nothing further that can only be validated with live production data.

## Self-Review

**Spec coverage:** one watch-live CTA (Task 1 Steps 3–4) ✓; ending-soon rail removed (Task 1 Steps 1–2) ✓; search+pills sticky above the fold (Task 2) ✓; pending-listings box removed, dead code cleaned up (Task 1 Step 5) ✓; per-card grid untouched (no task touches it) ✓; Join Funnel Banner / Won Orders Banner preserved in place (Task 2 Step 2, explicit "do not touch" callout) ✓; Seller Center / Admin panel untouched (no task touches either file) ✓.

**Placeholder scan:** no TBD/TODO. Every JSX block is quoted in full (before AND after) for every edit — no "similar to above" shortcuts.

**Type consistency:** N/A — no new functions, types, or props introduced in this plan; purely JSX relocation using existing in-scope variables (`searchTerm`, `setSearchTerm`, `selectedCategory`, `setSelectedCategory`, `categoriesList`, `isAr`, `language`, `setLanguage`, `unreadCount`, `setShowNotifications`, `setActiveView`, `currentUser`, `biddersNow`, `handleWatchLive`, `liveNowAuctions`) — all already declared earlier in the same component function, unaffected by relocating the JSX that reads them.
