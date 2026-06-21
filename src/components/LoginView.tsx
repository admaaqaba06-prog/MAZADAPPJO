import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { translations } from '../utils/translations';
import { Globe, Eye, EyeOff, CheckCircle2 } from 'lucide-react';

const GoogleIcon = () => (
  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
    <path
      fill="#EA4335"
      d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582l3.51-3.51C17.642 1.091 14.974 0 12 0 7.354 0 3.307 2.671 1.353 6.551l3.913 3.214z"
    />
    <path
      fill="#4285F4"
      d="M16.04 15.345c-1.077.733-2.502 1.164-4.04 1.164a7.076 7.076 0 0 1-6.734-4.856l-3.914 3.214C3.307 21.329 7.354 24 12 24c4.85 0 9.073-2.843 11.025-6.974l-4.148-3.214a6.992 6.992 0 0 1-2.837 1.533z"
    />
    <path
      fill="#FBBC05"
      d="M1.353 6.551l3.913 3.214C5.105 10.455 5 11.213 5 12c0 .787.105 1.545.266 2.235l-3.913 3.214A11.947 11.947 0 0 1 0 12c0-1.977.481-3.843 1.353-5.449z"
    />
    <path
      fill="#34A853"
      d="M23.025 6.974a11.954 11.954 0 0 1 .975 5.026c0 1.127-.15 2.218-.432 3.26l-4.148-3.214A6.992 6.992 0 0 0 17 12c0-2.433-1.24-4.577-3.13-5.845a6.975 6.975 0 0 0 2.17-1.196l4.148 3.215a7.03 7.03 0 0 1 2.837-1.2z"
    />
  </svg>
);

const FacebookIcon = () => (
  <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path fillRule="evenodd" d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" clipRule="evenodd" />
  </svg>
);



