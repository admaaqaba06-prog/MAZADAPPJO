import React, { useState, useRef, useEffect } from 'react';
import { Video, RefreshCw, UploadCloud, Film, Link2 } from 'lucide-react';
import { filesFromTransfer, isVideoFile } from '../utils/mediaPickerState';

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
  // Highlight while a file drag is over the zone, so it is visibly a drop target.
  const [dragOver, setDragOver] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
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
    // Reset the input value immediately so re-picking the SAME file fires
    // onChange again (a refused file must be retryable).
    e.target.value = '';
    acceptVideoFile(file);
  };

  /**
   * The one place a video file is validated and accepted, whether it arrived
   * from the picker or from a drop. Extracted from `handleFileSelect` rather
   * than duplicated: the type rules (video/* plus the extension fallback for the
   * Android pickers that report '' or application/octet-stream), the 100MB hard
   * reject and the 25MB warning are product decisions that must not diverge
   * between the two ways in.
   */
  const acceptVideoFile = (file: File | null | undefined) => {
    setErrorMessage(null);
    setWarningMessage(null);

    if (file) {
      console.log("File selected in VideoUploadForm:", {
        name: file.name,
        type: file.type,
        size: file.size
      });

      // Validate type: accept startsWith('video/') OR (empty/application/octet-stream and having extensions .mp4, .mov, .m4v, .webm)
      const fileType = file.type || '';
      const fileName = file.name || '';
      const lastDotIndex = fileName.lastIndexOf('.');
      const fileExtension = lastDotIndex !== -1 ? fileName.substring(lastDotIndex).toLowerCase() : '';
      const acceptedExtensions = ['.mp4', '.mov', '.m4v', '.webm'];

      const isValidType = 
        fileType.startsWith('video/') ||
        ((fileType === '' || fileType === 'application/octet-stream') && acceptedExtensions.includes(fileExtension));

      if (!isValidType) {
        setErrorMessage(isAr 
          ? 'المستند المختار غير مدعوم (يسمح فقط بفيديوهات MP4, MOV, M4V, WEBM).' 
          : 'File type not supported (only MP4, MOV, M4V, WEBM videos are allowed).');
        return;
      }

      // Max size: 100MB (Hard reject)
      if (file.size > 100 * 1024 * 1024) {
        setErrorMessage(isAr
          ? 'عذراً، حجم الفيديو كبير جداً (الحد الأقصى المسموح به هو 100 ميجابايت).'
          : 'Sorry, the video file size is too large (maximum allowed size is 100MB).');
        return;
      }

      // Friendly warning for sizes between 25MB and 100MB
      if (file.size > 25 * 1024 * 1024) {
        setWarningMessage(isAr 
          ? 'تنبيه: حجم الفيديو كبير (أكثر من ٢٥ ميجابايت). قد يستغرق رفعه وقتاً طويلاً أو يفشل تبعاً لسرعة اتصالك بالإنترنت. ننصحك بضغط الفيديو قليلاً أو استخدام خيار "رابط فيديو من الويب" لضمان نشر فوري بلا تأخير!' 
          : 'Warning: This video is quite large (over 25MB). Uploading it may take a long time or fail on slower connections. We highly recommend compressing the video or pasting a "Web Video URL" instead for a fast, hassle-free publish!');
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
    setErrorMessage(null);
    setWarningMessage(null);

    const trimmedUrl = inputUrl.trim();
    if (!trimmedUrl) return;

    // Validation: must start with https:// and end with .mp4 or .webm or .mov (ignoring query string)
    if (!trimmedUrl.startsWith('https://')) {
      setErrorMessage(isAr 
        ? 'الرابط يجب أن يبدأ بـ https:// لضمان الأمان.' 
        : 'The URL must start with https:// for security.');
      return;
    }

    try {
      const urlObj = new URL(trimmedUrl);
      const pathname = urlObj.pathname.toLowerCase();
      if (!pathname.endsWith('.mp4') && !pathname.endsWith('.webm') && !pathname.endsWith('.mov') && !pathname.endsWith('.m4v')) {
        setErrorMessage(isAr 
          ? 'الرابط يجب أن يكون رابط ملف فيديو مباشر (mp4/webm/mov).' 
          : 'The URL must be a direct link to a video file (mp4/webm/mov).');
        return;
      }
    } catch (urlErr) {
      setErrorMessage(isAr 
        ? 'الرابط غير صالح.' 
        : 'Invalid URL.');
      return;
    }

    // Direct url from web
    if (videoUrl && videoUrl.startsWith('blob:')) {
      URL.revokeObjectURL(videoUrl);
    }

    setVideoFile(null);
    setVideoUrl(trimmedUrl);
    setFileDetails({
      name: isAr ? 'رابط فيديو خارجي' : 'External Web Video',
      size: isAr ? 'غير محدد' : 'Unknown size'
    });

    if (onVideoSelect) {
      onVideoSelect(null, trimmedUrl);
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
    setErrorMessage(null);
    setWarningMessage(null);
    
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
      <div className="flex border-b border-line mb-4 bg-surface-sunken p-1 rounded-xl gap-1">
        <button
          type="button"
          onClick={() => {
            if (!videoUrl) setActiveTab('upload');
          }}
          disabled={!!videoUrl}
          className={`flex-1 py-2 text-xs font-black rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'upload'
              ? 'bg-surface-raised text-[#FF6B00] shadow-sm'
              : 'text-fg-muted hover:text-fg disabled:opacity-50'
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
              ? 'bg-surface-raised text-[#FF6B00] shadow-sm'
              : 'text-fg-muted hover:text-fg disabled:opacity-50'
          }`}
        >
          <Link2 className="w-3.5 h-3.5" />
          <span>{isAr ? 'رابط فيديو من الويب' : 'Web Video URL'}</span>
        </button>
      </div>

      {/* Error and Warning Messages */}
      {errorMessage && (
        <div id="video-upload-error" className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-semibold flex items-center gap-2">
          <span>❌</span>
          <p className="m-0">{errorMessage}</p>
        </div>
      )}

      {warningMessage && (
        <div id="video-upload-warning" className="mb-4 p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs font-semibold flex items-center gap-2">
          <span>⚠️</span>
          <p className="m-0 leading-relaxed">{warningMessage}</p>
        </div>
      )}

      <input
        type="file"
        accept="video/*,.mp4,.mov,.m4v,.webm"
        onChange={handleFileSelect}
        ref={fileInputRef}
        style={{ display: 'none' }}
        id="video-upload-input"
      />

      {videoUrl ? (
        <div className="space-y-3" id="video-preview-wrapper bg-surface-raised">
          <div className="w-full rounded-2xl overflow-hidden border border-line shadow-sm bg-black relative max-h-[220px] flex items-center justify-center">
            <video
              src={videoUrl}
              controls
              className="w-full max-h-[200px] object-contain"
              playsInline
              id="video-preview-player"
            />
          </div>

          {fileDetails && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-surface-sunken p-3.5 rounded-xl border border-line">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black text-fg truncate font-mono" title={fileDetails.name}>
                  {fileDetails.name}
                </p>
                <p className="text-[10px] text-fg-muted font-mono font-bold mt-0.5">
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
            /* Drop + click. `onDragOver` MUST preventDefault, or the browser
               leaves the page to open the dropped video and the half-filled
               listing form is lost. The label/htmlFor click path is untouched,
               so the mobile picker still works exactly as before. */
            <label 
              htmlFor="video-upload-input"
              className={`flex flex-col items-center justify-center w-full min-h-[140px] px-4 py-8 border-2 border-dashed transition-colors rounded-2xl cursor-pointer dynamic-touch-target select-none ${dragOver ? 'border-[#F05123] bg-accent-weak scale-[0.99]' : 'border-[#FF6B00] bg-accent-weak hover:bg-accent-weak'}`}
              id="video-tap-area"
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                // Same intake as the picker — one validation, two ways in.
                acceptVideoFile(filesFromTransfer(e.dataTransfer, isVideoFile)[0] ?? null);
              }}
            >
              <div className="flex flex-col items-center text-center space-y-2.5">
                <span className="text-4xl">📹</span>
                <div className="space-y-1">
                  <p className="text-sm font-black text-[#FF6B00] tracking-tight">
                    {isAr ? 'اضغط لرفع فيديو المنتج' : 'Click to upload product video'}
                  </p>
                  <p className="text-xs text-fg-muted font-bold">
                    {isAr ? 'يجب أن يكون الملف بصيغة مدعومة (MP4, MOV, WEBM) بحجم أقصى 100 ميجابايت' : 'Supported formats (MP4, MOV, WEBM) up to 100MB'}
                  </p>
                </div>
              </div>
            </label>
          ) : (
            <form onSubmit={handleUrlSubmit} className="space-y-3 p-4 border border-line rounded-2xl bg-surface-raised shadow-sm">
              <div className="space-y-1">
                <label className="text-[11px] font-black text-fg uppercase tracking-wide block">
                  {isAr ? 'أدخل رابط الفيديو المباشر من الويب' : 'Enter Direct Web Video URL'}
                </label>
                <input
                  type="url"
                  required
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  placeholder="https://example.com/my-video.mp4"
                  className="w-full h-10 px-3 bg-surface-sunken border border-line rounded-xl text-fg text-xs font-semibold placeholder-gray-400 focus:border-[#FF6B00] outline-none transition-all"
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
