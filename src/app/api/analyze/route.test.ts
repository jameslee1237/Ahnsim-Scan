import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/security/turnstile', () => ({
  verifyTurnstileToken: vi.fn(),
}));
vi.mock('@/lib/security/rateLimit', () => ({
  checkIpRateLimit: vi.fn(),
}));
vi.mock('@/lib/security/quotaGuard', () => ({
  checkGlobalQuota: vi.fn(),
}));
vi.mock('@/lib/analysis/provider', () => ({
  analyzeMessage: vi.fn(),
}));

import { POST } from './route';
import { verifyTurnstileToken } from '@/lib/security/turnstile';
import { checkIpRateLimit } from '@/lib/security/rateLimit';
import { checkGlobalQuota } from '@/lib/security/quotaGuard';
import { analyzeMessage } from '@/lib/analysis/provider';

const makeRequest = (body: unknown) => {
  return new NextRequest('http://localhost/api/analyze', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
  });
};

const validSmsPayload = {
  type: 'sms',
  senderNumber: '010-0000-0000',
  messageBody: '테스트 메시지입니다',
  turnstileToken: 'ok',
};

const validImagePayload = {
  type: 'image',
  images: ['data:image/jpeg;base64,AAAA'],
  turnstileToken: 'ok',
};

describe('POST /api/analyze', () => {
  beforeEach(() => {
    // 이전 테스트의 호출 기록이 남아있으면 "호출되지 않아야 한다" 류의 단언이
    // 오염되므로, 기본값을 다시 세팅하기 전에 먼저 초기화한다.
    vi.clearAllMocks();
    vi.mocked(verifyTurnstileToken).mockResolvedValue(true);
    vi.mocked(checkIpRateLimit).mockResolvedValue({ allowed: true, remaining: 9, reset: 0 });
    vi.mocked(checkGlobalQuota).mockResolvedValue({ allowed: true });
  });

  it('returns 403 when turnstile verification fails', async () => {
    vi.mocked(verifyTurnstileToken).mockResolvedValue(false);
    const res = await POST(makeRequest(validSmsPayload));
    expect(res.status).toBe(403);
  });

  it('returns 429 when the ip rate limit is exceeded', async () => {
    vi.mocked(checkIpRateLimit).mockResolvedValue({ allowed: false, remaining: 0, reset: 0 });
    const res = await POST(makeRequest(validSmsPayload));
    expect(res.status).toBe(429);
  });

  it('returns 429 with a daily-specific message when the global daily quota is exceeded', async () => {
    vi.mocked(checkGlobalQuota).mockResolvedValue({ allowed: false, reason: 'daily' });
    const res = await POST(makeRequest(validSmsPayload));
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error).toContain('오늘');
  });

  it('returns 400 for an invalid input shape without spending turnstile/rate-limit/quota checks', async () => {
    // 입력 스키마 검증이 봇 확인/rate limit/quota 체크보다 먼저 실행되어야 한다.
    // 순서가 바뀌면 형식이 잘못된 요청도 이 세 체크를 전부 소모하게 된다.
    const res = await POST(makeRequest({ type: 'sms', turnstileToken: 'ok' }));
    expect(res.status).toBe(400);
    expect(verifyTurnstileToken).not.toHaveBeenCalled();
    expect(checkIpRateLimit).not.toHaveBeenCalled();
    expect(checkGlobalQuota).not.toHaveBeenCalled();
  });

  it('returns 400 for a malformed (non-JSON) request body', async () => {
    const req = new NextRequest('http://localhost/api/analyze', {
      method: 'POST',
      body: 'not valid json{{{',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 for a JSON body of null instead of an object', async () => {
    // `null` parses successfully (it's valid JSON), unlike the malformed-body
    // case above, but isn't an object - this exercises the separate guard
    // for a body that parses fine but isn't destructurable.
    const res = await POST(makeRequest(null));
    expect(res.status).toBe(400);
  });

  it('returns 403 without calling verifyTurnstileToken when turnstileToken is missing', async () => {
    const { type, senderNumber, messageBody } = validSmsPayload;
    const res = await POST(makeRequest({ type, senderNumber, messageBody }));
    expect(res.status).toBe(403);
    expect(verifyTurnstileToken).not.toHaveBeenCalled();
  });

  it('returns the analysis result on success', async () => {
    vi.mocked(analyzeMessage).mockResolvedValue({
      verdict: '위험',
      riskScore: 88,
      redFlags: [{ flag: '긴급성 조성', evidence: '즉시 확인' }],
      explanation: '설명',
      recommendedAction: '조치',
      extractedText: '',
    });
    const res = await POST(makeRequest(validSmsPayload));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.verdict).toBe('위험');
  });

  it('returns 500 without leaking error details when analyzeMessage throws', async () => {
    vi.mocked(analyzeMessage).mockRejectedValue(
      new Error('gemini exploded with internal prompt details'),
    );
    const res = await POST(makeRequest(validSmsPayload));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).not.toContain('prompt details');
  });

  it('returns 503 without leaking error details when verifyTurnstileToken throws', async () => {
    // TURNSTILE_SECRET_KEY 누락 시 verifyTurnstileToken이 던지는 경우로,
    // 사용자를 봇으로 오인하는 403 대신 서버 설정 오류로 처리되어야 한다.
    vi.mocked(verifyTurnstileToken).mockRejectedValue(
      new Error('TURNSTILE_SECRET_KEY is not set'),
    );
    const res = await POST(makeRequest(validSmsPayload));
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).not.toContain('TURNSTILE_SECRET_KEY');
  });

  it('returns 503 without leaking error details when checkGlobalQuota throws', async () => {
    vi.mocked(checkGlobalQuota).mockRejectedValue(
      new Error('upstash connection timed out at 10.0.0.5'),
    );
    const res = await POST(makeRequest(validSmsPayload));
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).not.toContain('10.0.0.5');
  });

  it('returns 500 instead of forwarding a malformed analyzeMessage result', async () => {
    // @ts-expect-error intentionally malformed to exercise the route's own
    // AnalysisResultSchema re-validation, independent of geminiProvider.ts's
    // own validation.
    vi.mocked(analyzeMessage).mockResolvedValue({ verdict: '알수없음', riskScore: 5 });
    const res = await POST(makeRequest(validSmsPayload));
    expect(res.status).toBe(500);
  });

  it('returns 422 when image input analysis comes back with empty extractedText', async () => {
    vi.mocked(analyzeMessage).mockResolvedValue({
      verdict: '안전',
      riskScore: 5,
      redFlags: [],
      explanation: '설명',
      recommendedAction: '조치',
      extractedText: '',
    });
    const res = await POST(makeRequest(validImagePayload));
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toContain('읽을 수 없습니다');
  });

  it('does not apply the empty-extractedText check to text input', async () => {
    vi.mocked(analyzeMessage).mockResolvedValue({
      verdict: '안전',
      riskScore: 5,
      redFlags: [],
      explanation: '설명',
      recommendedAction: '조치',
      extractedText: '',
    });
    const res = await POST(makeRequest(validSmsPayload));
    expect(res.status).toBe(200);
  });

  it('returns the result normally for image input when extractedText is non-empty', async () => {
    vi.mocked(analyzeMessage).mockResolvedValue({
      verdict: '위험',
      riskScore: 90,
      redFlags: [{ flag: '긴급성 조성', evidence: '즉시 확인' }],
      explanation: '설명',
      recommendedAction: '조치',
      extractedText: '발신: 010-0000-0000\n택배 도착',
    });
    const res = await POST(makeRequest(validImagePayload));
    expect(res.status).toBe(200);
  });
});
