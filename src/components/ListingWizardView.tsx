import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { VideoUploadForm } from './VideoUploadForm';
import { AuctionItem } from '../types';
import { translations } from '../utils/translations';
import { 
  Upload, 
  Tv, 
  Watch, 
  CheckCheck, 
  FileText, 
  Coins, 
  Clock, 
  AlertCircle, 
  Sliders,
  ChevronRight,
  Sparkles,
  RefreshCw,
  FolderOpen
} from 'lucide-react';

export const ListingWizardView: React.FC = () => {
  const { createListing, setActiveView, language } = useApp();
  const t = translations[language];
  const isAr = language === 'ar';

  // State configurations
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<'Electronics' | 'Luxury' | 'Vehicles' | 'Fashion' | 'Real Estate'>('Luxury');
  const [startingPrice, setStartingPrice] = useState('1500');
  const [minIncrement, setMinIncrement] = useState('50');
  const [duration, setDuration] = useState('600'); // 10 minutes

  // Video assets preset references
  const [videoSourceMode, setVideoSourceMode] = useState<'custom' | 'preset'>('custom');
  const [customVideoUrl, setCustomVideoUrl] = useState<string | null>(null);
  const [rawVideoFile, setRawVideoFile] = useState<File | null>(null);
  const [videoPreset, setVideoPreset] = useState<string>('luxury');
  const [customThumbnail, setCustomThumbnail] = useState<string>('');

  // Loader state variables
  const [progressVal, setProgressVal] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<'draft' | 'transferring' | 'transcoding' | 'done'>('draft');

  const presets = {
    luxury: {
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
      thumbnail: 'https://images.unsplash.com/photo-1547996165-f823e595aa?auto=format&fit=crop&w=500&q=80'
    },
    tech: {
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      thumbnail: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=500&q=80'
    },
    vehicle: {
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
      thumbnail: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=500&q=80'
    },
    realEstate: {
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
      thumbnail: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=500&q=80'
    }
  };

  const handleSimulatedListingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      alert(isAr ? 'الرجاء ملء جميع مربعات الوصف المطلوبة.' : 'Kindly fill in all descriptions.');
      return;
    }
    if (isNaN(Number(startingPrice)) || Number(startingPrice) <= 0) {
      alert(isAr ? 'حدد سعر بدء صحيح بالدينار الأردني.' : 'Specify correct JOD price.');
      return;
    }
    if (videoSourceMode === 'custom' && !customVideoUrl) {
      alert(isAr ? 'الرجاء تصوير أو رفع فيديو أولاً.' : 'Please record or upload a video first.');
      return;
    }

    setIsUploading(true);
    setUploadPhase('transferring');
    setProgressVal(15);

    const timing = setInterval(() => {
      setProgressVal(prev => {
        if (prev < 65) {
          return prev + 15;
        } else if (prev >= 65 && prev < 90) {
          setUploadPhase('transcoding');
          return prev + 10;
        } else {
          clearInterval(timing);
          setUploadPhase('done');
          
          const key = videoPreset as keyof typeof presets;
          // Trigger Creation inside central context lists with STATUS: "Processing" automatically!
          createListing({
            title,
            description,
            category,
            startingPrice: Number(startingPrice),
            minIncrement: Number(minIncrement),
            videoUrl: videoSourceMode === 'custom' && customVideoUrl ? customVideoUrl : (presets[key]?.videoUrl || presets.luxury.videoUrl),
            thumbnailUrl: customThumbnail || (videoSourceMode === 'custom' ? 'https://images.unsplash.com/photo-1547996165-f823e595aa?auto=format&fit=crop&w=500&q=80' : presets[key]?.thumbnail) || presets.luxury.thumbnail,
            endTime: Date.now() + Number(duration) * 1000,
            duration: Number(duration),
            isFeatured: false
          }, videoSourceMode === 'custom' ? rawVideoFile : null);

          setTimeout(() => {
            setIsUploading(false);
            setUploadPhase('draft');
            setProgressVal(0);
            // Instantly go to administrative board to approve/release
            setActiveView('admin');
          }, 1100);

          return 100;
        }
      });
    }, 300);
  };

  return (
    <div 
      className="flex-1 overflow-y-auto w-full flex flex-col bg-white pb-24 overscroll-behavior-y-contain select-none font-sans text-gray-800"
      style={{ direction: isAr ? 'rtl' : 'ltr' }}
      id="listing-wizard-root"
    >
      
      {/* Top Header */}
      <div className="p-4 flex items-center justify-between border-b border-gray-100 sticky top-0 bg-white/95 backdrop-blur-md z-40">
        <h2 className="text-xs font-black tracking-widest text-[#FF6B00] leading-none font-mono uppercase">
          {isAr ? 'استديو إنشاء المزاد' : 'LOT CREATION STUDIO'}
        </h2>
        <span className="text-[9px] bg-[#FF6B00]/10 text-[#FF6B00] font-mono px-2 py-0.5 rounded-full font-bold">
          {isAr ? 'رفع اللوت' : 'CREATOR LIVE'}
        </span>
      </div>

      {isUploading ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-6" id="uploading-state-screen">
          <div className="w-16 h-16 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center text-[#FF6B00] relative overflow-hidden shadow-sm">
            <RefreshCw className="w-8 h-8 animate-spin" />
          </div>

          <div className="text-center space-y-2 max-w-sm w-full">
            <h3 className="text-xs font-extrabold text-[#FF6B00] tracking-wider uppercase font-mono">
              {uploadPhase === 'transferring' ? (isAr ? 'جاري نقل اللوت وتجهيز الفيديو...' : 'TRANSMITTING VIDEO GRIDS...') : 
               uploadPhase === 'transcoding' ? (isAr ? 'جاري التشفير والتأمين المالي...' : 'SECURING CONTRACT ESCROWS...') : (isAr ? 'تم الرفع بنجاح!' : 'SUBMISSION READY!')}
            </h3>
            
            <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden border border-gray-200">
              <div 
                className="bg-[#FF6B00] h-full transition-all duration-300"
                style={{ width: `${progressVal}%` }}
              ></div>
            </div>
            <p className="text-[9.5px] text-gray-400 font-mono tracking-widest">{progressVal}% COMMITTED PACKETS</p>
          </div>

          <div className="p-4 rounded-xl bg-gray-50 border border-gray-100/50 text-[9.5px] text-gray-500 font-mono text-left max-w-xs space-y-1 w-full" style={{ direction: 'ltr' }}>
            <div>• Target Node: JORDAN-AMMAN-S3</div>
            <div>• Encoder: H.264 HEVC 1080p Secure</div>
            <div>• Status: TRANSMITTING_PACKETS</div>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSimulatedListingSubmit} className="p-4 space-y-5 text-xs font-sans" id="listing-wizard-form">
          
          {/* Section 1: Video File selector */}
          <div className="bg-gray-50/50 border border-gray-200/60 rounded-2xl p-4 space-y-3.5 shadow-sm">
            <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
              <Upload className="w-4 h-4 text-[#FF6B00]" />
              <h3 className="text-xs font-black text-gray-800 leading-none uppercase">{isAr ? 'مرفقات الفيديو والبث' : 'VIDEO RECORD & MEDIA SOURCE'}</h3>
            </div>

            {/* Video Source Tabs Switcher */}
            <div className="flex bg-gray-100/80 p-1 rounded-xl gap-1 border border-gray-200/50">
              <button
                type="button"
                onClick={() => setVideoSourceMode('custom')}
                className={`flex-1 text-center py-2 text-[10.5px] font-bold rounded-lg transition-all cursor-pointer ${videoSourceMode === 'custom' ? 'bg-[#FF6B00] text-white shadow-sm' : 'text-gray-500 hover:text-gray-900 bg-transparent'}`}
              >
                {isAr ? 'تصوير أو رفع فيديو' : 'Record / Upload'}
              </button>
              <button
                type="button"
                onClick={() => setVideoSourceMode('preset')}
                className={`flex-1 text-center py-2 text-[10.5px] font-bold rounded-lg transition-all cursor-pointer ${videoSourceMode === 'preset' ? 'bg-[#FF6B00] text-white shadow-sm' : 'text-gray-500 hover:text-gray-900 bg-transparent'}`}
              >
                {isAr ? 'عرض تجريبي جاهز' : 'Preset Demo Loop'}
              </button>
            </div>

            {videoSourceMode === 'custom' ? (
              <div className="py-1">
                <VideoUploadForm 
                  onVideoSelect={(file, url) => {
                    setCustomVideoUrl(url);
                    setRawVideoFile(file);
                  }} 
                  language={language} 
                />
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-[9.5px] text-gray-400 uppercase font-mono block font-bold">{isAr ? 'اختر لوت الفيديو التجريبي' : 'SELECT PRESET VIDEO DEMO LOOP'}</label>
                <select 
                  value={videoPreset} 
                  onChange={(e) => setVideoPreset(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl py-2.5 px-3 text-gray-800 text-xs focus:outline-none focus:border-[#FF6B00]"
                >
                  <option value="luxury">{isAr ? 'عرض فاخر لساعة رولكس دايتونا الذهبية' : 'Rolex Daytona Gold watch Premium Show'}</option>
                  <option value="tech">{isAr ? 'استعراض لابتوب ماك بوك برو باللون الأسود' : 'Stealth MacBook Pro Reveal Loop'}</option>
                  <option value="vehicle">{isAr ? 'فيديو حماسي لسيارة بورشه ٩١١ على الحلبة' : 'Porsche 911 GT3 RS Track Drive'}</option>
                  <option value="realEstate">{isAr ? 'فيديو داخلي لبنتهاوس دابوق الذكي الفخم' : 'Dabouq Contemporary Smart Penthouse Deck'}</option>
                </select>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[9.5px] text-gray-400 uppercase font-mono block font-bold">{isAr ? 'رابط صورة الغلاف أو اللوت (اختياري)' : 'LOT COVER THUMBNAIL IMAGE URL (OPTIONAL)'}</label>
              <input
                type="text"
                placeholder={isAr ? 'اتركه فارغاً للاستخراج التلقائي من الفيديو' : 'Leave empty to auto-extract thumbnail'}
                value={customThumbnail}
                onChange={(e) => setCustomThumbnail(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-xl py-2.5 px-3 text-gray-800 focus:outline-none focus:border-[#FF6B00]"
              />
            </div>
          </div>

          {/* Section 2: Product Specifications */}
          <div className="bg-gray-50/50 border border-gray-200/60 rounded-2xl p-4 space-y-3.5 shadow-sm">
            <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
              <FileText className="w-4 h-4 text-[#FF6B00]" />
              <h3 className="text-xs font-black text-gray-800 leading-none uppercase">{isAr ? 'مواصفات وتفاصيل المعروض' : 'LOT SPECIFICATIONS'}</h3>
            </div>

            <div className="space-y-1">
              <label className="text-[9.5px] text-gray-400 uppercase font-mono block font-bold">{isAr ? 'عنوان المزاد الرئيسي' : 'MAIN LISTING TITLE'}</label>
              <input 
                type="text" 
                placeholder={isAr ? 'مثال: رولكس صبمارين جديدة مع العلبة والأوراق' : 'e.g. Unworn Rolex Submariner Gold Edition'}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-xl py-2.5 px-3 text-gray-800 focus:outline-none focus:border-[#FF6B00]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[9.5px] text-gray-400 uppercase font-mono block font-bold">{isAr ? 'تفاصيل حالة اللوت وسكوب الشحن' : 'LOT CONDITION & SHIP LOGISTICS'}</label>
              <textarea 
                rows={3}
                placeholder={isAr ? 'اذكر الرقم التسلسلي، حالة الخدوش، الأوراق الثبوتية وقنوات الشحن للبلقاء أو عمان...' : 'Briefly mention serial card state, legal papers, delivery notes...'}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-xl py-2.5 px-3 text-gray-800 focus:outline-none focus:border-[#FF6B00]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[9.5px] text-gray-400 uppercase font-mono block font-bold">{isAr ? 'التصنيف' : 'CATEGORY'}</label>
                <select 
                  value={category} 
                  onChange={(e) => setCategory(e.target.value as any)}
                  className="w-full bg-white border border-gray-200 rounded-xl py-2.5 px-3 text-gray-800 text-xs focus:outline-none focus:border-[#FF6B00]"
                >
                  <option value="Luxury">{isAr ? 'فاخر وثمين' : 'Luxury'}</option>
                  <option value="Electronics">{isAr ? 'إلكترونيات وأجهزة' : 'Electronics'}</option>
                  <option value="Vehicles">{isAr ? 'سيارات ومركبات' : 'Vehicles'}</option>
                  <option value="Fashion">{isAr ? 'أزياء وماركات' : 'Fashion'}</option>
                  <option value="Real Estate">{isAr ? 'عقارات وأراضي' : 'Real Estate'}</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[9.5px] text-gray-400 uppercase font-mono block font-bold">{isAr ? 'مدة صلاحية المزاد' : 'LIMIT DURATION'}</label>
                <select 
                  value={duration} 
                  onChange={(e) => setDuration(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl py-2.5 px-3 text-gray-800 text-xs focus:outline-none focus:border-[#FF6B00]"
                >
                  <option value="300">{isAr ? '٥ دقائق' : '5 Minutes'}</option>
                  <option value="600">{isAr ? '١٠ دقائق (موصى به)' : '10 Minutes'}</option>
                  <option value="1800">{isAr ? '٣٠ دقيقة' : '30 Minutes'}</option>
                  <option value="7200">{isAr ? 'ساعتين' : '2 Hours'}</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[9.5px] text-gray-400 uppercase font-mono block font-bold">{isAr ? 'السعر الافتتاحي (بالدينار الأردني)' : 'STARTING BID (JOD)'}</label>
                <input 
                  type="number" 
                  value={startingPrice}
                  onChange={(e) => setStartingPrice(e.target.value)}
                  placeholder="e.g. 1500"
                  className="w-full bg-white border border-gray-200 rounded-xl py-2.5 px-3 text-gray-800 focus:outline-none focus:border-[#FF6B00]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9.5px] text-gray-400 uppercase font-mono block font-bold">{isAr ? 'الحد الأدنى للزيادة' : 'MIN INCREMENT (JOD)'}</label>
                <input 
                  type="number" 
                  value={minIncrement}
                  onChange={(e) => setMinIncrement(e.target.value)}
                  placeholder="e.g. 50"
                  className="w-full bg-white border border-gray-200 rounded-xl py-2.5 px-3 text-gray-800 focus:outline-none focus:border-[#FF6B00]"
                />
              </div>
            </div>
          </div>

          <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 text-orange-850">
            <div className="flex gap-2 items-start">
              <AlertCircle className="w-4 h-4 text-[#FF6B00] shrink-0 mt-0.5" />
              <p className="leading-relaxed text-[10.5px]">
                {isAr ? 'عند التقديم، يتم إدراج اللوت فوراً تحت مراجعة التدقيق الإدارية. يرجى تصفح الصفحة الإدارية للموافقة على اللوت وتحريكه لبث مباشر الآن!' : 'Upon placement, listing is pending audits. Switch to the Admin Dashboard (Listings Tab) to instantly approve and release it live.'}
              </p>
            </div>
          </div>

          <button 
            type="submit" 
            className="w-full bg-[#FF6B00] hover:bg-orange-600 text-white font-black text-xs py-4 rounded-xl shadow-[0_4px_16px_rgba(255,107,0,0.25)] hover:scale-[1.01] transition-all flex items-center justify-center gap-2 border border-transparent uppercase"
            id="wizard-form-submit-btn"
          >
            <Sparkles className="w-4 h-4 text-white" /> 
            <span>{isAr ? 'تقديم المعروض وغرفة البث للمراجعة' : 'TRANSMIT STREAM TO PROCESSING AUDITS'}</span>
          </button>

        </form>
      )}

    </div>
  );
};
