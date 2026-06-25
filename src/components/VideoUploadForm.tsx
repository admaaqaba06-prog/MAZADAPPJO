import React, { useState, useRef, useEffect } from 'react';
import { Video, RefreshCw, UploadCloud, Film, Link2 } from 'lucide-react';

interface VideoUploadFormProps {
  onVideoSelect?: (file: File | null, videoUrl: string | null) => void;
  language?: 'en' | 'ar';
}

export const VideoUploadForm: React.FC<VideoUploadFormProps> = ({ onVideoSelect, language = 'en' }) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'url'>('upload');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [inputUrl, setInputUrl] = useState<string>('');
  const [fileDetails, setFileDetails] = useState<{ name: string; size: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAr = language === 'ar';

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.match('video.*')) {
        alert(isAr ? 'الرجاء اختيار ملف فيديو فقط.' : 'Please select a video file only.');
        return;
      }
      
      // Cleanup previous object url to prevent memory leaks
      if (videoUrl && videoUrl.startsWith('blob:')) {
        URL.revokeObjectURL(videoUrl);
      }

      const localUrl = URL.createObjectURL(file);
      setVideoFile(file);
      setVideoUrl(localUrl);
      setFileDetails({
        name: file.name,
        size: formatFileSize(file.size)
      });

      if (onVideoSelect) {
        onVideoSelect(file, localUrl);
      }
    }
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputUrl.trim()) return;

    // Direct url from web
    if (videoUrl && videoUrl.startsWith('blob:')) {
      URL.revokeObjectURL(videoUrl);
    }

    setVideoFile(null);
    setVideoUrl(inputUrl.trim());
    setFileDetails({
      name: isAr ? 'رابط فيديو خارجي' : 'External Web Video',
      size: isAr ? 'غير محدد' : 'Unknown size'
    });

    if (onVideoSelect) {
      onVideoSelect(null, inputUrl.trim());
    }
  };

  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (videoUrl && videoUrl.startsWith('blob:')) {
      URL.revokeObjectURL(videoUrl);
    }
    
    setVideoFile(null);
    setVideoUrl(null);
    setInputUrl('');
    setFileDetails(null);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    if (onVideoSelect) {
      onVideoSelect(null, null);
    }
  };

  return (
    <div id="video-upload-container" className="w-full">
      {/* Tabs */}
      <div className="flex border-b border-gray-100 mb-4 bg-gray-50 p-1 rounded-xl gap-1">
        <button
          type="button"
          onClick={() => {
            if (!videoUrl) setActiveTab('upload');
          }}
          disabled={!!videoUrl}
          className={`flex-1 py-2 text-xs font-black rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'upload'
              ? 'bg-white text-[#FF6B00] shadow-sm'
              : 'text-gray-500 hover:text-gray-900 disabled:opacity-50'
          }`}
        >
          <UploadCloud className="w-3.5 h-3.5" />
          <span>{isAr ? 'رفع فيديو محلي' : 'Local Video Upload'}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            if (!videoUrl) setActiveTab('url');
          }}
          disabled={!!videoUrl}
          className={`flex-1 py-2 text-xs font-black rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'url'
              ? 'bg-white text-[#FF6B00] shadow-sm'
              : 'text-gray-500 hover:text-gray-900 disabled:opacity-50'
          }`}
        >
          <Link2 className="w-3.5 h-3.5" />
          <span>{isAr ? 'رابط فيديو من الويب' : 'Web Video URL'}</span>
        </button>
      </div>

      <input
        type="file"
        accept="video/mp4,video/*"
        onChange={handleFileSelect}
        ref={fileInputRef}
        style={{ display: 'none' }}
        id="video-upload-input"
      />

      {videoUrl ? (
        <div className="space-y-3" id="video-preview-wrapper bg-white">
          <div className="w-full rounded-2xl overflow-hidden border border-gray-200 shadow-sm bg-black relative max-h-[220px] flex items-center justify-center">
            <video
              src={videoUrl}
              controls
              className="w-full max-h-[200px] object-contain"
              playsInline
              id="video-preview-player"
            />
          </div>

          {fileDetails && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-gray-50 p-3.5 rounded-xl border border-gray-150">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black text-gray-800 truncate font-mono" title={fileDetails.name}>
                  {fileDetails.name}
                </p>
                <p className="text-[10px] text-gray-400 font-mono font-bold mt-0.5">
                  {isAr ? 'المصدر' : 'Source'}: {videoFile ? (isAr ? 'ملف محلي' : 'Local File') : (isAr ? 'رابط ويب' : 'Web Link')}
                </p>
              </div>
              <button
                type="button"
                onClick={handleReset}
                className="text-[11px] font-black text-orange-600 hover:text-orange-700 transition-colors uppercase tracking-wider shrink-0 cursor-pointer"
                id="change-video-btn"
              >
                {isAr ? 'حذف / تغيير ↺' : 'Change Video ↺'}
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          {activeTab === 'upload' ? (
            <label 
              htmlFor="video-upload-input"
              className="flex flex-col items-center justify-center w-full min-h-[140px] px-4 py-8 border-2 border-dashed border-[#FF6B00] bg-[#FFF8F3] hover:bg-[#FFF4EB] transition-colors rounded-2xl cursor-pointer dynamic-touch-target select-none"
              id="video-tap-area"
            >
              <div className="flex flex-col items-center text-center space-y-2.5">
                <span className="text-4xl">📹</span>
                <div className="space-y-1">
                  <p className="text-sm font-black text-[#FF6B00] tracking-tight">
                    {isAr ? 'اضغط لرفع فيديو المنتج' : 'Click to upload product video'}
                  </p>
                  <p className="text-xs text-gray-400 font-bold">
                    {isAr ? 'MP4 أو أي صيغة فيديو' : 'MP4, WebM or Quicktime'}
                  </p>
                </div>
              </div>
            </label>
          ) : (
            <form onSubmit={handleUrlSubmit} className="space-y-3 p-4 border border-gray-200 rounded-2xl bg-white shadow-sm">
              <div className="space-y-1">
                <label className="text-[11px] font-black text-gray-700 uppercase tracking-wide block">
                  {isAr ? 'أدخل رابط الفيديو المباشر من الويب' : 'Enter Direct Web Video URL'}
                </label>
                <input
                  type="url"
                  required
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  placeholder="https://example.com/my-video.mp4"
                  className="w-full h-10 px-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 text-xs font-semibold placeholder-gray-400 focus:border-[#FF6B00] outline-none transition-all"
                />
              </div>
              <button
                type="submit"
                className="w-full h-10 bg-[#FF6B00] hover:bg-orange-600 text-white font-black text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Link2 className="w-4 h-4" />
                <span>{isAr ? 'استيراد فيديو الويب' : 'Import Web Video'}</span>
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
};

export default VideoUploadForm;
