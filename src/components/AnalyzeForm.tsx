'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import Script from 'next/script';
import { Loader2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ImageUploader } from '@/components/ImageUploader';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { MAX_INPUT_LENGTH, type AnalysisResult } from '@/lib/analysis/types';

type MessageType = 'sms' | 'email' | 'image';

// page.tsx가 이 타입을 import해 재사용한다 — 한 곳에서만 정의한다.
export type SharedContent =
  | { type: 'sms'; messageBody: string }
  | { type: 'image'; images: string[] };

interface IAnalyzeFormProps {
  onResult: (result: AnalysisResult, displayText: string) => void;
  initialShared?: SharedContent;
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          size?: 'flexible' | 'compact';
        },
      ) => string;
      reset: (widgetId: string) => void;
    };
  }
}

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

// Turnstile의 flexible/normal 크기는 최소 너비가 300px로 고정되어 있어,
// Card 안쪽 여백을 뺀 실제 사용 가능 폭이 그보다 좁은 작은 화면(예: 320px
// 뷰포트)에서는 위젯이 카드 밖으로 넘칠 수 있다. compact(150px)는 항상
// 들어가므로, 렌더링 시점의 화면 너비를 보고 선택한다. 이후 리사이즈나
// 화면 회전에는 반응하지 않는다 — 위젯 크기를 바꾸려면 reset 후
// 재렌더링이 필요한데, 한 세션에 한 번 채우는 폼에서 그 정도 대응까지는
// 과한 복잡도라 의도적으로 생략했다.
const NARROW_VIEWPORT_THRESHOLD = 400;

