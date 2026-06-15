import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { translations } from '../utils/translations';
import { Shield, Sparkles, Globe, Mail, Lock, User, CheckCircle2 } from 'lucide-react';

export const LoginView: React.FC = () => {
  const { login, loginWithGoogle, registerUser, language, setLanguage } = useApp();
  const t = translations[language];

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleLanguageToggle = () => {
    setLanguage(language === 'en' ? 'ar' : 'en');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (mode === 'login') {
      if (!email || !password) {
        setErrorMsg(language === 'en' ? 'Kindly fill in all registers.' : 'الرجاء ملء كافة الحقول المطلوبة.');
        return;
      }
      const res = login(email, password);
      if (res.success) {
        setSuccessMsg(res.message);
      } else {
        setErrorMsg(res.message);
      }
    } else {
      if (!name || !email) {
        setErrorMsg(language === 'en' ? 'Kindly fill in all fields.' : 'الرجاء ملء جميع الحقول المطلوبة');
        return;
      }
      const res = registerUser(name, email);
      if (res.success) {
        setSuccessMsg(res.message);
      } else {
        setErrorMsg(res.message);
      }
    }
  };

  // Instant login preset triggers
  const handlePresetTrigger = (mail: string) => {
    login(mail, '123456');
  };

  const isAr = language === 'ar';

  return (
    <div 
      className="min-h-screen w-full bg-white text-gray-900 flex flex-col justify-between p-6 md:p-12 font-sans select-none"
      style={{ direction: isAr ? 'rtl' : 'ltr' }}
      id="login-view-root"
    >
      {/* Top Bar with Logo & Language Toggle */}
      <header className="flex justify-between items-center w-full max-w-lg mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#FF6B00] flex items-center justify-center text-white font-mono font-black text-sm shadow-[0_3px_8px_rgba(255,107,0,0.3)]">
            M
          </div>
          <div>
            <span className="font-mono font-black text-base text-gray-900 tracking-tight">{t.appName}</span>
            <span className="text-[8px] block text-gray-400 font-mono tracking-wider text-xs -mt-1">{t.escrowAudit}</span>
          </div>
        </div>

        {/* Translation Switch Button */}
        <button 
          onClick={handleLanguageToggle}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-200 text-xs font-semibold hover:bg-gray-50 transition-colors"
          id="lang-toggle-btn"
        >
          <Globe className="w-3.5 h-3.5 text-gray-400" />
          <span>{t.langLabel}</span>
        </button>
      </header>

      {/* Main Content Area */}
      <main className="w-full max-w-md mx-auto my-auto py-8">
        <div className="text-center space-y-2 mb-8">
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">
            {mode === 'login' ? t.welcomeBack : t.signupLink}
          </h1>
          <p className="text-xs text-gray-500 max-w-sm mx-auto leading-relaxed">
            {mode === 'login' ? t.signInTitle : t.appSubtitle}
          </p>
        </div>

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

        {/* Credentials Form */}
        <form onSubmit={handleSubmit} className="space-y-4" id="login-creds-form">
          {mode === 'register' && (
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 tracking-wider block uppercase font-mono">
                {t.fullnameLabel}
              </label>
              <div className="relative">
                <User className={`absolute top-3.5 ${isAr ? 'right-3' : 'left-3'} w-4 h-4 text-gray-400`} />
                <input 
                  type="text" 
                  placeholder={t.fullnamePlaceholder}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`w-full bg-gray-50 border border-gray-200/80 rounded-xl py-3 ${isAr ? 'pr-9 pl-3' : 'pl-9 pr-3'} text-xs focus:outline-none focus:border-[#FF6B00] focus:bg-white transition-colors text-gray-800`}
                />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 tracking-wider block uppercase font-mono">
              {t.emailLabel}
            </label>
            <div className="relative">
              <Mail className={`absolute top-3.5 ${isAr ? 'right-3' : 'left-3'} w-4 h-4 text-gray-400`} />
              <input 
                type="email" 
                placeholder="example@domain.jo"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`w-full bg-gray-50 border border-gray-200/80 rounded-xl py-3 ${isAr ? 'pr-9 pl-3' : 'pl-9 pr-3'} text-xs focus:outline-none focus:border-[#FF6B00] focus:bg-white transition-colors text-gray-800`}
              />
            </div>
          </div>

          {mode === 'login' && (
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 tracking-wider block uppercase font-mono">
                {t.passwordLabel}
              </label>
              <div className="relative">
                <Lock className={`absolute top-3.5 ${isAr ? 'right-3' : 'left-3'} w-4 h-4 text-gray-400`} />
                <input 
                  type="password" 
                  placeholder={t.passPlaceholder}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full bg-gray-50 border border-gray-200/80 rounded-xl py-3 ${isAr ? 'pr-9 pl-3' : 'pl-9 pr-3'} text-xs focus:outline-none focus:border-[#FF6B00] focus:bg-white transition-colors text-gray-800`}
                />
              </div>
            </div>
          )}

          <button 
            type="submit" 
            className="w-full bg-[#FF6B00] text-white font-black text-xs py-3.5 rounded-xl shadow-[0_4px_12px_rgba(255,107,0,0.25)] hover:scale-[1.01] hover:brightness-105 active:scale-[0.99] transition-all flex items-center justify-center gap-1.5 mt-2"
            id="login-submit-submit-btn"
          >
            <Shield className="w-4 h-4" /> 
            <span>{mode === 'login' ? t.loginBtn : t.registerBtn}</span>
          </button>
        </form>

        {/* Divider */}
        <div className="relative my-6 text-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-100"></div>
          </div>
          <span className="relative bg-white px-3 text-[10px] text-gray-400 font-bold tracking-wider font-mono uppercase">
            {t.orText}
          </span>
        </div>

        {/* OAuth Google Simulator Button */}
        <button 
          onClick={loginWithGoogle}
          className="w-full bg-gray-50 hover:bg-gray-100 text-gray-700 font-bold text-xs py-3 rounded-xl border border-gray-100 flex items-center justify-center gap-2 transition-all"
          id="google-login-oauth-btn"
        >
          <img src="https://images.unsplash.com/photo-1573804633927-bfcbcd909acd?auto=format&fit=crop&w=40&h=40&q=80" alt="Google" className="w-4 h-4 object-contain" />
          <span>{t.googleLogin}</span>
        </button>

        {/* Toggle Mode */}
        <div className="text-center mt-6 text-xs text-gray-500">
          <span>{mode === 'login' ? t.signupPrompt : t.existingPrompt} </span>
          <button 
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            className="text-[#FF6B00] font-black hover:underline"
            id="login-view-toggle-mode-btn"
          >
            {mode === 'login' ? t.signupLink : t.existingLink}
          </button>
        </div>
      </main>

      {/* Policy Footer */}
      <footer className="text-center text-[10px] text-gray-400 font-mono tracking-wide max-w-xs mx-auto pt-6 border-t border-gray-100 w-full mt-auto">
        {t.tagline}
      </footer>
    </div>
  );
};
