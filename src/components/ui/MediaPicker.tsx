import React from 'react';
import { formatNumeral } from '../../utils/arabicNumerals';
import {
  MAX_GALLERY_PHOTOS,
  addGalleryPhotos,
  removeGalleryPhoto,
  isImageFile,
  type PickedPhoto,
} from '../../utils/mediaPickerState';

/**
 * Cover + gallery + video selection for the admin drop builder.
 *
 * Presentational: it owns no upload logic and touches no Firebase. The parent
 * holds the files and uploads them on submit.
 *
 * Deliberately no `capture="environment"` on the inputs: on iOS and most
 * Android browsers that attribute means "camera only" rather than "camera
 * first", and it hides the gallery/Files option outright. The team is
 * desktop-primary, so picking an existing photo is the common path — and the
 * seller sell-flow already has an open camera-only complaint from doing this.
 */
export interface MediaPickerProps {
  isAr: boolean;

  coverUrl: string;
  onCoverChange: (file: File | null) => void;

  gallery: PickedPhoto[];
  onGalleryChange: (next: PickedPhoto[]) => void;

  videoFile: File | null;
  onVideoChange: (file: File | null) => void;
}

const zone =
  'flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors';

export const MediaPicker: React.FC<MediaPickerProps> = ({
  isAr,
  coverUrl,
  onCoverChange,
  gallery,
  onGalleryChange,
  videoFile,
  onVideoChange,
}) => {
  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const incoming: PickedPhoto[] = Array.from(list)
      .filter(isImageFile)
      .map((file) => ({ file, url: URL.createObjectURL(file) }));
    onGalleryChange(addGalleryPhotos(gallery, incoming));
  };

  const removeAt = (idx: number) => {
    const victim = gallery[idx];
    if (victim) URL.revokeObjectURL(victim.url);
    onGalleryChange(removeGalleryPhoto(gallery, idx));
  };

  return (
    <div className="space-y-4">
      {/* COVER */}
      <div className="space-y-2">
        <span className="block text-xs font-extrabold text-gray-900">
          {isAr ? 'صورة الغلاف' : 'Cover image'}
        </span>
        {coverUrl ? (
          <div className="relative rounded-xl overflow-hidden bg-black max-h-[200px]">
            <img src={coverUrl} alt="" className="w-full h-full object-contain" />
            <button
              type="button"
              onClick={() => onCoverChange(null)}
              className="absolute top-2 end-2 bg-red-600 hover:bg-red-700 text-white rounded-lg px-2 py-1 text-[10px] font-bold cursor-pointer"
            >
              {isAr ? 'حذف' : 'Remove'}
            </button>
          </div>
        ) : (
          <label className={`${zone} p-6`}>
            <span className="text-2xl">🖼️</span>
            <span className="text-xs font-bold text-gray-600 mt-2">
              {isAr ? 'اضغط لرفع صورة الغلاف' : 'Tap to add a cover image'}
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onCoverChange(e.target.files?.[0] ?? null)}
            />
          </label>
        )}
      </div>

      {/* GALLERY */}
      <div className="space-y-2">
        <span className="block text-xs font-extrabold text-gray-900">
          {isAr
            ? `صور إضافية (حتى ${formatNumeral(MAX_GALLERY_PHOTOS, isAr)} — اختياري)`
            : `Extra photos (up to ${formatNumeral(MAX_GALLERY_PHOTOS, isAr)} — optional)`}
        </span>
        <div className="grid grid-cols-3 gap-2">
          {gallery.map((photo, idx) => (
            <div key={photo.url} className="relative rounded-xl overflow-hidden bg-black aspect-square">
              <img src={photo.url} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removeAt(idx)}
                className="absolute top-1 end-1 bg-red-600 hover:bg-red-700 text-white rounded-md px-1.5 py-0.5 text-[9px] font-bold cursor-pointer"
              >
                {isAr ? 'حذف' : 'Remove'}
              </button>
            </div>
          ))}
          {gallery.length < MAX_GALLERY_PHOTOS && (
            <label className={`${zone} aspect-square`}>
              <span className="text-xl">📸</span>
              <span className="text-[10px] font-bold text-gray-500 mt-1 text-center px-1">
                {isAr ? 'إضافة صورة' : 'Add photo'}
              </span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
          )}
        </div>
        <span className="block text-[11px] text-gray-400">
          {isAr
            ? 'يستطيع المزايدون التنقل بين هذه الصور داخل غرفة المزاد'
            : 'Bidders can swipe through these inside the live room'}
        </span>
      </div>

      {/* VIDEO */}
      <div className="space-y-2">
        <span className="block text-xs font-extrabold text-gray-900">
          {isAr ? 'فيديو المنتج (اختياري)' : 'Product video (optional)'}
        </span>
        {videoFile ? (
          <div className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-200 rounded-xl p-3">
            <span className="text-xs font-bold text-gray-700 truncate">
              🎥 {videoFile.name}
              <span className="block text-[10px] font-mono text-gray-400">
                {(videoFile.size / (1024 * 1024)).toFixed(1)} MB
              </span>
            </span>
            <button
              type="button"
              onClick={() => onVideoChange(null)}
              className="shrink-0 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 rounded-lg px-2.5 py-1 text-[10px] font-bold cursor-pointer"
            >
              {isAr ? 'حذف' : 'Remove'}
            </button>
          </div>
        ) : (
          <label className={`${zone} p-5`}>
            <span className="text-2xl">🎥</span>
            <span className="text-xs font-bold text-gray-600 mt-2">
              {isAr ? 'اضغط لرفع فيديو' : 'Tap to add a video'}
            </span>
            <input
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => onVideoChange(e.target.files?.[0] ?? null)}
            />
          </label>
        )}
      </div>
    </div>
  );
};

export default MediaPicker;