export const AnalyzeForm = ({ onResult, initialShared }: IAnalyzeFormProps) => {
  const [messageType, setMessageType] = useState<MessageType>('sms');
  const [senderNumber, setSenderNumber] = useState('');
  const [senderAddress, setSenderAddress] = useState('');
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]);

  // 홈페이지가 공유받은 내용을 읽어오면 initialShared가 undefined에서 값으로
  // 한 번 바뀐다 — 그 순간에만 해당 탭과 내용을 미리 채운다. 부모는 이 값을
  // 상태로 한 번만 세팅하므로 참조가 안정적이라 [initialShared] 의존으로 충분
  // 하다. (공유 텍스트는 발신번호 없이도 분석 가능하도록 스키마가 완화됨.)
  useEffect(() => {
    if (!initialShared) return;
    if (initialShared.type === 'sms') {
      // 부모가 넘겨준 공유 콘텐츠(props)를 폼 상태로 한 번 동기화하는 것이 이
      // effect의 목적 그 자체이며, initialShared가 바뀌는 경우는 마운트 시
      // 최초 1회뿐이다.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessageType('sms');
      setText(initialShared.messageBody);
    } else {
      setMessageType('image');
      setImages(initialShared.images);
    }
  }, [initialShared]);

  const [turnstileToken, setTurnstileToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [scriptLoadError, setScriptLoadError] = useState(false);
  const widgetRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef(false);
  const widgetIdRef = useRef<string | null>(null);

  const renderTurnstile = () => {
    if (renderedRef.current || !widgetRef.current || !window.turnstile) return;
    if (!TURNSTILE_SITE_KEY) {
      console.error('NEXT_PUBLIC_TURNSTILE_SITE_KEY가 설정되지 않았습니다.');
      return;
    }
    widgetIdRef.current = window.turnstile.render(widgetRef.current, {
      sitekey: TURNSTILE_SITE_KEY,
      callback: (token: string) => setTurnstileToken(token),
      size: window.innerWidth < NARROW_VIEWPORT_THRESHOLD ? 'compact' : 'flexible',
    });
    renderedRef.current = true;
  };

  // Turnstile tokens are single-use — Cloudflare invalidates a token the
  // moment our server verifies it, whether the analysis that follows
  // succeeds or fails. Without this reset, a second submission in the same
  // session would silently fail turnstile verification with a stale token.
  const resetTurnstile = () => {
    setTurnstileToken('');
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');

    if (messageType === 'image') {
      if (images.length === 0) {
        setError('분석할 스크린샷을 1장 이상 업로드해주세요.');
        return;
      }
    } else if (text.trim().length < 5) {
      setError('분석할 내용을 5자 이상 입력해주세요.');
      return;
    }
    if (!turnstileToken) {
      setError('로봇이 아님을 확인해주세요.');
      return;
    }

    const payload =
      messageType === 'sms'
        ? { type: 'sms', senderNumber, messageBody: text, turnstileToken }
        : messageType === 'email'
          ? { type: 'email', senderAddress, subject, body: text, turnstileToken }
          : { type: 'image', images, turnstileToken };

    setLoading(true);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? '오류가 발생했습니다.');
        return;
      }
      // 이미지 모드에서는 API 응답 자체의 extractedText가 원문 표시를
      // 담당하므로 빈 문자열을 넘긴다 — ResultCard가 이 우선순위로 표시할
      // 텍스트를 고른다.
      onResult(data as AnalysisResult, messageType === 'image' ? '' : text);
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setLoading(false);
      resetTurnstile();
    }
  };

  const handleClear = () => {
    setSenderNumber('');
    setSenderAddress('');
    setSubject('');
    setText('');
    setImages([]);
    setError('');
  };

  const remaining = MAX_INPUT_LENGTH - text.length;
  const counterClassName =
    remaining <= 0
      ? 'text-destructive'
      : remaining <= MAX_INPUT_LENGTH * 0.1
        ? 'text-amber-700'
        : 'text-muted-foreground';

  return (
    <Card>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js"
            onLoad={renderTurnstile}
            onError={() => setScriptLoadError(true)}
          />

          <Tabs value={messageType} onValueChange={(value) => setMessageType(value as MessageType)}>
            <TabsList className="w-full">
              <TabsTrigger value="sms" className="flex-1 data-active:text-primary data-active:font-semibold">
                문자(SMS)
              </TabsTrigger>
              <TabsTrigger value="email" className="flex-1 data-active:text-primary data-active:font-semibold">
                이메일
              </TabsTrigger>
              <TabsTrigger value="image" className="flex-1 data-active:text-primary data-active:font-semibold">
                스크린샷
              </TabsTrigger>
            </TabsList>

            <TabsContent
              value="sms"
              className="animate-in fade-in-0 slide-in-from-top-1 space-y-1.5 pt-4 duration-200"
            >
              <Label htmlFor="senderNumber">발신번호</Label>
              <Input
                id="senderNumber"
                type="text"
                placeholder="예: 010-1234-5678"
                value={senderNumber}
                onChange={(e) => setSenderNumber(e.target.value)}
              />
            </TabsContent>

            <TabsContent
              value="email"
              className="animate-in fade-in-0 slide-in-from-top-1 space-y-4 pt-4 duration-200"
            >
              <div className="space-y-1.5">
                <Label htmlFor="senderAddress">발신 주소</Label>
                <Input
                  id="senderAddress"
                  type="text"
                  placeholder="예: notice@example.com"
                  value={senderAddress}
                  onChange={(e) => setSenderAddress(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="subject">제목</Label>
                <Input
                  id="subject"
                  type="text"
                  placeholder="이메일 제목"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>
            </TabsContent>

            <TabsContent
              value="image"
              className="animate-in fade-in-0 slide-in-from-top-1 pt-4 duration-200"
            >
              <ImageUploader images={images} onImagesChange={setImages} />
            </TabsContent>
          </Tabs>

          {messageType !== 'image' && (
            <div className="space-y-1.5">
              <Label htmlFor="messageBody">문자/이메일 본문</Label>
              <Textarea
                id="messageBody"
                value={text}
                maxLength={MAX_INPUT_LENGTH}
                onChange={(e) => setText(e.target.value)}
                placeholder="받은 문자나 이메일 내용을 그대로 붙여넣으세요"
                className="h-32 resize-none"
              />
              <div className={`text-right text-xs transition-colors ${counterClassName}`}>
                {text.length} / {MAX_INPUT_LENGTH}
              </div>
            </div>
          )}

          <div ref={widgetRef} className="flex justify-center" />

          {scriptLoadError && (
            <p
              role="alert"
              className="flex items-center gap-1.5 text-sm text-destructive animate-in fade-in-0"
            >
              <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
              보안 위젯을 불러오지 못했습니다. 광고 차단 확장 프로그램을 확인해주세요.
            </p>
          )}

          {error && (
            <p
              role="alert"
              className="flex items-center gap-1.5 text-sm text-destructive animate-in fade-in-0"
            >
              <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}

          {/* 모바일에서 폼이 길어질 때(특히 스크린샷 여러 장 업로드 시) 제출
              버튼이 화면 밖으로 밀려나지 않도록 하단에 고정한다. 데스크톱
              (sm 이상)에서는 일반적인 폼 흐름으로 되돌아간다. */}
          <div className="sticky bottom-4 z-10 flex gap-2 rounded-lg bg-background/95 py-2 backdrop-blur sm:static sm:bg-transparent sm:py-0 sm:backdrop-blur-none">
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 bg-gradient-to-br from-blue-600 to-blue-700 shadow-sm shadow-blue-600/25 hover:from-blue-700 hover:to-blue-800"
            >
              {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {loading ? '분석 중...' : '분석하기'}
            </Button>
            <Button type="button" variant="outline" onClick={handleClear}>
              지우기
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
