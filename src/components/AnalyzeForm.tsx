'use client';

import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import Script from 'next/script';
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
        options: { sitekey: string; callback: (token: string) => void },
      ) => string;
      reset: (widgetId: string) => void;
    };
  }
}

const inputClass =
  'w-full rounded border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none';

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

export const AnalyzeForm = ({ onResult }: IAnalyzeFormProps) => {
  const [messageType, setMessageType] = useState<MessageType>('sms');
  const [senderNumber, setSenderNumber] = useState('');
  const [senderAddress, setSenderAddress] = useState('');
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" onLoad={renderTurnstile} />

      <div className="flex gap-4">
        <label className="flex items-center gap-1">
          <input
            type="radio"
            checked={messageType === 'sms'}
            onChange={() => setMessageType('sms')}
          />
          문자(SMS)
        </label>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            checked={messageType === 'email'}
            onChange={() => setMessageType('email')}
          />
          이메일
        </label>
      </div>

      {messageType === 'sms' ? (
        <input
          type="text"
          placeholder="발신번호"
          value={senderNumber}
          onChange={(e) => setSenderNumber(e.target.value)}
          className={inputClass}
        />
      ) : (
        <div className="space-y-2">
          <input
            type="text"
            placeholder="발신 주소"
            value={senderAddress}
            onChange={(e) => setSenderAddress(e.target.value)}
            className={inputClass}
          />
          <input
            type="text"
            placeholder="제목"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className={inputClass}
          />
        </div>
      )}

      <div>
        <textarea
          value={text}
          maxLength={MAX_INPUT_LENGTH}
          onChange={(e) => setText(e.target.value)}
          placeholder="문자/이메일 본문을 붙여넣으세요"
          className={`${inputClass} h-32 resize-none`}
        />
        <div className="text-right text-sm text-gray-500">
          {text.length} / {MAX_INPUT_LENGTH}
        </div>
      </div>

      <div ref={widgetRef} />

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? '분석 중...' : '분석하기'}
        </button>
        <button
          type="button"
          onClick={handleClear}
          className="rounded border border-gray-300 px-4 py-2"
        >
          지우기
        </button>
      </div>
    </form>
  );
};
