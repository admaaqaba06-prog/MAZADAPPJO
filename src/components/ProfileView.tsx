import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { db } from '../services/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { winTotalDue } from './feedback';
import { Order } from '../types';
import { resolveAvatarUrl, hasRealPhoto } from '../utils/avatarPlaceholder';
import { useAvatarUpload } from '../hooks/useAvatarUpload';
import {
  User as UserIcon,
  ShieldCheck,
  Sparkles,
  LogOut,
  Wallet,
  Laptop,
  Save,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Trophy,
  HelpCircle,
  Camera,
  ScrollText
} from 'lucide-react';
import AuctionRulesModal from './AuctionRulesModal';

/** Order states that count as a "win" the buyer followed through on (paid → completed). */
const WON_ORDER_STATUSES: Order['status'][] = ['paid', 'preparing_shipment', 'shipped', 'delivered', 'completed'];

export const ProfileView: React.FC = () => {
  const {
    currentUser,
    language,
    logout,
    setShowSubscriptionPrompt,
    setActiveView,
    orders,
    setGlobalSelectedOrderId
  } = useApp();

  const isAr = language === 'ar';

  const [name, setName] = useState(currentUser?.name || '');
  const [phoneNumber, setPhoneNumber] = useState(currentUser?.phoneNumber || currentUser?.phone || '');
  const [city, setCity] = useState(currentUser?.city || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false); // E4 — Auction Rules modal

  // Avatar upload (tap-to-change control on the profile photo).
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const { uploading: avatarUploading, progress: avatarProgress, error: avatarError, uploadAvatar } = useAvatarUpload();
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    let objectUrl: string | null = null;
    try { objectUrl = URL.createObjectURL(file); setAvatarPreview(objectUrl); } catch { /* noop */ }
    const res = await uploadAvatar(file);
    if (!res.success) {
      setAvatarPreview(null);
      if (objectUrl) { try { URL.revokeObjectURL(objectUrl); } catch { /* noop */ } }
    }
  };

  useEffect(() => {
    if (currentUser) {
      setName(currentUser.name || '');
      setPhoneNumber(currentUser.phoneNumber || currentUser.phone || '');
      setCity(currentUser.city || '');
    }
  }, [currentUser]);

  if (!currentUser) {
    return (
      <div className="flex-1 min-h-screen bg-[#F7F6F3] text-gray-900 flex items-center justify-center font-sans">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 text-[#FF6B00] animate-spin mx-auto" />
          <p className="text-gray-500 text-sm">
            {isAr ? 'جاري تحميل بيانات الملف الشخصي...' : 'Loading profile data...'}
          </p>
        </div>
      </div>
    );
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert(isAr ? 'الرجاء إدخال الاسم الكامل' : 'Full name is required');
      return;
    }

    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const userRef = doc(db, 'users', currentUser.id);
      await updateDoc(userRef, {
        name: name.trim(),
        phoneNumber: phoneNumber.trim(),
        phone: phoneNumber.trim(),
        city: city.trim()
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      console.error("Error updating user profile:", err);
      alert(isAr ? 'حدث خطأ أثناء حفظ التعديلات.' : 'An error occurred while saving changes.');
    } finally {
      setIsSaving(false);
    }
  };

  const getSubStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
      case 'pending':
        return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
      case 'rejected':
        return 'bg-rose-500/10 text-rose-600 border-rose-500/20';
      case 'expired':
        return 'bg-zinc-500/10 text-gray-500 border-zinc-500/20';
      default:
        return 'bg-zinc-500/5 text-gray-500 border-zinc-500/10';
    }
  };

  // Wins shelf: the user's paid/completed orders, newest first.
  const toMillis = (raw: any): number => {
    if (!raw) return 0;
    if (typeof raw?.toMillis === 'function') return raw.toMillis();
    if (raw?.seconds) return raw.seconds * 1000;
    const t = new Date(raw).getTime();
    return Number.isNaN(t) ? 0 : t;
  };
  const wonOrders = (orders || [])
    .filter((o: Order) => o.buyerId === currentUser.id && WON_ORDER_STATUSES.includes(o.status))
    .sort((a: Order, b: Order) => toMillis(b.createdAt) - toMillis(a.createdAt));
  const wonCount = wonOrders.length;

  const openWonOrder = (orderId: string) => {
    setGlobalSelectedOrderId(orderId);
    setActiveView('orders');
  };

  const formatExpiry = (expiry: any) => {
    if (!expiry) return isAr ? 'لا يوجد اشتراك نشط' : 'No active subscription';
    try {
      const d = new Date(expiry);
      return d.toLocaleDateString(isAr ? 'ar-JO' : 'en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return String(expiry);
    }
  };

  return (
    <div 
      className="flex-1 bg-[#F7F6F3] text-gray-900 overflow-y-auto pb-[calc(6rem+env(safe-area-inset-bottom))] font-sans"
      style={{ direction: isAr ? 'rtl' : 'ltr' }}
      id="profile-view-root-container"
    >
      <div className="max-w-7xl mx-auto px-4 py-6 md:py-8 space-y-6">
        
        {/* Profile Header Card */}
        <div className="bg-white border border-gray-200 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row items-center gap-6">
          <div className="relative group shrink-0">
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarFile}
              className="hidden"
              aria-hidden="true"
              tabIndex={-1}
            />
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarUploading}
              aria-label={isAr ? 'تغيير الصورة الشخصية' : 'Change profile photo'}
              className="relative block rounded-3xl overflow-hidden focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/40 cursor-pointer disabled:cursor-wait"
            >
              <img
                src={avatarPreview || resolveAvatarUrl(currentUser.avatar, currentUser.id)}
                alt={currentUser.name}
                className="w-24 h-24 rounded-3xl object-cover border border-gray-200 group-hover:border-[#FF6B00] transition-colors"
              />
              {/* Camera overlay */}
              <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/35 transition-colors">
                <Camera className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
              </span>
              {avatarUploading && (
                <span className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 gap-1">
                  <Loader2 className="w-6 h-6 text-white animate-spin" />
                  <span className="text-[10px] font-black text-white font-mono">{Math.round(avatarProgress)}%</span>
                </span>
              )}
            </button>
            {/* Pencil/camera affordance badge */}
            <span className="absolute -top-1 -left-1 rtl:-left-auto rtl:-right-1 bg-[#FF6B00] text-white p-1.5 rounded-xl shadow-lg border-2 border-white pointer-events-none">
              <Camera className="w-3.5 h-3.5" />
            </span>
            {currentUser.isVerified && (
              <span className="absolute -bottom-1 -right-1 rtl:-right-auto rtl:-left-1 bg-[#FF6B00] text-white p-1.5 rounded-xl shadow-lg border-2 border-white" title={isAr ? 'حساب موثق' : 'Verified Account'}>
                <ShieldCheck className="w-4 h-4" />
              </span>
            )}
          </div>

          <div className="text-center md:text-start space-y-2 min-w-0 flex-1">
            <div className="flex flex-col md:flex-row md:items-center justify-center md:justify-start gap-2">
              <h1 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight">{currentUser.name}</h1>
              {currentUser.isVerified && (
                <span className="inline-flex items-center gap-1 bg-[#FF6B00]/10 border border-[#FF6B00]/20 text-[#FF6B00] text-[10px] font-black tracking-widest uppercase px-2.5 py-1 rounded-full w-fit mx-auto md:mx-0">
                  <ShieldCheck className="w-3 h-3" />
                  {isAr ? 'موثّق' : 'Verified'}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 font-mono truncate">{currentUser.email}</p>
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 pt-1 text-xs">
              <span className="px-3 py-1 bg-gray-100 border border-gray-200 text-gray-700 rounded-full capitalize font-bold">
                {currentUser.role === 'admin' ? (isAr ? 'مدير المنصة' : 'Platform Administrator') : currentUser.role === 'seller' ? (isAr ? 'بائع معتمد' : 'Authorized Seller') : (isAr ? 'مزايد نشط' : 'Active Bidder')}
              </span>
            </div>
          </div>
        </div>

        {/* Avatar upload error */}
        {avatarError && (
          <div className="bg-rose-50 border border-rose-100 text-rose-700 rounded-2xl px-4 py-3 text-xs font-bold flex items-center gap-2">
            <Camera className="w-4 h-4 shrink-0" />
            <span>{avatarError}</span>
          </div>
        )}

        {/* Trust nudge: gentle "add a real photo" card when the user has none */}
        {!hasRealPhoto(currentUser) && (
          <div className="bg-orange-50 border border-[#FF6B00]/20 rounded-3xl p-5 flex items-center gap-4" id="profile-photo-nudge">
            <div className="w-11 h-11 rounded-2xl bg-[#FF6B00]/10 border border-[#FF6B00]/20 flex items-center justify-center text-[#FF6B00] shrink-0">
              <Camera className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1 space-y-0.5">
              <h3 className="font-sans font-black text-xs text-gray-900 uppercase tracking-wider">
                {isAr ? 'أضِف صورتك الشخصية' : 'Add your profile photo'}
              </h3>
              <p className="text-[11px] text-gray-600 leading-normal">
                {isAr
                  ? 'الصور الحقيقية تحافظ على ثقة مزادات مزاد — المشترون والبائعون يتعاملون مع أشخاص حقيقيين. أضِف صورتك لتزايد أو تبيع.'
                  : "Real photos keep Mazad's auctions trustworthy — buyers and sellers deal with real people. Add yours to bid or sell."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarUploading}
              className="bg-[#FF6B00] hover:bg-orange-600 disabled:opacity-60 text-white font-sans font-black text-[11px] py-2.5 px-4 rounded-xl shadow-sm transition-colors flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>{isAr ? 'أضف صورة' : 'Add photo'}</span>
            </button>
          </div>
        )}

        {/* Wins shelf «انتصاراتي 🏆» */}
        {wonCount > 0 && (
          <div className="bg-white border border-gray-200 rounded-3xl p-6 space-y-4" id="profile-wins-shelf">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 shrink-0">
                <Trophy className="w-5 h-5" />
              </div>
              <div className="flex items-baseline gap-3 min-w-0">
                <span className="text-3xl font-black font-mono text-amber-600 leading-none">{wonCount}</span>
                <div className="min-w-0">
                  <h3 className="font-sans font-black text-xs text-gray-900 uppercase tracking-wider">
                    {isAr ? 'انتصاراتي 🏆' : 'My Wins 🏆'}
                  </h3>
                  <p className="text-[9px] text-gray-500 truncate">
                    {isAr ? 'مزادات ربحتها وأتممتها — استمر!' : 'Auctions you won and followed through — keep going!'}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
              {wonOrders.map((order: Order) => {
                const totalDue = order.totalDue ?? winTotalDue(order.winningBidAmount);
                return (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => openWonOrder(order.id)}
                    className="w-36 shrink-0 bg-gray-50 hover:bg-gray-100 border border-gray-200 hover:border-amber-500/40 rounded-2xl p-2.5 space-y-2 text-start transition-colors cursor-pointer"
                    id={`profile-win-card-${order.id}`}
                  >
                    <img
                      src={order.auctionImage || 'https://images.unsplash.com/photo-1541807084-5c52b6b3adef?auto=format&fit=crop&w=300&q=80'}
                      alt={order.auctionTitle}
                      className="w-full h-20 rounded-xl object-cover border border-gray-200"
                      referrerPolicy="no-referrer"
                    />
                    <p className="text-[10.5px] font-black text-gray-900 leading-snug truncate">{order.auctionTitle}</p>
                    <p className="text-[10px] font-black font-mono text-amber-600">
                      {totalDue.toLocaleString()} {isAr ? 'د.أ' : 'JOD'}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Form (2/3 grid span) */}
          <div className="lg:col-span-2 space-y-6">
            <form onSubmit={handleSave} className="bg-white border border-gray-200 rounded-3xl p-6 md:p-8 space-y-6">
              <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
                <div className="w-8 h-8 rounded-xl bg-[#FF6B00]/10 flex items-center justify-center text-[#FF6B00]">
                  <UserIcon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-sans font-black text-sm text-gray-900 uppercase tracking-wider">{isAr ? 'تعديل بيانات الحساب' : 'Edit Account Details'}</h3>
                  <p className="text-[10px] text-gray-500">{isAr ? 'تحديث معلوماتك الشخصية للتواصل والضمان' : 'Keep your personal records updated for transaction security'}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Full Name */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 tracking-wider block uppercase">{isAr ? 'الاسم الكامل' : 'Full Name'}</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={isAr ? 'مثال: أحمد العبدالله' : 'e.g. Ahmad Al-Abdullah'}
                      className="w-full bg-gray-50 border border-gray-200 focus:border-[#FF6B00] rounded-2xl py-3.5 px-4 text-xs font-bold text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#FF6B00]/20 transition-all font-sans"
                    />
                  </div>
                </div>

                {/* Email (Read Only) */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 tracking-wider block uppercase">
                    {isAr ? 'البريد الإلكتروني (للقراءة فقط)' : 'Email (Read Only)'}
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      value={currentUser.email}
                      readOnly
                      className="w-full bg-gray-100 border border-gray-200 rounded-2xl py-3.5 px-4 text-xs font-bold text-gray-400 cursor-not-allowed transition-all font-mono"
                    />
                    <span className="absolute right-3 top-3.5 text-[9px] bg-gray-100 text-gray-400 border border-gray-200 font-black px-2 py-1 rounded-full uppercase">
                      {isAr ? 'محمي' : 'Secure'}
                    </span>
                  </div>
                </div>

                {/* Phone Number */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 tracking-wider block uppercase">{isAr ? 'رقم الهاتف' : 'Phone Number'}</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder={isAr ? 'مثال: 079XXXXXXXX' : 'e.g. 079XXXXXXXX'}
                      className="w-full bg-gray-50 border border-gray-200 focus:border-[#FF6B00] rounded-2xl py-3.5 px-4 text-xs font-bold text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#FF6B00]/20 transition-all font-sans"
                    />
                  </div>
                </div>

                {/* City */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 tracking-wider block uppercase">{isAr ? 'المدينة' : 'City'}</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder={isAr ? 'مثال: عمان' : 'e.g. Amman'}
                      className="w-full bg-gray-50 border border-gray-200 focus:border-[#FF6B00] rounded-2xl py-3.5 px-4 text-xs font-bold text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#FF6B00]/20 transition-all font-sans"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-gray-100 font-sans">
                <p className="text-[10px] text-gray-400 font-mono leading-normal">
                  {isAr
                    ? '* بياناتك محفوظة بأمان وتُستخدم فقط لإدارة حسابك.'
                    : '* Your details are saved securely and used only to run your account.'}
                </p>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="bg-[#FF6B00] hover:bg-orange-600 disabled:opacity-50 text-white font-sans font-black text-xs py-3.5 px-6 rounded-2xl shadow-lg shadow-[#FF6B00]/10 transition-all duration-200 cursor-pointer shrink-0 flex items-center justify-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{isAr ? 'جاري الحفظ...' : 'Saving...'}</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>{isAr ? 'حفظ التعديلات' : 'Save Changes'}</span>
                    </>
                  )}
                </button>
              </div>

              {saveSuccess && (
                <div className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-2xl text-xs font-bold flex items-center gap-2 animate-fadeIn font-sans">
                  <ShieldCheck className="w-4 h-4" />
                  <span>{isAr ? 'تم حفظ التعديلات وتحديث حسابك بنجاح!' : 'Profile updated successfully!'}</span>
                </div>
              )}
            </form>
          </div>

          {/* Right Column: Cards (1/3 grid span) */}
          <div className="space-y-6">
            {/* Wallet Quick Navigation Card */}
            <div className="bg-white border border-gray-200 rounded-3xl p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#FF6B00]/10 flex items-center justify-center text-[#FF6B00]">
                  <Wallet className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-sans font-black text-xs text-gray-900 uppercase tracking-wider">{isAr ? 'محفظتي المالية' : 'My Financial Wallet'}</h3>
                  <p className="text-[9px] text-gray-500">{isAr ? 'رصيدك وعملياتك' : 'Your balance and transactions'}</p>
                </div>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-[10px] text-gray-500 font-mono uppercase font-black">{isAr ? 'الرصيد الكلي المتاح' : 'Available Balance'}</p>
                  <p className="text-lg font-black font-mono text-[#FF6B00]">JOD {currentUser.walletBalance !== undefined ? currentUser.walletBalance : '0.00'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveView('wallet')}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 p-2.5 rounded-xl border border-gray-200 transition-colors cursor-pointer"
                  title={isAr ? 'عرض المحفظة' : 'View Wallet'}
                >
                  {isAr ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
              </div>

              <button
                type="button"
                onClick={() => setActiveView('wallet')}
                className="w-full bg-[#FF6B00]/10 hover:bg-[#FF6B00]/20 text-[#FF6B00] font-sans font-black text-xs py-3 px-4 rounded-2xl border border-[#FF6B00]/10 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>{isAr ? 'فتح المحفظة بالكامل' : 'Open Complete Wallet'}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Subscription Section Card */}
            <div className="bg-white border border-gray-200 rounded-3xl p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#FF6B00]/10 flex items-center justify-center text-[#FF6B00]">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-sans font-black text-xs text-gray-900 uppercase tracking-wider">{isAr ? 'باقة العضوية والاشتراك' : 'Bidding Subscription'}</h3>
                  <p className="text-[9px] text-gray-500">{isAr ? 'حالة اشتراك المزايدة' : 'Your bidding membership status'}</p>
                </div>
              </div>

              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between text-xs font-bold border-b border-gray-100 pb-2.5">
                  <span className="text-gray-500">{isAr ? 'حالة الاشتراك:' : 'Plan Status:'}</span>
                  <span className={`px-2.5 py-1 text-[10px] font-black tracking-widest uppercase border rounded-full ${getSubStatusColor(currentUser.subscriptionStatus || 'none')}`}>
                    {currentUser.subscriptionStatus === 'active' 
                      ? (isAr ? 'نشط' : 'Active') 
                      : currentUser.subscriptionStatus === 'pending' 
                        ? (isAr ? 'بانتظار المراجعة' : 'Pending review') 
                        : currentUser.subscriptionStatus === 'rejected' 
                          ? (isAr ? 'مرفوض' : 'Rejected') 
                          : currentUser.subscriptionStatus === 'expired' 
                            ? (isAr ? 'منتهي' : 'Expired') 
                            : (isAr ? 'لا يوجد اشتراك' : 'No subscription')}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs font-bold border-b border-gray-100 pb-2.5">
                  <span className="text-gray-500">{isAr ? 'تاريخ الانتهاء:' : 'Expires On:'}</span>
                  <span className="text-gray-900 font-mono">{formatExpiry(currentUser.subscriptionExpiry || currentUser.subscriptionExpiresAt)}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowSubscriptionPrompt(true)}
                className="w-full bg-[#FF6B00] hover:bg-orange-600 text-white font-sans font-black text-xs py-3 px-4 rounded-2xl shadow-lg shadow-[#FF6B00]/10 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>{isAr ? 'ترقية وتحديث الاشتراك' : 'Upgrade & Manage Plans'}</span>
                <Sparkles className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Sessions & Security Card */}
            <div className="bg-white border border-gray-200 rounded-3xl p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-500">
                  <Laptop className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-sans font-black text-xs text-gray-900 uppercase tracking-wider">{isAr ? 'الأمان والجلسات النشطة' : 'Security & Sessions'}</h3>
                  <p className="text-[9px] text-gray-500">{isAr ? 'نشاط تسجيل الدخول الأخير' : 'Your recent sign-in activity'}</p>
                </div>
              </div>

              <div className="space-y-3 pt-1 text-xs font-bold">
                <div className="space-y-1">
                  <span className="text-gray-500 block text-[10px] font-black uppercase tracking-wider">{isAr ? 'الجهاز الحالي:' : 'Current Device:'}</span>
                  <span className="text-gray-900 font-mono bg-gray-50 border border-gray-200 py-1.5 px-3 rounded-xl block truncate" title={currentUser.deviceInfo || (isAr ? 'هذا الجهاز' : 'This device')}>
                    {currentUser.deviceInfo || (isAr ? 'هذا الجهاز' : 'This device')}
                  </span>
                </div>

                <div className="space-y-1">
                  <span className="text-gray-500 block text-[10px] font-black uppercase tracking-wider">{isAr ? 'آخر تسجيل دخول:' : 'Last sign-in:'}</span>
                  <span className="text-gray-900 font-mono bg-gray-50 border border-gray-200 py-1.5 px-3 rounded-xl block">
                    {currentUser.lastLoginAt
                      ? new Date(currentUser.lastLoginAt).toLocaleString(isAr ? 'ar-JO' : 'en-US')
                      : (currentUser.lastSeen ? new Date(currentUser.lastSeen).toLocaleString(isAr ? 'ar-JO' : 'en-US') : '—')}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={logout}
                className="w-full bg-rose-50 hover:bg-rose-100 text-rose-600 font-sans font-black text-xs py-3 px-4 rounded-2xl border border-rose-100 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{isAr ? 'تسجيل الخروج الآمن' : 'Log Out Securely'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* How-it-works entry point — this is the mobile route to the 'about'
            view now that the bottom-nav "How it works" tab was removed. */}
        <button
          type="button"
          onClick={() => setActiveView('about')}
          className="w-full bg-white hover:bg-gray-50 border border-gray-200 rounded-3xl p-5 flex items-center justify-between gap-4 transition-colors cursor-pointer text-start"
          id="profile-how-it-works-link"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-[#FF6B00]/10 flex items-center justify-center text-[#FF6B00] shrink-0">
              <HelpCircle className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-sans font-black text-xs text-gray-900 uppercase tracking-wider truncate">
                {isAr ? 'كيف يعمل مزاد جو' : 'How Mazad JO Works'}
              </h3>
              <p className="text-[9px] text-gray-500 truncate">
                {isAr ? 'دليل المزايدة والدفع والتوصيل' : 'Bidding, payment & delivery guide'}
              </p>
            </div>
          </div>
          {isAr ? <ChevronLeft className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
        </button>

        {/* E4 — Auction Rules entry point (account/help area) */}
        <button
          type="button"
          onClick={() => setRulesOpen(true)}
          className="w-full bg-white hover:bg-gray-50 border border-gray-200 rounded-3xl p-5 flex items-center justify-between gap-4 transition-colors cursor-pointer text-start"
          id="profile-auction-rules-link"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-[#FF6B00]/10 flex items-center justify-center text-[#FF6B00] shrink-0">
              <ScrollText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-sans font-black text-xs text-gray-900 uppercase tracking-wider truncate">
                {isAr ? 'قواعد المزاد' : 'Auction Rules'}
              </h3>
              <p className="text-[9px] text-gray-500 truncate">
                {isAr ? 'القواعد المبسّطة للمزايدة والدفع والإرجاع' : 'The plain-language bidding, payment & returns rules'}
              </p>
            </div>
          </div>
          {isAr ? <ChevronLeft className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
        </button>

      </div>

      <AuctionRulesModal isOpen={rulesOpen} onClose={() => setRulesOpen(false)} isAr={isAr} />
    </div>
  );
};
