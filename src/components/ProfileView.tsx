import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { db } from '../services/firebase';
import { doc, updateDoc } from 'firebase/firestore';
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
  ExternalLink
} from 'lucide-react';

export const ProfileView: React.FC = () => {
  const { 
    currentUser, 
    language, 
    logout, 
    setShowSubscriptionPrompt, 
    setActiveView 
  } = useApp();

  const isAr = language === 'ar';

  const [name, setName] = useState(currentUser?.name || '');
  const [phoneNumber, setPhoneNumber] = useState(currentUser?.phoneNumber || currentUser?.phone || '');
  const [city, setCity] = useState(currentUser?.city || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (currentUser) {
      setName(currentUser.name || '');
      setPhoneNumber(currentUser.phoneNumber || currentUser.phone || '');
      setCity(currentUser.city || '');
    }
  }, [currentUser]);

  if (!currentUser) {
    return (
      <div className="flex-1 min-h-screen bg-[#0E0E0E] text-white flex items-center justify-center font-sans">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 text-[#FF6B00] animate-spin mx-auto" />
          <p className="text-zinc-400 text-sm">
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
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'pending':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'rejected':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      case 'expired':
        return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
      default:
        return 'bg-zinc-500/5 text-zinc-400 border-zinc-500/10';
    }
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
      className="flex-1 min-h-screen bg-[#0E0E0E] text-white overflow-y-auto pb-16 font-sans"
      style={{ direction: isAr ? 'rtl' : 'ltr' }}
      id="profile-view-root-container"
    >
      <div className="max-w-7xl mx-auto px-4 py-6 md:py-8 space-y-6">
        
        {/* Profile Header Card */}
        <div className="bg-[#18181B] border border-white/5 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row items-center gap-6">
          <div className="relative group shrink-0">
            <img 
              src={currentUser.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'} 
              alt={currentUser.name} 
              className="w-24 h-24 rounded-3xl object-cover border-2 border-white/10 group-hover:border-[#FF6B00] transition-colors"
            />
            {currentUser.isVerified && (
              <span className="absolute -bottom-1 -right-1 bg-[#FF6B00] text-white p-1.5 rounded-xl shadow-lg border-2 border-[#18181B]" title={isAr ? 'حساب موثق' : 'Verified Account'}>
                <ShieldCheck className="w-4 h-4" />
              </span>
            )}
          </div>

          <div className="text-center md:text-start space-y-2 min-w-0 flex-1">
            <div className="flex flex-col md:flex-row md:items-center justify-center md:justify-start gap-2">
              <h1 className="text-xl md:text-2xl font-black text-white tracking-tight">{currentUser.name}</h1>
              {currentUser.isVerified && (
                <span className="inline-flex items-center gap-1 bg-[#FF6B00]/10 border border-[#FF6B00]/20 text-[#FF6B00] text-[10px] font-black tracking-widest uppercase px-2.5 py-1 rounded-full w-fit mx-auto md:mx-0">
                  <ShieldCheck className="w-3 h-3" />
                  {isAr ? 'موثق بضمان' : 'VERIFIED SECURITY'}
                </span>
              )}
            </div>
            <p className="text-sm text-zinc-400 font-mono truncate">{currentUser.email}</p>
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 pt-1 text-xs">
              <span className="px-3 py-1 bg-white/5 border border-white/5 text-zinc-300 rounded-lg capitalize font-bold">
                {currentUser.role === 'admin' ? (isAr ? 'مدير المنصة' : 'Platform Administrator') : currentUser.role === 'seller' ? (isAr ? 'بائع معتمد' : 'Authorized Seller') : (isAr ? 'مزايد نشط' : 'Active Bidder')}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Form (2/3 grid span) */}
          <div className="lg:col-span-2 space-y-6">
            <form onSubmit={handleSave} className="bg-[#18181B] border border-white/5 rounded-3xl p-6 md:p-8 space-y-6">
              <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                <div className="w-8 h-8 rounded-xl bg-[#FF6B00]/10 flex items-center justify-center text-[#FF6B00]">
                  <UserIcon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-sans font-black text-sm text-white uppercase tracking-wider">{isAr ? 'تعديل بيانات الحساب' : 'Edit Account Details'}</h3>
                  <p className="text-[10px] text-zinc-400">{isAr ? 'تحديث معلوماتك الشخصية للتواصل والضمان' : 'Keep your personal records updated for transaction security'}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Full Name */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-400 tracking-wider block uppercase">{isAr ? 'الاسم الكامل' : 'Full Name'}</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={isAr ? 'مثال: أحمد العبدالله' : 'e.g. Ahmad Al-Abdullah'}
                      className="w-full bg-zinc-900/60 border border-white/5 focus:border-[#FF6B00]/50 rounded-2xl py-3.5 px-4 text-xs font-bold text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-[#FF6B00]/30 transition-all font-sans"
                    />
                  </div>
                </div>

                {/* Email (Read Only) */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-400 tracking-wider block uppercase">
                    {isAr ? 'البريد الإلكتروني (للقراءة فقط)' : 'Email (Read Only)'}
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      value={currentUser.email}
                      readOnly
                      className="w-full bg-zinc-950/80 border border-white/5 rounded-2xl py-3.5 px-4 text-xs font-bold text-zinc-500 cursor-not-allowed transition-all font-mono"
                    />
                    <span className="absolute right-3 top-3.5 text-[9px] bg-white/5 text-zinc-500 border border-white/5 font-black px-2 py-1 rounded-lg uppercase">
                      {isAr ? 'محمي' : 'Secure'}
                    </span>
                  </div>
                </div>

                {/* Phone Number */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-400 tracking-wider block uppercase">{isAr ? 'رقم الهاتف' : 'Phone Number'}</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder={isAr ? 'مثال: 079XXXXXXXX' : 'e.g. 079XXXXXXXX'}
                      className="w-full bg-zinc-900/60 border border-white/5 focus:border-[#FF6B00]/50 rounded-2xl py-3.5 px-4 text-xs font-bold text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-[#FF6B00]/30 transition-all font-sans"
                    />
                  </div>
                </div>

                {/* City */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-400 tracking-wider block uppercase">{isAr ? 'المدينة' : 'City'}</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder={isAr ? 'مثال: عمان' : 'e.g. Amman'}
                      className="w-full bg-zinc-900/60 border border-white/5 focus:border-[#FF6B00]/50 rounded-2xl py-3.5 px-4 text-xs font-bold text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-[#FF6B00]/30 transition-all font-sans"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-white/5 font-sans">
                <p className="text-[10px] text-zinc-500 font-mono leading-normal">
                  {isAr 
                    ? '* تخضع التحديثات لتدقيق معايير الأمان لمنع الاحتيال والمضاربة الوهمية.' 
                    : '* Updates are logged in our secure ledger network for bidding assurance.'}
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
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl text-xs font-bold flex items-center gap-2 animate-fadeIn font-sans">
                  <ShieldCheck className="w-4 h-4" />
                  <span>{isAr ? 'تم حفظ التعديلات وتحديث حسابك بنجاح!' : 'Profile updated successfully!'}</span>
                </div>
              )}
            </form>
          </div>

          {/* Right Column: Cards (1/3 grid span) */}
          <div className="space-y-6">
            {/* Wallet Quick Navigation Card */}
            <div className="bg-[#18181B] border border-white/5 rounded-3xl p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#FF6B00]/10 flex items-center justify-center text-[#FF6B00]">
                  <Wallet className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-sans font-black text-xs text-white uppercase tracking-wider">{isAr ? 'محفظتي المالية' : 'My Financial Wallet'}</h3>
                  <p className="text-[9px] text-zinc-400">{isAr ? 'الوصول الفوري للرصيد والعمليات' : 'Instant access to funds & ledger'}</p>
                </div>
              </div>

              <div className="bg-zinc-900/60 border border-white/5 rounded-2xl p-4 flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-[10px] text-zinc-400 font-mono uppercase font-black">{isAr ? 'الرصيد الكلي المتاح' : 'Available Balance'}</p>
                  <p className="text-lg font-black font-mono text-[#FF6B00]">JOD {currentUser.walletBalance !== undefined ? currentUser.walletBalance : '0.00'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveView('wallet')}
                  className="bg-white/5 hover:bg-white/10 text-white p-2.5 rounded-xl border border-white/5 transition-colors cursor-pointer"
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
            <div className="bg-[#18181B] border border-white/5 rounded-3xl p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#FF6B00]/10 flex items-center justify-center text-[#FF6B00]">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-sans font-black text-xs text-white uppercase tracking-wider">{isAr ? 'باقة العضوية والاشتراك' : 'Bidding Subscription'}</h3>
                  <p className="text-[9px] text-zinc-400">{isAr ? 'تفاصيل ترخيص المزايدة النشط' : 'Active live streaming license status'}</p>
                </div>
              </div>

              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between text-xs font-bold border-b border-white/5 pb-2.5">
                  <span className="text-zinc-400">{isAr ? 'حالة الاشتراك:' : 'Plan Status:'}</span>
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

                <div className="flex items-center justify-between text-xs font-bold border-b border-white/5 pb-2.5">
                  <span className="text-zinc-400">{isAr ? 'تاريخ الانتهاء:' : 'Expires On:'}</span>
                  <span className="text-white font-mono">{formatExpiry(currentUser.subscriptionExpiry || currentUser.subscriptionExpiresAt)}</span>
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
            <div className="bg-[#18181B] border border-white/5 rounded-3xl p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-500">
                  <Laptop className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-sans font-black text-xs text-white uppercase tracking-wider">{isAr ? 'الأمان والجلسات النشطة' : 'Security & Sessions'}</h3>
                  <p className="text-[9px] text-zinc-400">{isAr ? 'بيانات جهازك وسجل النشاط الأخير' : 'Last seen device signature & metadata'}</p>
                </div>
              </div>

              <div className="space-y-3 pt-1 text-xs font-bold">
                <div className="space-y-1">
                  <span className="text-zinc-400 block text-[10px] font-black uppercase tracking-wider">{isAr ? 'الجهاز المتصل حالياً:' : 'Current Device:'}</span>
                  <span className="text-white font-mono bg-zinc-900/60 border border-white/5 py-1.5 px-3 rounded-xl block truncate" title={currentUser.deviceInfo || 'Unknown Browser Signature'}>
                    {currentUser.deviceInfo || (isAr ? 'جهاز غير معروف' : 'Unknown Device')}
                  </span>
                </div>

                <div className="space-y-1">
                  <span className="text-zinc-400 block text-[10px] font-black uppercase tracking-wider">{isAr ? 'آخر تسجيل دخول مالي:' : 'Last Login Audit:'}</span>
                  <span className="text-white font-mono bg-zinc-900/60 border border-white/5 py-1.5 px-3 rounded-xl block">
                    {currentUser.lastLoginAt 
                      ? new Date(currentUser.lastLoginAt).toLocaleString(isAr ? 'ar-JO' : 'en-US') 
                      : (currentUser.lastSeen ? new Date(currentUser.lastSeen).toLocaleString(isAr ? 'ar-JO' : 'en-US') : 'N/A')}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={logout}
                className="w-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-sans font-black text-xs py-3 px-4 rounded-2xl border border-rose-500/10 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{isAr ? 'تسجيل الخروج الآمن' : 'Log Out Securely'}</span>
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
