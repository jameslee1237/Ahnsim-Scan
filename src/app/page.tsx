'use client';

import { useEffect, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { PrivacyNotice } from '@/components/PrivacyNotice';
import { AnalyzeForm } from '@/components/AnalyzeForm';
import { ResultCard } from '@/components/ResultCard';
import type { AnalysisResult } from '@/lib/analysis/types';

const HomePage = () => {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  // 결과 카드는 폼 아래에 새로 나타나는데, 폼이 길면 화면 밖으로 벗어날 수
  // 있다. 결과가 생기면 그쪽으로 스크롤하고, aria-live로 스크린 리더 사용자
  // 에게도 새 결과가 나타났음을 알린다.
  useEffect(() => {
    if (result) {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      resultRef.current?.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'start',
      });
    }
  }, [result]);

  return (
    <main className="relative mx-auto flex min-h-screen max-w-xl flex-col px-4 py-8 sm:px-6 sm:py-12 lg:max-w-2xl lg:py-16">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-64 bg-gradient-to-b from-primary/10 to-transparent"
      />
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="mb-3 flex size-16 items-center justify-center rounded-full bg-primary/10">
          <ShieldCheck className="size-8 text-primary" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          스미싱/피싱 문자·이메일 확인
        </h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          문자나 이메일 내용을 붙여넣으면 AI가 사기 여부를 분석해드려요.
        </p>
      </div>
      <PrivacyNotice />
      <AnalyzeForm onResult={setResult} />
      {result && (
        <div ref={resultRef} role="status" aria-live="polite">
          <ResultCard result={result} onClear={() => setResult(null)} />
        </div>
      )}
    </main>
  );
};

export default HomePage;
