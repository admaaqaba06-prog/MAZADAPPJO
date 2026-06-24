import React from 'react';
import { useApp } from '../context/AppContext';
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
  Trash2 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { EmptyState } from './FeedbackStates';

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ isOpen, onClose }) => {
  const { 
    notifications, 
    setNotifications, 
    markAsRead, 
    markAllAsRead, 
    language 
  } = useApp();

  const isAr = language === 'ar';

  const handleClearAll = () => {
    setNotifications([]);
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'win':
        return (
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
            <Trophy className="w-4 h-4 stroke-[2]" />
          </div>
        );
      case 'refund':
        return (
          <div className="w-8 h-8 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center shrink-0">
            <Coins className="w-4 h-4 stroke-[2]" />
          </div>
        );
      case 'verify':
        return (
          <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4 stroke-[2]" />
          </div>
        );
      case 'alert':
        return (
          <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
            <AlertCircle className="w-4 h-4 stroke-[2]" />
          </div>
        );
      case 'bid':
        return (
          <div className="w-8 h-8 rounded-xl bg-[#FF6B00]/10 text-[#FF6B00] flex items-center justify-center shrink-0">
            <Gavel className="w-4 h-4 stroke-[2]" />
          </div>
        );
      default:
        return (
          <div className="w-8 h-8 rounded-xl bg-zinc-500/10 text-zinc-500 flex items-center justify-center shrink-0">
            <Info className="w-4 h-4 stroke-[2]" />
          </div>
        );
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

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
              className="w-screen max-w-md bg-white shadow-2xl flex flex-col h-full"
            >
              {/* Header */}
              <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-zinc-50 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Bell className="w-5 h-5 text-gray-700 stroke-[2.2]" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-[#FF6B00] text-white text-[8.5px] font-black h-4 w-4 rounded-full flex items-center justify-center border-2 border-white animate-pulse">
                        {unreadCount}
                      </span>
                    )}
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-gray-900 tracking-tight uppercase">
                      {isAr ? 'مركز الإشعارات' : 'Notification Center'}
                    </h2>
                    <p className="text-[10px] text-gray-400 font-bold uppercase mt-0.5">
                      {isAr ? `${unreadCount} غير مقروءة` : `${unreadCount} unread entries`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllAsRead}
                      className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 transition-colors flex items-center gap-1 text-[10px] font-black uppercase cursor-pointer"
                      title={isAr ? 'تحديد الكل كمقروء' : 'Mark all as read'}
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{isAr ? 'تحديد كـ مقروء' : 'All Read'}</span>
                    </button>
                  )}
                  {notifications.length > 0 && (
                    <button
                      onClick={handleClearAll}
                      className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 transition-colors flex items-center gap-1 text-[10px] font-black uppercase cursor-pointer"
                      title={isAr ? 'مسح الكل' : 'Clear all'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{isAr ? 'حذف الكل' : 'Clear'}</span>
                    </button>
                  )}
                  <button 
                    onClick={onClose}
                    className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 text-gray-500 flex items-center justify-center transition-all cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* List body */}
              <div className="flex-grow overflow-y-auto p-4 space-y-3">
                {/* Native Push Notification Request Banner */}
                {('Notification' in window) && Notification.permission !== 'granted' && (
                  <div className="p-3.5 rounded-2xl border border-orange-500/20 bg-orange-50/40 text-orange-950 flex flex-col gap-2 shrink-0">
                    <div className="flex items-start gap-2.5">
                      <Bell className="w-4 h-4 text-[#FF6B00] shrink-0 mt-0.5 animate-bounce" />
                      <div>
                        <h4 className="text-[11px] font-black tracking-tight uppercase text-orange-900">
                          {isAr ? 'تمكين إشعارات النظام الفورية' : 'Enable Native Push Notifications'}
                        </h4>
                        <p className="text-[9.5px] text-orange-700 font-medium leading-normal mt-0.5">
                          {isAr 
                            ? 'احصل على تنبيهات فورية للمزايدات، المزايدة المضادة، وتأكيدات الشحن ومكاسب المزادات مباشرة على جهازك.' 
                            : 'Get real-time system alerts on outbids, subscription approvals, and won auctions directly on your desktop or device.'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        Notification.requestPermission().then((permission) => {
                          if (permission === 'granted') {
                            new Notification(isAr ? 'تم تفعيل الإشعارات بنجاح!' : 'Notifications Enabled!', {
                              body: isAr ? 'ستصلك تنبيهات المزايدات الفورية هنا.' : 'You will receive real-time auction outbids and escrow alerts here.',
                              icon: '/icon.svg'
                            });
                          }
                          // Force re-render to hide banner
                          onClose();
                        });
                      }}
                      className="mt-1 w-full py-1.5 px-3 bg-[#FF6B00] text-white hover:bg-orange-600 transition-all rounded-xl text-[10px] font-black tracking-wider uppercase shadow-[0_4px_12px_rgba(255,107,0,0.2)] cursor-pointer text-center"
                    >
                      {isAr ? 'تفعيل الإشعارات الآن' : 'Enable System Alerts'}
                    </button>
                  </div>
                )}

                {notifications.length > 0 ? (
                  notifications.map((item) => (
                    <div 
                      key={item.id}
                      onClick={() => markAsRead(item.id)}
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex gap-3 relative ${
                        item.read 
                          ? 'bg-white border-gray-100/80 text-gray-700 hover:bg-gray-50/50' 
                          : 'bg-[#FF6B00]/5 border-[#FF6B00]/15 hover:bg-[#FF6B00]/10'
                      }`}
                      id={`notification-card-${item.id}`}
                    >
                      {/* Unread circle marker */}
                      {!item.read && (
                        <span className="absolute top-3.5 right-3.5 w-1.5 h-1.5 bg-[#FF6B00] rounded-full" />
                      )}

                      {/* Icon */}
                      {getNotificationIcon(item.type)}

                      {/* Text */}
                      <div className="space-y-1 pr-3 min-w-0 flex-1">
                        <h4 className={`text-[11.5px] tracking-tight leading-tight uppercase ${item.read ? 'font-bold text-gray-900' : 'font-black text-gray-950'}`}>
                          {item.title}
                        </h4>
                        <p className="text-[10.5px] text-gray-500 leading-normal font-medium">
                          {item.description}
                        </p>
                        <span className="text-[8px] font-mono text-gray-400 block mt-1">
                          {new Date(item.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="h-full flex items-center justify-center px-4">
                    <EmptyState 
                      title={isAr ? 'لا توجد إشعارات بعد' : 'No notifications yet'}
                      description={isAr ? 'لا يوجد لديك أي إشعارات أو تحديثات مالية أو تنبيهات مزايدات حالية.' : 'You are all caught up! No financial trades, auction outbids, or policy logs found.'}
                      icon={<Bell className="w-6 h-6 stroke-[1.5]" />}
                      language={isAr ? 'ar' : 'en'}
                    />
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};
