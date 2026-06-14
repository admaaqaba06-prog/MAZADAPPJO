import React, { useState, useRef } from 'react';
import { Video, RefreshCw, UploadCloud, Film } from 'lucide-react';

interface VideoUploadFormProps {
  onVideoSelect?: (file: File | null, videoUrl: string | null) => void;
  language?: 'en' | 'ar';
}

export const VideoUploadForm: React.FC<VideoUploadFormProps> = ({ onVideoSelect, language = 'en' }) => {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
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
      if (videoUrl) {
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

  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
    
    setVideoFile(null);
    setVideoUrl(null);
    setFileDetails(null);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    if (onVideoSelect) {
      onVideoSelect(null, null);
    }
  };

  const triggerInputClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div id="video-upload-container" className="w-full">
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
                  Size: {fileDetails.size}
                </p>
              </div>
              <button
                type="button"
                onClick={handleReset}
                className="text-[11px] font-black text-orange-600 hover:text-orange-700 transition-colors uppercase tracking-wider shrink-0 cursor-pointer"
                id="change-video-btn"
              >
                {isAr ? 'تغيير الفيديو ↺' : 'Change Video ↺'}
              </button>
            </div>
          )}
        </div>
      ) : (
        <label 
          htmlFor="video-upload-input"
          className="flex flex-col items-center justify-center w-full min-h-[140px] px-4 py-6 border-2 border-dashed border-[#FF6B00] bg-[#FFF8F3] hover:bg-[#FFF4EB] transition-colors rounded-2xl cursor-pointer dynamic-touch-target select-none"
          id="video-tap-area"
        >
          <div className="flex flex-col items-center text-center space-y-2.5">
            <div className="w-11 h-11 rounded-full bg-[#FF6B00]/10 flex items-center justify-center text-[#FF6B00]">
              <Video className="w-6 h-6" />
            </div>
            <div className="space-y-0.5">
              <p className="text-xs font-black text-[#FF6B00] tracking-tight">
                {isAr ? 'اضغط لتصوير أو رفع فيديو' : 'Tap to record or upload video'}
              </p>
              <p className="text-[10px] text-gray-500 font-medium">
                {isAr ? 'Tap to record or upload video' : 'اضغط لتصوير أو رفع فيديو'}
              </p>
            </div>
            <p className="text-[9px] text-[#FF6B00]/70 font-mono uppercase tracking-widest font-bold">
              MP4, MOV OR ANY VIDEO FORMAT
            </p>
          </div>
        </label>
      )}
    </div>
  );
};

export default VideoUploadForm;
