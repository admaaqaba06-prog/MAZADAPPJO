import React, { useState, useRef, useEffect } from 'react';
import { storage, auth } from '../../services/firebase';
import { ref, uploadBytesResumable, getDownloadURL, UploadTask } from 'firebase/storage';
import { Film, UploadCloud, CheckCircle, AlertCircle, Trash2 } from 'lucide-react';

export interface UploadResult {
  downloadUrl: string;
  storagePath: string;
  fileName: string;
  fileSizeMb: number;
}

export interface VideoUploadProps {
  auctionId: string;
  onUploadComplete: (result: UploadResult) => void;
  onUploadError?: (error: string) => void;
}

type UploadState = 'idle' | 'selected' | 'uploading' | 'done' | 'error';

export const VideoUpload: React.FC<VideoUploadProps> = ({
  auctionId,
  onUploadComplete,
  onUploadError,
}) => {
  const [currentState, setCurrentState] = useState<UploadState>('idle');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localVideoUrl, setLocalVideoUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string>('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTaskRef = useRef<UploadTask | null>(null);

  // Revoke preview URL on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (localVideoUrl) {
        URL.revokeObjectURL(localVideoUrl);
      }
      if (uploadTaskRef.current) {
        uploadTaskRef.current.cancel();
      }
    };
  }, [localVideoUrl]);

  const handleContainerClick = () => {
    if (currentState === 'idle' || currentState === 'error') {
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type: mp4 or quicktime (.MOV)
    const isValidType = file.type === 'video/mp4' || file.type === 'video/quicktime';
    if (!isValidType) {
      const msg = 'الملف غير مدعوم (يسمح فقط بصيغة MP4 أو MOV)';
      setErrorMessage(msg);
      setCurrentState('error');
      if (onUploadError) onUploadError(msg);
      return;
    }

    // Validate size: Max 50MB
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      const msg = 'حجم الفيديو كبير جداً (الحد الأقصى المسموح به هو 50 ميجابايت)';
      setErrorMessage(msg);
      setCurrentState('error');
      if (onUploadError) onUploadError(msg);
      return;
    }

    // Clear previous draft URL
    if (localVideoUrl) {
      URL.revokeObjectURL(localVideoUrl);
    }

    const objectUrl = URL.createObjectURL(file);
    setSelectedFile(file);
    setLocalVideoUrl(objectUrl);
    setCurrentState('selected');
    setErrorMessage('');
  };

  const startUpload = () => {
    if (!selectedFile) return;

    // Strict Auth Check
    const currentUser = auth.currentUser;
    if (!currentUser) {
      const msg = 'عذراً، يجب عليك تسجيل الدخول أولاً للتمكن من رفع الفيديو';
      setErrorMessage(msg);
      setCurrentState('error');
      if (onUploadError) onUploadError(msg);
      return;
    }

    setCurrentState('uploading');
    setUploadProgress(0);

    // Extract file extension
    const parts = selectedFile.name.split('.');
    const ext = parts.length > 1 ? parts.pop()?.toLowerCase() : 'mp4';
    
    // Path structure: auctions/{auctionId}/{uid}/{Date.now()}.{extension}
    const storagePath = `auctions/${auctionId}/${currentUser.uid}/${Date.now()}.${ext}`;
    const storageRef = ref(storage, storagePath);
    
    const metadata = {
      contentType: selectedFile.type,
    };

    const uploadTask = uploadBytesResumable(storageRef, selectedFile, metadata);
    uploadTaskRef.current = uploadTask;

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setUploadProgress(Math.floor(progress));
      },
      (error) => {
        // Arabic error mappings
        let arabicMsg = 'فشل الرفع. تحقق من الاتصال وحاول مجدداً';
        if (error.code === 'storage/unauthorized') {
          arabicMsg = 'ليس لديك صلاحية رفع الفيديو';
        } else if (error.code === 'storage/canceled') {
          arabicMsg = 'تم إلغاء الرفع';
        } else if (error.code === 'storage/quota-exceeded') {
          arabicMsg = 'تجاوز حجم التخزين المسموح';
        }

        setErrorMessage(arabicMsg);
        setCurrentState('error');
        if (onUploadError) onUploadError(arabicMsg);
      },
      async () => {
        try {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          const fileSizeMb = parseFloat((selectedFile.size / (1024 * 1024)).toFixed(2));
          
          const result: UploadResult = {
            downloadUrl,
            storagePath,
            fileName: selectedFile.name,
            fileSizeMb,
          };

          setCurrentState('done');
          onUploadComplete(result);
          
          // Reset file input so same file can be re-selected if they try again later
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        } catch (downloadErr) {
          const msg = 'فشل جلب رابط الفيديو بعد الرفع. الرجاء المحاولة مجدداً';
          setErrorMessage(msg);
          setCurrentState('error');
          if (onUploadError) onUploadError(msg);
        }
      }
    );
  };

  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (uploadTaskRef.current) {
      uploadTaskRef.current.cancel();
      uploadTaskRef.current = null;
    }
    if (localVideoUrl) {
      URL.revokeObjectURL(localVideoUrl);
      setLocalVideoUrl(null);
    }
    setSelectedFile(null);
    setUploadProgress(0);
    setErrorMessage('');
    setCurrentState('idle');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Modern RTL Style Constants (CSS-in-JS per target prompt requirements)
  const containerStyle: React.CSSProperties = {
    direction: 'rtl',
    fontFamily: '"Cairo", "Inter", sans-serif',
    borderRadius: '16px',
    border: '1.5px solid #E5E7EB',
    backgroundColor: '#FAFAFA',
    padding: '20px',
    boxSizing: 'border-box',
    width: '100%',
    maxWidth: '480px',
    margin: '0 auto',
    boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
  };

  const dropzoneStyle: React.CSSProperties = {
    border: '2px dashed #D1D5DB',
    borderRadius: '12px',
    backgroundColor: '#FFFFFF',
    padding: '30px 20px',
    textAlign: 'center',
    cursor: currentState === 'idle' ? 'pointer' : 'default',
    transition: 'border-color 0.2s',
  };

  const progressContainerStyle: React.CSSProperties = {
    width: '100%',
    height: '10px',
    backgroundColor: '#E5E7EB',
    borderRadius: '9999px',
    overflow: 'hidden',
    marginTop: '15px',
    marginBottom: '10px',
  };

  const progressStyle = (prog: number): React.CSSProperties => ({
    width: `${prog}%`,
    height: '100%',
    backgroundColor: '#FF6B00',
    borderRadius: '9999px',
    transition: 'width 0.2s ease-out',
  });

  const buttonPrimaryStyle: React.CSSProperties = {
    backgroundColor: '#FF6B00',
    color: '#FFFFFF',
    fontWeight: 'bold',
    border: 'none',
    borderRadius: '10px',
    padding: '12px 20px',
    cursor: 'pointer',
    fontSize: '14px',
    transition: 'background-color 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    width: '100%',
    marginTop: '15px',
  };

  const buttonSecondaryStyle: React.CSSProperties = {
    backgroundColor: 'transparent',
    color: '#EF4444',
    fontWeight: 'bold',
    border: '1px solid #FCA5A5',
    borderRadius: '10px',
    padding: '10px 15px',
    cursor: 'pointer',
    fontSize: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    width: '100%',
    marginTop: '10px',
  };

  return (
    <div id="video-upload-gallery-container" style={containerStyle} dir="rtl">
      {/* Hidden input avoiding display issues and meeting constraints */}
      <input
        type="file"
        ref={fileInputRef}
        accept="video/mp4,video/quicktime"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {currentState === 'idle' && (
        <div 
          onClick={handleContainerClick} 
          style={dropzoneStyle}
          className="hover:border-[#FF6B00]"
        >
          <UploadCloud style={{ width: '48px', height: '48px', color: '#9CA3AF', margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '15px', fontWeight: 'bold', color: '#1F2937', marginBottom: '6px' }}>
            اختر فيديو من معرض الصور
          </h3>
          <p style={{ fontSize: '11px', color: '#6B7280', margin: 0 }}>
            يجب أن يكون الملف بصيغة MP4 أو MOV بحجم أقصى 50 ميجابايت
          </p>
        </div>
      )}

      {currentState === 'selected' && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', backgroundColor: '#000' }}>
            {localVideoUrl && (
              <video
                src={localVideoUrl}
                controls
                playsInline
                muted
                style={{ width: '100%', maxHeight: '240px', display: 'block', margin: '0 auto' }}
              />
            )}
          </div>
          <div style={{ marginTop: '12px', textAlign: 'right' }}>
            <p style={{ fontSize: '13px', fontWeight: 'bold', color: '#1F2937', margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              📁 اسم الملف: {selectedFile?.name}
            </p>
            <p style={{ fontSize: '11px', color: '#6B7280', margin: 0 }}>
              ⚖️ الحجم: {selectedFile ? (selectedFile.size / (1024 * 1024)).toFixed(2) : 0} ميجابايت
            </p>
          </div>
          
          <button onClick={startUpload} style={buttonPrimaryStyle}>
            <Film style={{ width: '16px', height: '16px' }} />
            بدأ رفع الفيديو للمزايدة الحية
          </button>
          
          <button onClick={handleReset} style={buttonSecondaryStyle}>
            <Trash2 style={{ width: '14px', height: '14px' }} />
            إلغاء وتغيير الملف
          </button>
        </div>
      )}

      {currentState === 'uploading' && (
        <div style={{ textAlign: 'center', padding: '10px 0' }}>
          <UploadCloud className="animate-bounce" style={{ width: '40px', height: '40px', color: '#FF6B00', margin: '0 auto 10px' }} />
          <h4 style={{ fontSize: '14px', fontWeight: 'bold', color: '#1F2937', margin: '0 0 5px' }}>
            جارٍ رفع الملف ومزامنته بالخادم...
          </h4>
          <p style={{ fontSize: '11px', color: '#EF4444', fontWeight: 'bold', margin: '0 0 10px' }}>
            ⚠️ لا تغلق أو تنعش هذه الصفحة لضمان اكتمال فحص الأوتار المرفقة
          </p>
          
          <div style={progressContainerStyle}>
            <div style={progressStyle(uploadProgress)} />
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 'bold', color: '#4B5563' }}>
            <span>نسبة التقدم: {uploadProgress}%</span>
            <span>{selectedFile ? (selectedFile.size / (1024 * 1024) * uploadProgress / 100).toFixed(2) : 0} م.ب</span>
          </div>
        </div>
      )}

      {currentState === 'done' && (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <CheckCircle style={{ width: '54px', height: '54px', color: '#10B981', margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#065F46', marginBottom: '6px' }}>
            تم رفع الفيديو وجاري تجهيزه بالمزاد! ✓
          </h3>
          <p style={{ fontSize: '12px', color: '#047857', margin: '0 0 15px' }}>
            شاهد المعاينة الآن في قائمة مزاداتك بانتظار توثيق الإدارة.
          </p>
          
          <button onClick={handleReset} style={{ ...buttonPrimaryStyle, backgroundColor: '#10B981' }}>
            رفع فيديو لوت آخر
          </button>
        </div>
      )}

      {currentState === 'error' && (
        <div style={{ textAlign: 'center', padding: '15px 0' }}>
          <AlertCircle style={{ width: '48px', height: '48px', color: '#EF4444', margin: '0 auto 10px' }} />
          <h4 style={{ fontSize: '14px', fontWeight: 'bold', color: '#991B1B', margin: '0 0 8px' }}>
            حدث خطأ أثناء فحص أو رفع الملف
          </h4>
          <p style={{ fontSize: '12px', color: '#B91C1C', backgroundColor: '#FEE2E2', padding: '10px', borderRadius: '8px', margin: '0 0 15px', border: '1px dashed #FCA3A3' }}>
            {errorMessage || 'فشل الرفع. تحقق من الاتصال وحاول مجدداً'}
          </p>
          
          <button onClick={handleReset} style={{ ...buttonPrimaryStyle, backgroundColor: '#EF4444' }}>
            المحاولة مجدداً
          </button>
        </div>
      )}
    </div>
  );
};
