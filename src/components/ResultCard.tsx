import { ShieldAlert, ShieldCheck, ShieldQuestion, TriangleAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { highlightEvidence } from '@/lib/highlightEvidence';
import type { AnalysisResult } from '@/lib/analysis/types';

interface IResultCardProps {
  result: AnalysisResult;
  originalText: string;
  onClear: () => void;
}

// 판정별 시각. header는 헤더 틴트 그라디언트, tile은 아이콘 타일 배경,
// score는 점수 텍스트 색, progress는 Base UI Progress의 인디케이터 색을
// data-slot 임의 변형으로 입힌다(생성된 progress.tsx를 직접 수정하지 않음).
const VERDICT_STYLE: Record<
  AnalysisResult['verdict'],
  {
    icon: LucideIcon;
    subtitle: string;
    header: string;
    tile: string;
    score: string;
    progress: string;
  }
> = {
  안전: {
    icon: ShieldCheck,
    subtitle: '사기 신호가 발견되지 않았어요',
    header: 'from-green-50 to-green-100/70',
    tile: 'bg-green-600',
    score: 'text-green-700',
    progress: '[&_[data-slot=progress-indicator]]:bg-green-600',
  },
  의심: {
    icon: ShieldQuestion,
    subtitle: '주의가 필요해요 — 함부로 응답하지 마세요',
    header: 'from-amber-50 to-amber-100/70',
    tile: 'bg-amber-500',
    score: 'text-amber-700',
    progress: '[&_[data-slot=progress-indicator]]:bg-amber-500',
  },
  위험: {
    icon: ShieldAlert,
    subtitle: '사기일 가능성이 매우 높아요',
    header: 'from-red-50 to-red-100/70',
    tile: 'bg-red-600',
    score: 'text-red-600',
    progress: '[&_[data-slot=progress-indicator]]:bg-red-600',
  },
};

export const ResultCard = ({ result, originalText, onClear }: IResultCardProps) => {
  const style = VERDICT_STYLE[result.verdict];
  const VerdictIcon = style.icon;
  // 이미지 모드에서는 API가 판독한 extractedText가 우선, 텍스트 모드에서는
  // 폼이 넘긴 원본(originalText)으로 대체.
  const displayText = result.extractedText || originalText;
  const evidences = result.redFlags.map((redFlag) => redFlag.evidence);
  const segments = displayText ? highlightEvidence(displayText, evidences) : [];
  const score = Math.round(result.riskScore);

  return (
    <Card className="mt-6 gap-0 overflow-hidden p-0 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
      {/* 판정 헤더 — 가장 중요한 출력을 크게. CardTitle은 <div>라 헤딩 트리에
          안 잡히므로 실제 <h2>를 써서 페이지 h1 아래 계층을 유지한다. */}
      <div className={`flex items-center gap-3 bg-gradient-to-br ${style.header} p-4`}>
        <div className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${style.tile} shadow-sm`}>
          <VerdictIcon className="size-6 text-white" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="text-2xl leading-none font-extrabold tracking-tight text-slate-900">
            {result.verdict}
          </h2>
          <p className="mt-1.5 text-xs text-slate-600">{style.subtitle}</p>
        </div>
        <div className="ml-auto text-right">
          <div className={`text-3xl leading-none font-extrabold ${style.score}`}>{score}</div>
          <div className="text-[11px] text-slate-600">/ 100</div>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <Progress value={result.riskScore} aria-label={`위험도 ${score}점`} className={style.progress} />

        {displayText && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">
              {result.extractedText ? '판독된 메시지' : '분석한 메시지'}
            </h3>
            <p className="rounded-lg border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
              {segments.map((segment, index) =>
                segment.highlighted ? (
                  <mark key={index} className="rounded bg-amber-200/70 px-0.5">
                    {segment.text}
                  </mark>
                ) : (
                  <span key={index}>{segment.text}</span>
                ),
              )}
            </p>
          </div>
        )}

        {result.redFlags.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">주요 위험 신호</h3>
            <ul className="space-y-1.5">
              {result.redFlags.map((redFlag, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden="true" />
                  <span className="min-w-0">{redFlag.flag}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-sm text-muted-foreground">{result.explanation}</p>

        {/* 권장 조치를 강조 콜아웃으로 승격 — 사용자가 가장 먼저 봐야 할 다음 행동. */}
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3.5">
          <p className="mb-1 text-xs font-bold tracking-wide text-blue-700">이렇게 하세요</p>
          <p className="text-sm leading-relaxed font-semibold text-blue-900">
            {result.recommendedAction}
          </p>
        </div>

        <div className="pt-1">
          <Button type="button" variant="ghost" size="sm" onClick={onClear} className="text-muted-foreground">
            결과 지우기
          </Button>
        </div>
      </div>
    </Card>
  );
};
