'use client';

import { useEffect } from 'react';

// 서비스 워커는 PWA 설치 요건 충족과 공유 대상 요청 가로채기만 담당한다 —
// 오프라인 캐싱은 하지 않는다. 등록 실패(구형 브라우저, 프라이빗 모드 등)는
// 앱의 핵심 기능(수동 입력/업로드)에 영향이 없으므로 조용히 무시한다.
// updateViaCache: 'none'은 sw.js 자체가 HTTP 캐시에서 서빙되어 업데이트가
// 지연되는 것을 막는다.
export const ServiceWorkerRegistration = () => {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {});
  }, []);

  return null;
};
