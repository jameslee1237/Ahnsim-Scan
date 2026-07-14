import { describe, expect, it, vi, beforeEach } from 'vitest';

// vi.mock factories are hoisted above this file's own top-level statements.
// resultCache.ts constructs its Redis client at module top level and
// validates UPSTASH_REDIS_REST_URL/TOKEN at that same load time (same
// pattern as quotaGuard.ts), so both the mock fns and the env vars must be
// set inside vi.hoisted().
const { getMock, setMock } = vi.hoisted(() => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
  return { getMock: vi.fn(), setMock: vi.fn() };
});

// `function`, not an arrow function — arrow functions are never constructible
// in JS, and resultCache.ts invokes this with `new Redis(...)`.
vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(function () {
    return { get: getMock, set: setMock };
  }),
}));

import { getCachedResult, isCacheableInput, setCachedResult } from './resultCache';

const validResult = {
  verdict: '위험' as const,
  riskScore: 90,
  redFlags: [{ flag: '긴급성 조성', evidence: '즉시 확인' }],
  explanation: '설명',
  recommendedAction: '조치',
  extractedText: '',
};

const smsInput = {
  type: 'sms' as const,
  senderNumber: '010-0000-0000',
  messageBody: '테스트 메시지입니다',
};

const emailInput = {
  type: 'email' as const,
  senderAddress: 'bank@example.com',
  subject: '제목',
  body: '테스트 본문입니다',
};

const imageInput = {
  type: 'image' as const,
  images: ['data:image/jpeg;base64,AAAA'],
};

describe('isCacheableInput', () => {
  it('returns true for sms and email', () => {
    expect(isCacheableInput(smsInput)).toBe(true);
    expect(isCacheableInput(emailInput)).toBe(true);
  });

  it('returns false for image', () => {
    expect(isCacheableInput(imageInput)).toBe(false);
  });
});

describe('getCachedResult', () => {
  beforeEach(() => {
    getMock.mockReset();
    setMock.mockReset();
  });

  it('returns the cached result on a hit', async () => {
    getMock.mockResolvedValue(validResult);
    const result = await getCachedResult(smsInput);
    expect(result).toEqual(validResult);
  });

  it('returns null on a miss', async () => {
    getMock.mockResolvedValue(null);
    const result = await getCachedResult(smsInput);
    expect(result).toBeNull();
  });

  it('returns null (fail open) when the redis lookup throws', async () => {
    getMock.mockRejectedValue(new Error('network error'));
    const result = await getCachedResult(smsInput);
    expect(result).toBeNull();
  });

  it('returns null when the cached value fails schema validation', async () => {
    getMock.mockResolvedValue({ verdict: '알수없음', riskScore: 5 });
    const result = await getCachedResult(smsInput);
    expect(result).toBeNull();
  });

  it('uses a different cache key for the same body with a different sender', async () => {
    getMock.mockResolvedValue(null);
    await getCachedResult(smsInput);
    await getCachedResult({ ...smsInput, senderNumber: '010-9999-9999' });
    const [firstKey, secondKey] = getMock.mock.calls.map((call) => call[0]);
    expect(firstKey).not.toBe(secondKey);
  });

  it('uses the same cache key for identical sms input called twice', async () => {
    getMock.mockResolvedValue(null);
    await getCachedResult(smsInput);
    await getCachedResult({ ...smsInput });
    const [firstKey, secondKey] = getMock.mock.calls.map((call) => call[0]);
    expect(firstKey).toBe(secondKey);
  });
});

describe('setCachedResult', () => {
  beforeEach(() => {
    getMock.mockReset();
    setMock.mockReset();
  });

  it('stores the result with a 24-hour TTL', async () => {
    setMock.mockResolvedValue('OK');
    await setCachedResult(smsInput, validResult);
    expect(setMock).toHaveBeenCalledWith(expect.any(String), validResult, { ex: 60 * 60 * 24 });
  });

  it('does not throw when the redis write fails', async () => {
    setMock.mockRejectedValue(new Error('network error'));
    await expect(setCachedResult(smsInput, validResult)).resolves.toBeUndefined();
  });
});
