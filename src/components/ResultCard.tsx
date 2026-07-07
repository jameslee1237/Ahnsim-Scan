import { ShieldAlert, ShieldCheck, ShieldQuestion, TriangleAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import type { AnalysisResult } from '@/lib/analysis/types';

interface IResultCardProps {
  result: AnalysisResult;
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

export const ResultCard = ({ result, onClear }: IResultCardProps) => {
  const { icon: VerdictIcon, badgeClassName, progressClassName } = VERDICT_STYLE[result.verdict];

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <VerdictIcon className="size-5" aria-hidden="true" />
          분석 결과
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Badge className={badgeClassName}>{result.verdict}</Badge>
          <span className="text-sm text-muted-foreground">
            위험도 {Math.round(result.riskScore)} / 100
          </span>
        </div>

        <Progress value={result.riskScore} aria-label="위험도" className={progressClassName} />

        {result.redFlags.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-medium">주요 위험 신호</h3>
            <ul className="space-y-1.5">
              {result.redFlags.map((flag, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden="true" />
                  {flag}
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
