'use client';

import { useState } from 'react';
import { ChevronDown, Smartphone } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { InstallButton } from '@/components/InstallButton';

// 새 shadcn 컴포넌트나 의존성을 추가하지 않는다 — 펼침/접힘은 순수 useState +
// 조건부 렌더링으로 구현한다. 시각적 완성도는 이후 서비스 전체 frontend-design
// 개편에서 함께 다듬는다.
export const InstallGuide = () => {
  const [expanded, setExpanded] = useState(false);

  return (
    <Alert role="note" className="mb-5 border-none bg-muted/60">
      <Smartphone className="size-4 text-muted-foreground" aria-hidden="true" />
      <AlertDescription>
        <InstallButton />
        <div className="flex items-center justify-between gap-2">
          <span>
            안드로이드에서 홈 화면에 추가하면 카카오톡·갤러리에서 바로 공유할 수 있어요.
            (iOS는 지원되지 않습니다)
          </span>
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
            className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary"
          >
            자세히 보기
            <ChevronDown
              className={`size-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>
        </div>
        {expanded && (
          <div className="mt-3 space-y-3 text-sm">
            <ol className="list-decimal space-y-1.5 pl-4">
              <li>위 &quot;홈 화면에 추가&quot; 버튼(또는 크롬 메뉴 ⋮ → &quot;홈 화면에 추가&quot;)으로 설치하세요.</li>
              <li>카카오톡·문자 메시지를 길게 눌러 공유를 선택하고, 목록에서 안심스캔을 고르세요.</li>
              <li>갤러리에서 스크린샷을 공유할 때도 안심스캔을 선택할 수 있어요.</li>
              <li>공유한 내용은 이 화면에 자동으로 채워지며, 인증 후 분석하기를 누르면 됩니다.</li>
            </ol>
            <p className="text-muted-foreground">
              무료로 운영되는 서비스라 하루 사용량에 제한이 있어요. 한도에 도달하면 &quot;오늘의 무료
              사용량을 모두 사용했습니다&quot;라는 안내가 나타날 수 있으며, 다음 날 다시 이용할 수
              있습니다.
            </p>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
};