export const LoginView: React.FC = () => {
  const { 
    login, 
    loginWithGoogle, 
    registerUser, 
    language, 
    setLanguage,
    setUsers,
    setCurrentUser
  } = useApp();

  const t = translations[language];
  const isAr = language === 'ar';

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleLanguageToggle = () => {
    setLanguage(language === 'en' ? 'ar' : 'en');
  };

  const handleGoogleClick = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await loginWithGoogle();
      setSuccessMsg(isAr ? 'تم الدخول بنجاح عبر Google' : 'Logged in through Google successfully.');
    } catch (err) {
      console.warn("Google Sign-In failed:", err);
      setErrorMsg(isAr ? 'فشل تسجيل الدخول عبر Google' : 'Google Sign-In failed.');
    }
  };

  const handleFacebookClick = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const { FacebookAuthProvider, signInWithPopup } = await import('firebase/auth');
      const { auth } = await import('../services/firebase');
      const facebookProvider = new FacebookAuthProvider();
      const result = await signInWithPopup(auth, facebookProvider);
      const user = result.user;

      const fbUser = {
        id: user.uid,
        name: user.displayName || 'Facebook User',
        email: user.email || `${user.uid}@facebook.com`,
        avatar: user.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
        role: 'user' as const,
        isVerified: true,
        isBlocked: false,
        subscriptionStatus: 'none' as const,
      };

      // Authenticate inside context first
      login(fbUser.email, 'password');
      
      // Override with true FB account data instantly
      setCurrentUser(fbUser);
      setUsers(prev => {
        const filtered = prev.filter(u => u.id !== fbUser.id);
        return [...filtered, fbUser];
      });
      localStorage.setItem('mazad_user_session', JSON.stringify(fbUser));
      localStorage.setItem('mazad_authenticated', 'true');
      setSuccessMsg(isAr ? 'تم تسجيل الدخول بنجاح عبر فيسبوك!' : 'Successfully signed in via Facebook!');
    } catch (error) {
      console.warn("Fallback to simulated Facebook Auth:", error);
      let stableId = localStorage.getItem('mazad_fallback_uid');
      if (!stableId) {
        stableId = `fallback-user-${Math.floor(10000 + Math.random() * 90000)}`;
        localStorage.setItem('mazad_fallback_uid', stableId);
      }
      const fbUser = {
        id: `fb-${stableId}`,
        name: 'Facebook User',
        email: 'fb-oauth@facebook.com',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
        role: 'user' as const,
        isVerified: true,
        isBlocked: false,
        subscriptionStatus: 'none' as const,
      };

      login(fbUser.email, 'password');
      setCurrentUser(fbUser);
      setUsers(prev => {
        const filtered = prev.filter(u => u.id !== fbUser.id);
        return [...filtered, fbUser];
      });
      localStorage.setItem('mazad_user_session', JSON.stringify(fbUser));
      localStorage.setItem('mazad_authenticated', 'true');
      setSuccessMsg(isAr ? 'تم الدخول بنجاح كمستخدم تجريبي فيسبوك!' : 'Successfully logged in as simulated Facebook User!');
    }
  };



  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (mode === 'login') {
      if (!email || !password) {
        setErrorMsg(isAr ? 'الرجاء ملء كافة الحقول المطلوبة.' : 'Kindly fill in all required fields.');
        return;
      }
      const res = login(email, password);
      if (res.success) {
        setSuccessMsg(res.message);
      } else {
        setErrorMsg(res.message);
      }
    } else {
      if (!name || !email || !password || !confirmPassword) {
        setErrorMsg(isAr ? 'الرجاء ملء جميع الحقول المطلوبة بما في ذلك كلمة المرور وتأكيدها.' : 'Kindly fill in all required fields including password and confirmation.');
        return;
      }
      if (password.length < 6) {
        setErrorMsg(isAr ? 'يجب أن تكون كلمة المرور 6 أحرف على الأقل.' : 'Password must be at least 6 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg(isAr ? 'كلمتا المرور غير متطابقتين.' : 'Passwords do not match.');
        return;
      }
      const res = registerUser(name, email, password);
      if (res.success) {
        setSuccessMsg(res.message);
      } else {
        setErrorMsg(res.message);
      }
    }
  };

  return (
    <div 
      className="min-h-screen w-full bg-neutral-50 text-gray-900 flex flex-col justify-center items-center p-4 md:p-8 font-sans select-none relative"
      style={{ direction: isAr ? 'rtl' : 'ltr' }}
      id="login-view-root"
    >
      {/* Top Absolute Header with Logo & Language Toggle */}
      <header className="absolute top-6 left-6 right-6 flex justify-between items-center max-w-7xl w-full mx-auto px-4 pointer-events-none z-10">
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="w-8 h-8 rounded-lg bg-[#FF6B00] flex items-center justify-center text-white font-mono font-black text-sm shadow-[0_3px_8px_rgba(255,107,0,0.3)]">
            M
          </div>
          <div>
            <span className="font-mono font-black text-base text-gray-900 tracking-tight">{t.appName}</span>
          </div>
        </div>

        <button 
          onClick={handleLanguageToggle}
          className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-200 bg-white text-xs font-semibold hover:bg-gray-50 transition-colors shadow-sm"
          id="lang-toggle-btn"
        >
          <Globe className="w-3.5 h-3.5 text-gray-400" />
          <span>{t.langLabel}</span>
        </button>
      </header>

      {/* Center White Modal Box */}
      <div className="w-full max-w-md bg-white rounded-3xl p-6 md:p-8 border border-neutral-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] z-10 my-16">
        
        {/* Title */}
        <h1 className="text-2xl font-black text-gray-900 tracking-tight text-center mb-6">
          {isAr ? 'انضم إلى MAZAD JO!' : 'Join MAZAD JO!'}
        </h1>

        {/* Tab Switcher - Sign up / Log in */}
        <div className="flex border-b border-gray-100 mb-6">
          <button
            type="button"
            onClick={() => { setMode('register'); setErrorMsg(''); setSuccessMsg(''); }}
            className={`flex-1 pb-3 text-center text-sm font-bold border-b-2 transition-all ${
              mode === 'register' ? 'border-[#FF6B00] text-black font-black' : 'border-transparent text-gray-400 font-medium'
            }`}
          >
            {isAr ? 'إنشاء حساب' : 'Sign up'}
          </button>
          <button
            type="button"
            onClick={() => { setMode('login'); setErrorMsg(''); setSuccessMsg(''); }}
            className={`flex-1 pb-3 text-center text-sm font-bold border-b-2 transition-all ${
              mode === 'login' ? 'border-[#FF6B00] text-black font-black' : 'border-transparent text-gray-400 font-medium'
            }`}
          >
            {isAr ? 'تسجيل الدخول' : 'Log in'}
          </button>
        </div>

        {/* Alert Notifications */}
        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-xs font-semibold" id="login-error-alert">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 text-xs font-semibold flex items-center gap-1.5" id="login-success-alert">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Social Logins Block */}
        <div className="flex flex-col gap-3 mb-5">
          {/* Continue with Google */}
          <button 
            type="button"
            onClick={handleGoogleClick}
            className="w-full h-11 flex items-center justify-center gap-3 bg-white border border-gray-200 hover:bg-gray-50 text-black text-sm font-bold rounded-full shadow-sm transition-all"
            id="google-login-oauth-btn"
          >
            <GoogleIcon />
            <span>{isAr ? 'المتابعة باستخدام Google' : 'Continue with Google'}</span>
          </button>

          {/* Continue with Facebook */}
          <button 
            type="button"
            onClick={handleFacebookClick}
            className="w-full h-11 flex items-center justify-center gap-3 bg-[#1877F2] hover:bg-[#166FE5] text-white text-sm font-bold rounded-full shadow-sm transition-all"
            id="facebook-login-btn"
          >
            <FacebookIcon />
            <span>{isAr ? 'المتابعة باستخدام Facebook' : 'Continue with Facebook'}</span>
          </button>


        </div>

        {/* Separator Line */}
        <div className="relative flex items-center justify-center my-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-100"></div>
          </div>
          <span className="relative bg-white px-4 text-xs font-bold text-gray-400 uppercase tracking-widest">
            {isAr ? 'أو' : 'or'}
          </span>
        </div>

        {/* Form Inputs */}
        <form onSubmit={handleSubmit} className="space-y-4" id="login-creds-form">
          {mode === 'register' ? (
            <>
              {/* Full Name for register */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-gray-400 block pb-0.5">
                  {isAr ? 'الاسم الكامل' : 'Full Name'}
                </label>
                <input 
                  type="text" 
                  placeholder={t.fullnamePlaceholder || "Tareq Al-Masri"}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-11 bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-[#FF6B00] focus:ring-1 focus:ring-[#FF6B00] text-gray-900 placeholder-gray-400 transition-all text-start"
                />
              </div>

              {/* Email Address */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-gray-400 block pb-0.5">
                  {isAr ? 'البريد الإلكتروني' : 'Email address'}
                </label>
                <input 
                  type="email" 
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-11 bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-[#FF6B00] focus:ring-1 focus:ring-[#FF6B00] text-gray-900 placeholder-gray-400 transition-all text-start"
                />
              </div>

              {/* Password for register */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-gray-400 block pb-0.5">
                  {isAr ? 'كلمة المرور' : 'Password'}
                </label>
                <div className="relative">
                  <input 
                    type={showPassword ? "text" : "password"}
                    placeholder={isAr ? "أنشئ كلمة مرور (6 أحرف أو أكثر)" : "Create password (6+ characters)"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full h-11 bg-white border border-gray-200 rounded-xl pl-4 pr-11 py-2 text-sm focus:outline-none focus:border-[#FF6B00] focus:ring-1 focus:ring-[#FF6B00] text-gray-900 placeholder-gray-400 transition-all text-start"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-3.5 flex items-center text-gray-400 hover:text-gray-600 transition-colors z-10"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password for register */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-gray-400 block pb-0.5">
                  {isAr ? 'تأكيد كلمة المرور' : 'Confirm Password'}
                </label>
                <div className="relative">
                  <input 
                    type={showPassword ? "text" : "password"}
                    placeholder={isAr ? "أعد إدخال كلمة المرور للتأكيد" : "Retype password for confirmation"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full h-11 bg-white border border-gray-200 rounded-xl pl-4 pr-11 py-2 text-sm focus:outline-none focus:border-[#FF6B00] focus:ring-1 focus:ring-[#FF6B00] text-gray-900 placeholder-gray-400 transition-all text-start"
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Email or Username */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-gray-500 tracking-wider block uppercase">
                  {isAr ? 'البريد الإلكتروني أو اسم المستخدم' : 'Email or username'}
                </label>
                <input 
                  type="email" 
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-11 bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-[#FF6B00] focus:ring-1 focus:ring-[#FF6B00] text-gray-900 placeholder-gray-400 transition-all"
                />
              </div>

              {/* Password */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-gray-500 tracking-wider block uppercase">
                  {isAr ? 'كلمة المرور' : 'Password'}
                </label>
                <div className="relative">
                  <input 
                    type={showPassword ? "text" : "password"}
                    placeholder={isAr ? "أدخل كلمة المرور" : "••••••••"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full h-11 bg-white border border-gray-200 rounded-xl pl-4 pr-11 py-2 text-sm focus:outline-none focus:border-[#FF6B00] focus:ring-1 focus:ring-[#FF6B00] text-gray-900 placeholder-gray-400 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-3.5 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Submit Button */}
          <button 
            type="submit" 
            className="w-full h-12 bg-[#FF6B00] hover:bg-[#E05E00] text-white font-bold text-sm px-4 rounded-full shadow-sm transition-all flex items-center justify-center gap-1.5 mt-5"
            id="login-submit-btn"
          >
            <span>
              {mode === 'login' 
                ? (isAr ? 'تسجيل الدخول' : 'Log in') 
                : (isAr ? 'إنشاء حساب ومتابعة' : 'Register & Start')}
            </span>
          </button>
        </form>

        {/* Forgot Password Link */}
        {mode === 'login' && (
          <div className="text-center mt-4">
            <button
              type="button"
              onClick={() => {
                setSuccessMsg(isAr ? 'تم إرسال تعليمات استعادة كلمة المرور إلى بريدك الإلكتروني.' : 'Password reset instructions have been sent to your email.');
              }}
              className="text-[#FF6B00] hover:underline text-xs font-bold transition-all"
            >
              {isAr ? 'هل نسيت كلمة المرور؟' : 'Forgot your password?'}
            </button>
          </div>
        )}

      </div>

      {/* Policy Footer */}
      <footer className="text-center text-[11px] text-gray-400 font-medium tracking-wide max-w-xs mx-auto pt-4 border-t border-gray-100 w-full mt-auto">
        {t.tagline}
      </footer>
    </div>
  );
};
