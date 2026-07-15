'use client';

import { useState } from 'react';
import { ChevronDown, ShieldCheck } from 'lucide-react';
import { InstallButton } from '@/components/InstallButton';

// PrivacyNotice + InstallGuide를 하나로 합친 슬림 안내. 기본은 개인정보 한 줄 +
// "자세히" 토글이고, 펼치면 설치·사용 방법·iOS 미지원·무료 사용량 한도를 모두
// 담는다(기존 정보 보존). 시각만 정리했고 새 의존성/컴포넌트는 없다.
export const HomeNotice = () => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-5">
      <InstallButton />

      <div className="flex items-center justify-between gap-2 rounded-xl bg-blue-50/70 px-3.5 py-2.5">
        <span className="flex items-center gap-1.5 text-xs text-slate-600">
          <ShieldCheck className="size-3.5 shrink-0 text-blue-600" aria-hidden="true" />
          입력한 내용은 저장하지 않아요
        </span>
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          className="flex shrink-0 items-center gap-1 text-xs font-medium text-blue-700"
        >
          자세히
          <ChevronDown
            className={`size-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      </div>

      {expanded && (
        <div className="mt-2 space-y-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-600">
          <p>
            민감한 개인정보(계좌번호, 주민등록번호 등)는 가급적 제외하고 입력하세요. 스크린샷은
            개인정보가 보이는 부분을 잘라내고 올려주세요. 입력한 내용은 분석을 위해 Google Gemini
            또는 Groq API(무료 티어)로 전송되며, 이 서비스는 어떤 내용도 저장하지 않습니다.
          </p>
          <div>
            <p className="mb-1 font-semibold text-slate-700">홈 화면에 추가해서 쓰기 (안드로이드)</p>
            <ol className="list-decimal space-y-1 pl-4">
              <li>위 &quot;홈 화면에 추가&quot; 버튼(또는 크롬 메뉴 ⋮ → &quot;홈 화면에 추가&quot;)으로 설치하세요.</li>
              <li>카카오톡·문자 메시지를 길게 눌러 공유 → 목록에서 안심스캔을 선택하세요.</li>
              <li>갤러리에서 스크린샷을 공유할 때도 안심스캔을 고를 수 있어요.</li>
              <li>공유한 내용은 이 화면에 자동으로 채워지며, 인증 후 분석하기를 누르면 됩니다.</li>
            </ol>
            <p className="mt-1 text-xs text-slate-500">iOS는 공유 대상 등록을 지원하지 않아요 — 복사·붙여넣기로 이용해주세요.</p>
          </div>
          <p className="text-xs text-slate-500">
            무료로 운영되는 서비스라 하루 사용량에 제한이 있어요. 한도에 도달하면 &quot;오늘의 무료
            사용량을 모두 사용했습니다&quot; 안내가 나타날 수 있으며, 다음 날 다시 이용할 수 있습니다.
          </p>
        </div>
      )}
    </div>
  );
};
