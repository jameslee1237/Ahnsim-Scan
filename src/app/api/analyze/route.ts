import { NextRequest, NextResponse } from 'next/server';
import { AnalysisInputSchema, AnalysisResultSchema } from '@/lib/analysis/types';
import { analyzeMessage } from '@/lib/analysis/provider';
import { checkIpRateLimit } from '@/lib/security/rateLimit';
import { checkGlobalQuota } from '@/lib/security/quotaGuard';
import { verifyTurnstileToken } from '@/lib/security/turnstile';

const getClientIp = (req: NextRequest): string => {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  // Vercel sets x-real-ip on some routing paths where x-forwarded-for is
  // absent (e.g. certain edge/proxy configurations) — check it as a fallback
  // before giving up and grouping the request under the shared 'unknown' key.
  // Trust assumption: both headers are client-controllable in general, and
  // are only safe to read here because Vercel overwrites/sanitizes them at
  // its edge for direct deployments. If a third-party reverse proxy or CDN
  // is ever placed in front of this app, that assumption no longer holds and
  // these headers would need to be re-validated or ignored.
  const realIp = req.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }
  return 'unknown';
};

export const POST = async (req: NextRequest) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  // A JSON body of `null` (or any non-object top-level value) parses
  // successfully — it's not a JSON syntax error, so the try/catch above
  // doesn't catch it — but destructuring `null` throws a TypeError. Guard
  // explicitly rather than let that propagate as an unhandled exception.
  if (body === null || typeof body !== 'object') {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const { turnstileToken, ...rest } = body as Record<string, unknown>;

  // 입력 스키마 검증을 봇 확인/rate limit/quota 체크보다 먼저 수행한다. 순서가
  // 바뀌면(체크들이 먼저 실행되면) 형식이 잘못된 요청도 Turnstile 토큰 1회,
  // IP rate limit 슬롯 1개, 전역 quota 카운트를 그대로 소모한 뒤에야 400으로
  // 거부되어 — 정작 이 체크들이 보호하려는 공유 무료 할당량을 로컬 검증만으로
  // 막을 수 있는 요청이 도리어 갉아먹게 된다.
  const parsedInput = AnalysisInputSchema.safeParse(rest);
  if (!parsedInput.success) {
    return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 });
  }

  const ip = getClientIp(req);

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
};
