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
      resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [result]);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col px-6 py-12">
      <div className="mb-8 flex flex-col items-center text-center">
        <ShieldCheck className="mb-3 size-10 text-primary" aria-hidden="true" />
        <h1 className="text-2xl font-bold tracking-tight">스미싱/피싱 문자·이메일 확인</h1>
        <p className="mt-2 text-sm text-muted-foreground">
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
