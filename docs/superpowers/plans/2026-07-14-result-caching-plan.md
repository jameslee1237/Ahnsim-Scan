# 안심스캔 — 결과 캐싱(콘텐츠 해시 기반) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Skip the LLM call entirely for a repeat SMS/email submission that exactly matches a previous one within 24 hours, returning the cached verdict instead — cutting real quota usage for viral, copy-pasted scam templates without touching payment/billing.

**Architecture:** A new `src/lib/analysis/resultCache.ts` module (Redis-backed, same client-construction pattern as `quotaGuard.ts`/`rateLimit.ts`) exposes `isCacheableInput`, `getCachedResult`, and `setCachedResult`. `route.ts` checks the cache right after the IP rate-limit check and before the global quota guard — a hit skips both the quota guard and `analyzeMessage()` entirely and returns immediately; a miss proceeds exactly as today, then writes the fresh result to the cache before responding. Only `sms`/`email` inputs are cacheable; `image` is never checked or written.

**Tech Stack:** Same as existing (`@upstash/redis`, Zod, Vitest) — no new dependencies. Cache key: SHA-256 (Node's built-in `crypto`) of a type-specific canonical string, not a generic `JSON.stringify`.

**Reference spec:** `docs/superpowers/specs/2026-07-14-result-caching-design.md`

**Branch:** Cut from `develop` per `AGENTS.md`.

---

## Task 1: `resultCache.ts` — cache module

**Files:**
- Create: `src/lib/analysis/resultCache.ts`
- Test: `src/lib/analysis/resultCache.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/analysis/resultCache.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/analysis/resultCache.test.ts`
Expected: FAIL — `Cannot find module './resultCache'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/analysis/resultCache.ts`:

```ts
import 'server-only';
import { createHash } from 'crypto';
import { Redis } from '@upstash/redis';
import { AnalysisResultSchema, type AnalysisInput, type AnalysisResult } from './types';

const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!upstashUrl || !upstashToken) {
  throw new Error('UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN is not set');
}

const redis = new Redis({
  url: upstashUrl,
  token: upstashToken,
});

// 동일한 스미싱 문자가 다수의 사용자에게 토씨 하나 다르지 않게 퍼지는 경우가
// 많아, 첫 요청 이후로는 LLM을 다시 호출하지 않고 캐시된 결과를 재사용한다.
// 이미지 입력은 캐싱하지 않는다 — 서로 다른 사용자의 스크린샷이 바이트
// 단위로 일치할 가능성은 사실상 없어 캐시 효과가 없다.
const CACHE_TTL_SECONDS = 60 * 60 * 24; // 24시간

type CacheableInput = Extract<AnalysisInput, { type: 'sms' | 'email' }>;

export const isCacheableInput = (input: AnalysisInput): input is CacheableInput =>
  input.type === 'sms' || input.type === 'email';

// 발신번호/발신 주소를 해시에 포함한다 — 시스템 프롬프트가 발신 정보 자체를
// 분석 근거(스푸핑 여부 등)로 사용하므로, 본문이 같아도 발신 정보가 다르면
// 다른 판정이 나올 수 있다. 캐시 히트율보다 정확성을 우선한다. 객체 키
// 순서에 의존하는 JSON.stringify 대신, 타입별로 필드 순서를 명시적으로
// 고정한 문자열을 해시한다.
const buildCacheKey = (input: CacheableInput): string => {
  const canonical =
    input.type === 'sms'
      ? `sms|${input.senderNumber}|${input.messageBody}`
      : `email|${input.senderAddress}|${input.subject}|${input.body}`;
  const hash = createHash('sha256').update(canonical).digest('hex');
  return `cache:analysis:${hash}`;
};

export const getCachedResult = async (input: CacheableInput): Promise<AnalysisResult | null> => {
  try {
    const cached = await redis.get(buildCacheKey(input));
    if (!cached) return null;
    const parsed = AnalysisResultSchema.safeParse(cached);
    return parsed.success ? parsed.data : null;
  } catch {
    // Redis 조회 실패는 캐시 미스로 간주한다(fail open) — 캐시는 최적화일
    // 뿐이므로 실패해도 요청 자체를 막지 않는다.
    return null;
  }
};

export const setCachedResult = async (
  input: CacheableInput,
  result: AnalysisResult,
): Promise<void> => {
  try {
    await redis.set(buildCacheKey(input), result, { ex: CACHE_TTL_SECONDS });
  } catch {
    // 저장 실패는 조용히 무시한다 — 사용자에게는 이미 정상 응답을 반환한
    // 뒤의 부가 작업이므로, 다음 동일 요청에서 다시 캐시를 시도하게 된다.
  }
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/analysis/resultCache.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis/resultCache.ts src/lib/analysis/resultCache.test.ts
git commit -m "feat: add result cache keyed on sms/email content hash"
```

---

## Task 2: Wire the cache into the route handler

**Files:**
- Modify: `src/app/api/analyze/route.ts`
- Modify: `src/app/api/analyze/route.test.ts`

The cache check goes **between** the IP rate-limit check and the global quota guard, inside the existing first `try` block (it never throws on its own — `getCachedResult` already fails open — so it doesn't disturb that block's existing 503 catch-all). A hit returns immediately, before the quota guard ever runs. A miss falls through unchanged. On a successful fresh analysis, the result is cached (for `sms`/`email` only) right before the response is returned.

- [ ] **Step 1: Write the failing tests**

In `src/app/api/analyze/route.test.ts`, add this mock near the other `vi.mock` calls at the top of the file:

```ts
vi.mock('@/lib/analysis/resultCache', () => ({
  isCacheableInput: vi.fn(),
  getCachedResult: vi.fn(),
  setCachedResult: vi.fn(),
}));
```

Add the corresponding import alongside the other imports:

```ts
import { getCachedResult, isCacheableInput, setCachedResult } from '@/lib/analysis/resultCache';
```

Update the `beforeEach` block to add default mock behavior for the new module — replace:

```ts
  beforeEach(() => {
    // 이전 테스트의 호출 기록이 남아있으면 "호출되지 않아야 한다" 류의 단언이
    // 오염되므로, 기본값을 다시 세팅하기 전에 먼저 초기화한다.
    vi.clearAllMocks();
    vi.mocked(verifyTurnstileToken).mockResolvedValue(true);
    vi.mocked(checkIpRateLimit).mockResolvedValue({ allowed: true, remaining: 9, reset: 0 });
    vi.mocked(checkGlobalQuota).mockResolvedValue({ allowed: true });
  });
```

with:

```ts
  beforeEach(() => {
    // 이전 테스트의 호출 기록이 남아있으면 "호출되지 않아야 한다" 류의 단언이
    // 오염되므로, 기본값을 다시 세팅하기 전에 먼저 초기화한다.
    vi.clearAllMocks();
    vi.mocked(verifyTurnstileToken).mockResolvedValue(true);
    vi.mocked(checkIpRateLimit).mockResolvedValue({ allowed: true, remaining: 9, reset: 0 });
    vi.mocked(checkGlobalQuota).mockResolvedValue({ allowed: true });
    // 기본값은 실제 구현과 동일한 로직(sms/email만 캐시 대상)으로 두고,
    // 캐시는 기본적으로 미스로 둔다 — 이렇게 하면 캐시를 명시적으로 다루지
    // 않는 기존 테스트들이 이전과 동일하게 동작한다.
    vi.mocked(isCacheableInput).mockImplementation(
      (input) => input.type === 'sms' || input.type === 'email',
    );
    vi.mocked(getCachedResult).mockResolvedValue(null);
    vi.mocked(setCachedResult).mockResolvedValue(undefined);
  });
```

Then add these three `it` blocks inside the existing `describe('POST /api/analyze', ...)` block:

```ts
  it('returns the cached result directly on a cache hit, without calling analyzeMessage or checkGlobalQuota', async () => {
    vi.mocked(getCachedResult).mockResolvedValue({
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
    expect(analyzeMessage).not.toHaveBeenCalled();
    expect(checkGlobalQuota).not.toHaveBeenCalled();
  });

  it('caches the result after a successful sms analysis on a cache miss', async () => {
    const freshResult = {
      verdict: '위험' as const,
      riskScore: 88,
      redFlags: [{ flag: '긴급성 조성', evidence: '즉시 확인' }],
      explanation: '설명',
      recommendedAction: '조치',
      extractedText: '',
    };
    vi.mocked(analyzeMessage).mockResolvedValue(freshResult);

    const res = await POST(makeRequest(validSmsPayload));
    expect(res.status).toBe(200);
    expect(setCachedResult).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sms' }),
      freshResult,
    );
  });

  it('does not check or write the cache for image input', async () => {
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
    expect(getCachedResult).not.toHaveBeenCalled();
    expect(setCachedResult).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the tests to verify the three new ones fail**

Run: `npx vitest run src/app/api/analyze/route.test.ts`
Expected: FAIL for the three new tests (route.ts doesn't touch the cache module yet); all pre-existing tests still PASS (the new mock's default behavior is a no-op miss, so nothing else should change).

- [ ] **Step 3: Modify `src/app/api/analyze/route.ts`**

Add the import alongside the other `@/lib/security/*` imports:

```ts
import { getCachedResult, isCacheableInput, setCachedResult } from '@/lib/analysis/resultCache';
```

Replace the first `try` block (the one containing the Turnstile check, IP rate-limit check, and global quota check) with:

```ts
  try {
    if (typeof turnstileToken !== 'string' || !(await verifyTurnstileToken(turnstileToken, ip))) {
      return NextResponse.json({ error: '봇 확인에 실패했습니다.' }, { status: 403 });
    }

    const rateLimitResult = await checkIpRateLimit(ip);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
        { status: 429 },
      );
    }

    // 동일한 문자/이메일이 이미 캐시되어 있다면 전역 쿼터 가드와 LLM 호출을
    // 모두 건너뛰고 즉시 반환한다 — 이것이 캐싱의 실제 절감 효과다.
    // getCachedResult 자체가 실패를 내부에서 흡수하므로(fail open) 이
    // try 블록의 기존 503 처리와 충돌하지 않는다.
    if (isCacheableInput(parsedInput.data)) {
      const cached = await getCachedResult(parsedInput.data);
      if (cached) {
        return NextResponse.json(cached);
      }
    }

    const quotaResult = await checkGlobalQuota();
    if (!quotaResult.allowed) {
      const message =
        quotaResult.reason === 'daily'
          ? '오늘의 무료 사용량을 모두 사용했습니다. 내일 다시 시도해주세요.'
          : '일시적으로 요청이 많습니다. 잠시 후 다시 시도해주세요.';
      return NextResponse.json({ error: message }, { status: 429 });
    }
  } catch {
    // checkIpRateLimit/checkGlobalQuota hit Upstash over the network, and
    // verifyTurnstileToken now throws if TURNSTILE_SECRET_KEY is missing —
    // all three are config/infra failures, not the caller's fault, so they
    // surface as this app's sanitized 503 rather than Next.js's generic
    // error page or (worse, for the Turnstile case) a misleading 403 that
    // blames the user for a server misconfiguration.
    return NextResponse.json(
      { error: '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' },
      { status: 503 },
    );
  }
```

Then replace the second `try` block (the one calling `analyzeMessage`) with:

```ts
  try {
    const result = await analyzeMessage(parsedInput.data);
    // geminiProvider.ts already schema-validates its raw model output before
    // returning, so this is redundant today — but analyzeMessage() is a
    // swappable boundary (see provider.ts), and a future provider that
    // forgets to validate its own output would otherwise have nothing
    // stopping it from reaching the client. Re-validate at the response
    // boundary itself so that guarantee doesn't depend on every current and
    // future provider implementation remembering to uphold it.
    const validatedResult = AnalysisResultSchema.parse(result);

    // 이미지 모드에서 모델이 메시지 내용을 전혀 판독하지 못한 경우
    // (extractedText가 빈 문자열) 판정을 그대로 내보내지 않는다 —
    // 시스템 프롬프트(systemPrompt.ts)가 이 경우 빈 문자열을 반환하도록
    // 지시하지만, 이는 프롬프트 지시일 뿐 보장이 아니므로 라우트 경계에서
    // 한 번 더 강제한다.
    if (parsedInput.data.type === 'image' && validatedResult.extractedText === '') {
      return NextResponse.json(
        { error: '스크린샷에서 메시지를 읽을 수 없습니다. 메시지가 선명하게 보이는 스크린샷인지 확인해주세요.' },
        { status: 422 },
      );
    }

    if (isCacheableInput(parsedInput.data)) {
      await setCachedResult(parsedInput.data, validatedResult);
    }

    return NextResponse.json(validatedResult);
  } catch {
    // Deliberately no console.error(err) with the caught error object here —
    // it may carry request/prompt content via the SDK's error payload. Log a
    // bare marker only if operational visibility is needed later.
    return NextResponse.json(
      { error: '분석 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.' },
      { status: 500 },
    );
  }
```

(Only the two `try` blocks change — everything before them, e.g. `getClientIp` and the input-validation steps, stays exactly as-is.)

- [ ] **Step 4: Run the tests to verify they all pass**

Run: `npx vitest run src/app/api/analyze/route.test.ts`
Expected: PASS (all tests — the 3 new ones plus every pre-existing one)

- [ ] **Step 5: Run the full suite, tsc, and lint**

Run: `pnpm test && npx tsc --noEmit && pnpm lint`
Expected: full suite green, zero type errors, lint clean

- [ ] **Step 6: Commit**

```bash
git add src/app/api/analyze/route.ts src/app/api/analyze/route.test.ts
git commit -m "feat: check and populate the result cache in the analyze route"
```

---

## Task 3: Manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run `pnpm dev`, submit the same SMS text twice in a row**

Confirm the second submission returns noticeably faster than the first (no real LLM round-trip) and produces the identical verdict/redFlags/explanation as the first.

- [ ] **Step 2: Submit the same text with a different sender number**

Confirm this does **not** hit the cache from Step 1 (may produce a different verdict if the sender number itself is a signal — e.g. a spoofed-looking number vs. a plausible one).

- [ ] **Step 3: Submit a screenshot, then the identical screenshot again**

Confirm both go through a full analysis (no caching for images) — response times should be similar for both, not faster on the second.
