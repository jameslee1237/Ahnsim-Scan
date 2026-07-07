import 'server-only';

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export const verifyTurnstileToken = async (
  token: string,
  remoteIp?: string,
): Promise<boolean> => {
  if (!token) return false;

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // 검증 없이 통과시키면 모든 요청이 봇 확인을 우회하게 되므로, 설정 누락은
    // false(봇 검증 실패로 취급)가 아니라 throw로 알려서 라우트 핸들러가 503으로
    // 응답하게 한다 — "너 봇이야" 대신 "서버 설정 오류"라는 정확한 신호를 준다.
    throw new Error('TURNSTILE_SECRET_KEY is not set');
  }

  const body = new URLSearchParams({
    secret,
    response: token,
  });
  if (remoteIp) {
    body.append('remoteip', remoteIp);
  }

  try {
    const res = await fetch(TURNSTILE_VERIFY_URL, { method: 'POST', body });
    if (!res.ok) return false;

    const data = (await res.json()) as { success: boolean };
    return data.success === true;
  } catch {
    // fetch() itself can reject (network failure, DNS, timeout), and
    // res.json() can throw on a malformed body — neither is an HTTP-level
    // "ok: false" response, so they aren't caught by the check above. This
    // function's contract is "always resolves to a boolean, never throws",
    // so both failure modes fail closed the same way an explicit rejection
    // from Cloudflare would.
    return false;
  }
};
