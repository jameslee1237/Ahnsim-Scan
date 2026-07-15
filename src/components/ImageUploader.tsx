'use client';

import { useRef, useState } from 'react';
import type { ChangeEvent, ClipboardEvent, DragEvent, KeyboardEvent } from 'react';
import { ImagePlus, TriangleAlert, X } from 'lucide-react';
import { MAX_IMAGES } from '@/lib/analysis/types';
import { downscaleImage } from '@/lib/imageDownscale';

interface IImageUploaderProps {
  images: string[];
  onImagesChange: (images: string[]) => void;
}

const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const ImageUploader = ({ images, onImagesChange }: IImageUploaderProps) => {
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = async (files: File[]) => {
    setError('');
    const imageFiles = files.filter((file) => ACCEPTED_MIME_TYPES.includes(file.type));
    if (imageFiles.length === 0) {
      setError('이미지 파일(JPEG/PNG/WEBP)만 업로드할 수 있습니다.');
      return;
    }

    const availableSlots = MAX_IMAGES - images.length;
    if (availableSlots <= 0) {
      setError(`스크린샷은 최대 ${MAX_IMAGES}장까지 업로드할 수 있습니다.`);
      return;
    }

    setProcessing(true);
    try {
      const downscaled = await Promise.all(
        imageFiles.slice(0, availableSlots).map((file) => downscaleImage(file)),
      );
      onImagesChange([...images, ...downscaled]);
    } catch {
      setError('이미지를 처리하는 중 문제가 발생했습니다. 다른 이미지로 다시 시도해주세요.');
    } finally {
      setProcessing(false);
    }
  };

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    void addFiles(files);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingOver(false);
    void addFiles(Array.from(event.dataTransfer.files));
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    if (files.length > 0) {
      void addFiles(files);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      inputRef.current?.click();
    }
  };

  const removeImage = (index: number) => {
    onImagesChange(images.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={handleKeyDown}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingOver(true);
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={handleDrop}
        onPaste={handlePaste}
        className={`flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
          isDraggingOver ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-slate-50/60 hover:bg-slate-50'
        }`}
      >
        <ImagePlus className="size-6 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          탭하거나 끌어다 놓아 스크린샷을 추가하세요 (최대 {MAX_IMAGES}장)
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileInput}
        />
      </div>

      {processing && <p className="text-sm text-muted-foreground">이미지 처리 중...</p>}

      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive">
          <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {images.map((image, index) => (
            <div key={index} className="group relative aspect-square overflow-hidden rounded-lg border">
              {/* eslint-disable-next-line @next/next/no-img-element -- 사용자가
                  방금 업로드한 로컬 base64 데이터 URL 미리보기이므로
                  next/image의 원격 이미지 최적화 대상이 아니다. */}
              <img src={image} alt={`스크린샷 ${index + 1}`} className="size-full object-cover" />
              <button
                type="button"
                onClick={() => removeImage(index)}
                aria-label={`스크린샷 ${index + 1} 삭제`}
                className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
