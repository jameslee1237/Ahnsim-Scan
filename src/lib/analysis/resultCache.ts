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
// 다른 판정이 나올 수 있다. 캐시 히트율보다 정확성을 우선한다.
// JSON.stringify를 배열에 적용한다 — 객체였다면 키 순서가 모호해질 수
// 있었지만, 배열은 위치 고정이라 그 문제가 없고 문자열 이스케이프 덕분에
// 필드 안의 구분자성 문자로 인한 경계 혼동도 없다.
const buildCacheKey = (input: CacheableInput): string => {
  const canonical =
    input.type === 'sms'
      ? JSON.stringify(['sms', input.senderNumber, input.messageBody])
      : JSON.stringify(['email', input.senderAddress, input.subject, input.body]);
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
