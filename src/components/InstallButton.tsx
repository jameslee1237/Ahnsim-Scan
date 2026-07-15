'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

// beforeinstallprompt는 표준 DOM 타입에 없어 직접 좁힌다.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// 브라우저가 PWA 설치 가능 조건을 만족하면 beforeinstallprompt가 발생한다.
// 그 이벤트를 잡아 두었다가 앱 내 "홈 화면에 추가" 버튼으로 노출한다. iOS
// Safari는 이 이벤트를 발생시키지 않으므로 iOS에서는 버튼이 나타나지 않는다.
export const InstallButton = () => {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // 이미 설치되어 standalone으로 실행 중이면 버튼을 띄우지 않는다.
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault(); // 크롬 기본 미니 배너 억제
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setPromptEvent(null);

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!promptEvent) return null;

  const handleInstall = async () => {
    await promptEvent.prompt();
    await promptEvent.userChoice;
    setPromptEvent(null); // 프롬프트 이벤트는 한 번만 사용할 수 있다.
  };

  return (
    <Button type="button" variant="outline" onClick={handleInstall} className="mb-3 w-full">
      <Download className="size-4" aria-hidden="true" />
      홈 화면에 추가
    </Button>
  );
};
