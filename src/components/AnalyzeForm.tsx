'use client';

import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import Script from 'next/script';
import { Loader2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { MAX_INPUT_LENGTH, type AnalysisResult } from '@/lib/analysis/types';

type MessageType = 'sms' | 'email';

interface IAnalyzeFormProps {
  onResult: (result: AnalysisResult) => void;
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
// 들어가므로, 렌더링 시점의 화면 너비를 보고 선택한다.
const NARROW_VIEWPORT_THRESHOLD = 400;

export const AnalyzeForm = ({ onResult }: IAnalyzeFormProps) => {
  const [messageType, setMessageType] = useState<MessageType>('sms');
  const [senderNumber, setSenderNumber] = useState('');
  const [senderAddress, setSenderAddress] = useState('');
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
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

    if (text.trim().length < 5) {
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
        : { type: 'email', senderAddress, subject, body: text, turnstileToken };

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
      onResult(data as AnalysisResult);
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
    setError('');
  };

  const remaining = MAX_INPUT_LENGTH - text.length;
  const counterClassName =
    remaining <= 0
      ? 'text-destructive'
      : remaining <= MAX_INPUT_LENGTH * 0.1
        ? 'text-amber-600 dark:text-amber-400'
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
              <TabsTrigger value="sms" className="flex-1">
                문자(SMS)
              </TabsTrigger>
              <TabsTrigger value="email" className="flex-1">
                이메일
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
          </Tabs>

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

          <div className="flex gap-2">
            <Button type="submit" disabled={loading} className="flex-1">
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
