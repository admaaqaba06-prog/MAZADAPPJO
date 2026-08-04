import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { notificationAudience, userFacingNotifications } from '../utils/notifications';
import { notificationDestination } from '../utils/notificationDestination';
import { isAdminUser } from '../utils/adminAuth';
import type { Notification as AppNotification } from '../types';
import { 
  X, 
  Bell, 
  CheckCheck, 
  Trophy, 
  AlertCircle, 
  ShieldCheck, 
  Gavel, 
  Coins, 
  Info, 
  Trash2,
  Crown,
  Shield,
  Wallet,
  Package,
  XCircle,
  Clock,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

// Two kinds of chip share one control: an AUDIENCE ('buying'/'selling') and a
// TYPE. A user thinks "what happened with my sales?", not "show me type=win",
// and the same type serves both sides — a seller's payout and a buyer's win are
// both 'win', separable only through the order (see notificationAudience).
type NotificationFilterType =
  | 'all' | 'buying' | 'selling'
  | 'outbid' | 'bid' | 'win' | 'loss' | 'wallet' | 'order' | 'subscription' | 'admin';

const AUDIENCE_FILTERS: readonly NotificationFilterType[] = ['buying', 'selling'];

// Regular users lead with the audience split; admins keep the full unfiltered
// type stream for ops visibility.
const USER_FILTER_CHIPS: readonly NotificationFilterType[] = ['all', 'buying', 'selling', 'outbid', 'win', 'order', 'subscription'];
const ADMIN_FILTER_CHIPS: readonly NotificationFilterType[] = ['all', 'outbid', 'bid', 'win', 'loss', 'wallet', 'order', 'subscription', 'admin'];

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ isOpen, onClose }) => {
  const {
    notifications,
    setNotifications,
    markAsRead,
    markAllAsRead,
    language,
    currentUser,
    orders,
    setActiveView,
    setActiveAuctionId,
    setGlobalSelectedOrderId
  } = useApp();

  const [selectedFilter, setSelectedFilter] = useState<NotificationFilterType>('all');

  /**
   * Read + go, in one action.
   *
   * Marking read is unconditional — it is what the click always meant. The
   * navigation is best-effort on top: `notificationDestination` returns null
   * whenever it cannot say WHERE with certainty (an announcement, an unknown or
   * legacy type, a blank id), and null means stay put. Staying put is always
   * safe; landing on the wrong lot or an empty screen reads as a broken auction
   * rather than a broken bell.
   */
  const handleNotificationClick = (item: AppNotification) => {
    markAsRead(item.id);
    const destination = notificationDestination(item);
    if (!destination) return;

    if (destination.view === 'live') {
      setActiveAuctionId(destination.auctionId);
    } else if (destination.view === 'orders') {
      setGlobalSelectedOrderId(destination.orderId);
    }
    setActiveView(destination.view);
    // The panel is an overlay — leaving it open would cover what we just
    // navigated to.
    onClose();
  };
  const isAr = language === 'ar';
  const isStrictAdmin = isAdminUser(currentUser);
  // Display-time allowlist: users see only bidder-relevant notifications.
  const visibleNotifications = isStrictAdmin ? notifications : userFacingNotifications(notifications);
  const filterChips = isStrictAdmin ? ADMIN_FILTER_CHIPS : USER_FILTER_CHIPS;

  const handleClearAll = () => {
    if (window.confirm(isAr ? 'هل أنت متأكد من رغبتك في مسح جميع الإشعارات؟' : 'Are you sure you want to clear all notifications?')) {
      setNotifications([]);
    }
  };

  const handleRemoveOne = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const getNotificationIcon = (type: AppNotification['type']) => {
    switch (type) {
      case 'win':
        return (
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
            <Trophy className="w-5 h-5 stroke-[2]" />
          </div>
        );
      case 'loss':
      case 'refund':
        return (
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
            <XCircle className="w-5 h-5 stroke-[2]" />
          </div>
        );
      case 'subscription':
      case 'verify':
        return (
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center shrink-0">
            <Crown className="w-5 h-5 stroke-[2]" />
          </div>
        );
      case 'admin':
      case 'alert':
        return (
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5 stroke-[2]" />
          </div>
        );
      case 'bid':
      case 'outbid':
        return (
          <div className="w-10 h-10 rounded-xl bg-[#FF6B00]/10 text-[#FF6B00] flex items-center justify-center shrink-0 animate-pulse">
            <Gavel className="w-5 h-5 stroke-[2]" />
          </div>
        );
      case 'wallet':
        return (
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-600 flex items-center justify-center shrink-0">
            <Wallet className="w-5 h-5 stroke-[2]" />
          </div>
        );
      case 'order':
        return (
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center shrink-0">
            <Package className="w-5 h-5 stroke-[2]" />
          </div>
        );
      default:
        return (
          <div className="w-10 h-10 rounded-xl bg-zinc-500/10 text-zinc-500 flex items-center justify-center shrink-0">
            <Info className="w-5 h-5 stroke-[2]" />
          </div>
        );
    }
  };

  const getPriorityBadge = (priority?: 'high' | 'medium' | 'low') => {
    const p = priority || 'low';
    if (p === 'high') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black tracking-tight bg-rose-50 text-rose-600 border border-rose-100 uppercase animate-bounce-slow">
          {isAr ? 'عاجل جداً' : 'Urgent'}
        </span>
      );
    } else if (p === 'medium') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black tracking-tight bg-amber-50 text-amber-600 border border-amber-100 uppercase">
          {isAr ? 'متوسط الأهمية' : 'Important'}
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black tracking-tight bg-surface-sunken text-slate-500 border border-line uppercase">
          {isAr ? 'إشعار عادي' : 'Standard'}
        </span>
      );
    }
  };

  const getCategoryLabel = (type: NotificationFilterType) => {
    switch (type) {
      case 'all': return isAr ? 'الكل' : 'All';
      case 'buying': return isAr ? 'شرائي' : 'Buying';
      case 'selling': return isAr ? 'مبيعاتي' : 'Selling';
      case 'outbid': return isAr ? 'تجاوز العرض' : 'Outbid';
      case 'bid': return isAr ? 'مزايدة' : 'Bidding';
      case 'win': return isAr ? 'فوز' : 'Win';
      case 'loss': return isAr ? 'خسارة' : 'Loss';
      case 'wallet': return isAr ? 'محفظة' : 'Wallet';
      case 'order': return isAr ? 'طلبات' : 'Orders';
      case 'subscription': return isAr ? 'اشتراك' : 'Pass';
      case 'admin': return isAr ? 'إدارة' : 'Admin';
    }
  };

  const unreadCount = visibleNotifications.filter(n => !n.read).length;

  // Filter notifications
  const filteredNotifications = visibleNotifications.filter(n => {
    // Defensive guard: never render a blank row. Content is resolved (in the
    // recipient's language, with cross-language fallback) upstream in
    // AppContext, but guard here too so a contentless doc can't slip through.
    if (!n.title?.trim() && !n.description?.trim()) return false;
    if (selectedFilter === 'all') return true;
    if (selectedFilter === 'buying' || selectedFilter === 'selling') {
      return notificationAudience(n, currentUser?.id, orders) === selectedFilter;
    }
    return n.type === selectedFilter;
  });

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden" id="notification-center-drawer">
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-xs cursor-pointer"
          />

          {/* Drawer Container */}
          <div className="absolute inset-y-0 right-0 max-w-full flex" style={{ direction: isAr ? 'rtl' : 'ltr' }}>
            <motion.div 
              initial={{ x: isAr ? '-100%' : '100%' }}
              animate={{ x: 0 }}
              exit={{ x: isAr ? '-100%' : '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="w-screen max-w-md bg-surface-raised shadow-2xl flex flex-col h-full"
            >
              {/* Header */}
              <div className="p-5 border-b border-line flex flex-col bg-surface-sunken shrink-0 gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="relative">
                      <div className="w-10 h-10 rounded-xl bg-[#FF6B00]/10 text-[#FF6B00] flex items-center justify-center">
                        <Bell className="w-5 h-5 stroke-[2.2]" />
                      </div>
                      {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-black h-5 w-5 rounded-full flex items-center justify-center border-2 border-white animate-pulse">
                          {unreadCount}
                        </span>
                      )}
                    </div>
                    <div>
                      <h2 className="text-sm font-extrabold text-fg tracking-tight uppercase">
                        {isAr ? 'مركز الإشعارات الذكي' : 'Smart Alerts Center'}
                      </h2>
                      <p className="text-[10px] text-fg-muted font-bold uppercase mt-0.5">
                        {isAr ? `${unreadCount} تنبيهات معلقة` : `${unreadCount} pending notifications`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllAsRead}
                        className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-600 transition-colors flex items-center gap-1 text-[10px] font-extrabold uppercase cursor-pointer"
                        title={isAr ? 'تحديد الكل كمقروء' : 'Mark all as read'}
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{isAr ? 'قراءة الكل' : 'All Read'}</span>
                      </button>
                    )}
                    {visibleNotifications.length > 0 && (
                      <button
                        onClick={handleClearAll}
                        className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-500 transition-colors flex items-center gap-1 text-[10px] font-extrabold uppercase cursor-pointer"
                        title={isAr ? 'مسح الكل' : 'Clear all'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{isAr ? 'حذف الكل' : 'Clear'}</span>
                      </button>
                    )}
                    <button 
                      onClick={onClose}
                      className="w-8 h-8 rounded-full bg-surface-sunken hover:bg-surface-sunken text-fg-muted flex items-center justify-center transition-all cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Filter Tabs Chips */}
                <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1.5 shrink-0 select-none">
                  {filterChips.map((filter) => {
                    const count = AUDIENCE_FILTERS.includes(filter)
                      ? visibleNotifications.filter(n => notificationAudience(n, currentUser?.id, orders) === filter).length
                      : filter === 'all'
                      ? visibleNotifications.length
                      : visibleNotifications.filter(n => n.type === filter).length;
                    
                    const isSelected = selectedFilter === filter;
                    return (
                      <button
                        key={filter}
                        onClick={() => setSelectedFilter(filter)}
                        className={`px-3 py-1.5 rounded-full text-[10.5px] font-extrabold transition-all shrink-0 cursor-pointer flex items-center gap-1 ${
                          isSelected
                            ? 'bg-gray-950 text-white shadow-xs scale-102'
                            : 'bg-surface-raised border border-line text-fg-muted hover:border-line'
                        }`}
                      >
                        <span>{getCategoryLabel(filter)}</span>
                        {count > 0 && (
                          <span className={`text-[8.5px] font-bold px-1.5 py-0.5 rounded-full font-mono ${isSelected ? 'bg-surface-raised/20 text-white' : 'bg-surface-sunken text-fg-muted'}`}>
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* List body */}
              <div className="flex-grow overflow-y-auto p-4 space-y-3 bg-surface-sunken/50">
                {/* Native Push Notification Request Banner */}
                {('Notification' in window) && Notification.permission !== 'granted' && (
                  <div className="p-3.5 rounded-2xl border border-[#FF6B00]/20 bg-[#FF6B00]/5 text-fg flex flex-col gap-2 shrink-0">
                    <div className="flex items-start gap-2.5">
                      <Bell className="w-4 h-4 text-[#FF6B00] shrink-0 mt-0.5 animate-bounce" />
                      <div>
                        <h4 className="text-[11px] font-black tracking-tight uppercase text-fg flex items-center gap-1.5">
                          {isAr ? 'تفعيل تنبيهات المتصفح الفورية' : 'Enable Native Notifications'}
                          <Sparkles className="w-3 h-3 text-[#FF6B00]" />
                        </h4>
                        <p className="text-[10px] text-fg-muted font-medium leading-normal mt-0.5">
                          {isAr 
                            ? 'احصل على تحديثات فورية حول المزادات التي تزايد عليها، والمكاسب، وتنبيهات المحفظة مباشرة على جهازك.' 
                            : 'Get real-time system alerts on outbids, won auctions, and wallet updates directly on your device.'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        Notification.requestPermission().then((permission) => {
                          if (permission === 'granted') {
                            new Notification(isAr ? 'تم تفعيل التنبيهات بنجاح!' : 'Notifications Enabled!', {
                              body: isAr ? 'ستصلك تنبيهات المزايدات الفورية هنا.' : 'You will receive real-time auction outbids and escrow alerts here.',
                              icon: '/icon.svg'
                            });
                          }
                          onClose();
                        });
                      }}
                      className="w-full py-1.5 bg-[#FF6B00] text-white hover:bg-orange-600 transition-all rounded-xl text-[10px] font-extrabold tracking-wider uppercase cursor-pointer text-center"
                    >
                      {isAr ? 'تفعيل التنبيهات الآن' : 'Enable Alerts'}
                    </button>
                  </div>
                )}

                <AnimatePresence initial={false}>
                  {filteredNotifications.length > 0 ? (
                    filteredNotifications.map((item) => (
                      <motion.div 
                        key={item.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        onClick={() => handleNotificationClick(item)}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer flex gap-3.5 relative group ${
                          item.read 
                            ? 'bg-surface-raised border-line text-fg hover:bg-surface-sunken/50' 
                            : 'bg-surface-raised border-l-4 border-l-[#FF6B00] border-y-gray-200 border-r-gray-200 text-fg shadow-xs hover:bg-accent-weak/5'
                        }`}
                        id={`notification-card-${item.id}`}
                      >
                        {/* Unread circle marker */}
                        {!item.read && (
                          <span className="absolute top-4 right-4 w-2 h-2 bg-[#FF6B00] rounded-full animate-ping" />
                        )}

                        {/* Icon */}
                        {getNotificationIcon(item.type)}

                        {/* Text */}
                        <div className="space-y-1.5 pr-4 min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1.5 flex-wrap">
                            <h4 className={`text-[11.5px] tracking-tight leading-tight uppercase ${item.read ? 'font-bold text-fg' : 'font-extrabold text-fg'}`}>
                              {item.title}
                            </h4>
                            <div className="flex items-center gap-1.5">
                              {getPriorityBadge(item.priority)}
                              <button
                                onClick={(e) => handleRemoveOne(item.id, e)}
                                className="w-5 h-5 rounded-md bg-surface-sunken hover:bg-rose-50 text-fg-muted hover:text-rose-500 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 shrink-0"
                                title={isAr ? 'حذف الإشعار' : 'Delete notification'}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                          
                          <p className="text-[11px] text-fg-muted leading-normal font-semibold">
                            {item.description}
                          </p>

                          <div className="flex items-center gap-1 text-[9px] font-mono text-fg-muted mt-1">
                            <Clock className="w-3 h-3" />
                            <span>
                              {new Date(item.timestamp).toLocaleDateString(isAr ? 'ar-JO' : 'en-US')} - {new Date(item.timestamp).toLocaleTimeString(isAr ? 'ar-JO' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    ))
                  ) : (
                    <div className="py-20 flex flex-col items-center justify-center text-center px-4" id="empty-notifications-state-clean">
                      <div className="w-16 h-16 rounded-full bg-surface-sunken flex items-center justify-center text-fg-muted mb-4 animate-pulse">
                        <Bell className="w-7 h-7 stroke-[1.5]" />
                      </div>
                      <h4 className="text-xs font-black text-fg tracking-tight uppercase">
                        {isAr ? 'لا توجد إشعارات حالياً' : 'No notifications at the moment'}
                      </h4>
                      <p className="text-[10px] text-fg-muted font-bold uppercase mt-1.5 max-w-xs leading-relaxed">
                        {isAr 
                          ? 'أنت على اطلاع بكل شيء! لا توجد تنبيهات مزايدات أو حركات مالية في هذا القسم.' 
                          : 'You are all caught up! No financial records, bidding activity, or administrative notifications found here.'}
                      </p>
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};
