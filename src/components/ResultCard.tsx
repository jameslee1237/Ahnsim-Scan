import { ShieldAlert, ShieldCheck, ShieldQuestion, TriangleAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { highlightEvidence } from '@/lib/highlightEvidence';
import type { AnalysisResult } from '@/lib/analysis/types';

interface IResultCardProps {
  result: AnalysisResult;
  originalText: string;
  onClear: () => void;
}

// Base UI의 Progress는 인디케이터 색상을 프롭으로 노출하지 않으므로, 생성된
// progress.tsx를 직접 수정하는 대신 data-slot 어트리뷰트를 겨냥한 Tailwind
// 임의 변형(arbitrary variant)으로 색상을 입힌다 — `shadcn add`로 재생성해도
// 이 커스터마이징은 사라지지 않는다.
const VERDICT_STYLE: Record<
  AnalysisResult['verdict'],
  { icon: LucideIcon; badgeClassName: string; progressClassName: string }
> = {
  안전: {
    icon: ShieldCheck,
    badgeClassName: 'border-transparent bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
    progressClassName: '[&_[data-slot=progress-indicator]]:bg-green-600',
  },
  의심: {
    icon: ShieldQuestion,
    badgeClassName: 'border-transparent bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
    progressClassName: '[&_[data-slot=progress-indicator]]:bg-amber-500',
  },
  위험: {
    icon: ShieldAlert,
    badgeClassName: 'border-transparent bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
    progressClassName: '[&_[data-slot=progress-indicator]]:bg-red-600',
  },
};

export const ResultCard = ({ result, originalText, onClear }: IResultCardProps) => {
  const { icon: VerdictIcon, badgeClassName, progressClassName } = VERDICT_STYLE[result.verdict];
  // 이미지 모드에서는 API가 판독한 extractedText가 우선이고, 텍스트 모드
  // 에서는 항상 빈 문자열이므로 폼이 넘긴 원본 입력(originalText)으로
  // 대체한다.
  const displayText = result.extractedText || originalText;
  const evidences = result.redFlags.map((redFlag) => redFlag.evidence);
  const segments = displayText ? highlightEvidence(displayText, evidences) : [];

  return (
    <Card className="mt-6 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
      <CardHeader>
        {/* CardTitle은 <div>로 렌더링되어 헤딩 트리에 잡히지 않으므로(shadcn
            공용 컴포넌트라 여기서만 바꾸지 않는다), 실제 <h2>를 직접 써서
            페이지의 h1 아래 헤딩 계층을 올바르게 유지한다. */}
        <h2 className="flex items-center gap-2 text-lg leading-snug font-medium">
          <VerdictIcon className="size-5" aria-hidden="true" />
          분석 결과
        </h2>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Badge className={badgeClassName}>{result.verdict}</Badge>
          <span className="text-sm text-muted-foreground">
            위험도 {Math.round(result.riskScore)} / 100
          </span>
        </div>

        <Progress value={result.riskScore} aria-label="위험도" className={progressClassName} />

        {displayText && (
          <div>
            <h3 className="mb-2 text-sm font-medium">
              {result.extractedText ? '판독된 메시지' : '분석한 메시지'}
            </h3>
            <p className="rounded-lg border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
              {segments.map((segment, index) =>
                segment.highlighted ? (
                  <mark key={index} className="rounded bg-amber-200/70 px-0.5 dark:bg-amber-500/30">
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
            <h3 className="mb-2 text-sm font-medium">주요 위험 신호</h3>
            <ul className="space-y-1.5">
              {result.redFlags.map((redFlag, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden="true" />
                  {/* flex 아이템은 기본적으로 min-width: auto라 내용 너비만큼
                      줄어들기를 거부할 수 있다. min-w-0으로 좁은 화면에서도
                      줄바꿈되도록 강제한다(Card에 overflow-hidden이 있어,
                      그러지 않으면 긴 텍스트가 잘릴 수 있다). */}
                  <span className="min-w-0">{redFlag.flag}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Separator />

        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{result.explanation}</p>
          <p className="text-sm font-medium">{result.recommendedAction}</p>
        </div>
      </CardContent>
      <CardFooter>
        <Button type="button" variant="outline" onClick={onClear}>
          결과 지우기
        </Button>
      </CardFooter>
    </Card>
  );
};
