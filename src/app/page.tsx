'use client';

import { useEffect, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { HomeNotice } from '@/components/HomeNotice';
import { AnalyzeForm, type SharedContent } from '@/components/AnalyzeForm';
import { ResultCard } from '@/components/ResultCard';
import { dataUrlToFile, downscaleImage } from '@/lib/imageDownscale';
import type { AnalysisResult } from '@/lib/analysis/types';

// 공유 경로가 정규화한 중간 형태 — 이미지는 (Cache의 Blob이든 쿠키의 data
// URL이든) 항상 File[]로 통일해 기존 downscaleImage 파이프라인에 넘긴다.
type NormalizedShare = { type: 'sms'; text: string } | { type: 'image'; files: File[] };

const SHARE_CACHE_NAME = 'shared-content';
const SHARE_COOKIE_NAME = 'shared_content';
const MAX_SHARED_IMAGES = 5;

// 정상 경로: 서비스 워커가 Cache Storage에 남긴 메타/Blob을 읽는다.
const readSharedFromCache = async (): Promise<NormalizedShare | null> => {
  try {
    const cache = await caches.open(SHARE_CACHE_NAME);
    const metaResponse = await cache.match('/shared-meta');
    if (!metaResponse) return null;

    const meta = (await metaResponse.json()) as { type?: string; text?: string; count?: number };
    let result: NormalizedShare | null = null;

    if (meta.type === 'sms' && typeof meta.text === 'string') {
      result = { type: 'sms', text: meta.text };
    } else if (meta.type === 'image' && typeof meta.count === 'number') {
      const files: File[] = [];
      for (let i = 0; i < Math.min(meta.count, MAX_SHARED_IMAGES); i++) {
        const imageResponse = await cache.match(`/shared-image-${i}`);
        if (!imageResponse) continue;
        const blob = await imageResponse.blob();
        files.push(new File([blob], `shared-${i}`, { type: blob.type || 'image/jpeg' }));
      }
      if (files.length > 0) result = { type: 'image', files };
    }

    // 읽은 즉시 캐시를 비운다 — 새로고침 시 재사용되지 않도록.
    const keys = await cache.keys();
    await Promise.all(keys.map((key) => cache.delete(key)));
    return result;
  } catch {
    return null;
  }
};

// 폴백 경로: 서버가 실어 보낸 쿠키를 읽고 즉시 삭제한다.
const readSharedFromCookie = (): NormalizedShare | null => {
  const match = document.cookie.match(/(?:^|; )shared_content=([^;]*)/);
  if (!match) return null;
  document.cookie = `${SHARE_COOKIE_NAME}=; Max-Age=0; path=/`;
  try {
    const payload = JSON.parse(decodeURIComponent(match[1])) as {
      type?: string;
      text?: string;
      images?: string[];
    };
    if (payload.type === 'sms' && typeof payload.text === 'string') {
      return { type: 'sms', text: payload.text };
    }
    if (payload.type === 'image' && Array.isArray(payload.images)) {
      const files = payload.images
        .slice(0, MAX_SHARED_IMAGES)
        .map((dataUrl, i) => dataUrlToFile(dataUrl, `shared-${i}`));
      if (files.length > 0) return { type: 'image', files };
    }
    return null;
  } catch {
    return null;
  }
};

const HomePage = () => {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [displayText, setDisplayText] = useState('');
  const [sharedContent, setSharedContent] = useState<SharedContent | undefined>(undefined);
  const resultRef = useRef<HTMLDivElement>(null);

  // 결과 카드는 폼 아래에 새로 나타나는데, 폼이 길면 화면 밖으로 벗어날 수
  // 있다. 결과가 생기면 그쪽으로 스크롤하고, aria-live로 스크린 리더에도
  // 알린다.
  useEffect(() => {
    if (result) {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      resultRef.current?.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'start',
      });
    }
  }, [result]);

  // ?shared=1로 도착했으면 공유된 내용을 한 번 읽어 폼에 채운다. 정상 경로는
  // Cache Storage, 설치 직후 폴백 경로는 쿠키. 공유 이미지는 다운스케일이
  // 적용되지 않은 원본일 수 있어 downscaleImage를 거쳐 업로드 흐름과 동일하게
  // 처리한다. 실패는 조용히 무시하고 빈 폼을 보여준다.
  useEffect(() => {
    const consumeSharedContent = async () => {
      const url = new URL(window.location.href);
      if (url.searchParams.get('shared') !== '1') return;

      try {
        const shared = (await readSharedFromCache()) ?? readSharedFromCookie();
        if (shared) {
          if (shared.type === 'sms') {
            setSharedContent({ type: 'sms', messageBody: shared.text });
          } else {
            // 한 장이 디코딩에 실패해도 나머지는 살린다 — allSettled로 성공한
            // 것만 모은다(Promise.all이면 한 장 실패에 전부 버려진다).
            const settled = await Promise.allSettled(
              shared.files.map((file) => downscaleImage(file)),
            );
            const images = settled
              .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
              .map((r) => r.value);
            if (images.length > 0) setSharedContent({ type: 'image', images });
          }
        }
      } catch {
        // 공유 내용 처리 실패는 조용히 무시하고 빈 폼을 보여준다.
      } finally {
        // 성공/실패와 무관하게 ?shared=1을 제거해 새로고침 시 재실행되지 않게 한다.
        url.searchParams.delete('shared');
        window.history.replaceState({}, '', url.toString());
      }
    };

    void consumeSharedContent();
  }, []);

  const handleResult = (newResult: AnalysisResult, newDisplayText: string) => {
    setResult(newResult);
    setDisplayText(newDisplayText);
  };

  const handleClear = () => {
    setResult(null);
    setDisplayText('');
  };

  return (
    <main className="relative mx-auto flex min-h-screen max-w-xl flex-col px-4 py-8 sm:px-6 sm:py-12 lg:max-w-2xl lg:py-16">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-64 bg-gradient-to-b from-primary/10 to-transparent"
      />
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="flex items-center gap-2.5">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 shadow-md shadow-blue-600/30">
            <ShieldCheck className="size-6 text-white" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">안심스캔</h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          문자·이메일·스크린샷, 사기인지 바로 확인
        </p>
      </div>
      <HomeNotice />
      <AnalyzeForm onResult={handleResult} initialShared={sharedContent} />
      {result && (
        <div ref={resultRef} role="status" aria-live="polite">
          <ResultCard result={result} originalText={displayText} onClear={handleClear} />
        </div>
      )}
    </main>
  );
};

export default HomePage;
