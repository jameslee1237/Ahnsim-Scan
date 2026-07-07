import 'server-only';

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export const verifyTurnstileToken = async (
  token: string,
  remoteIp?: string,
): Promise<boolean> => {
  if (!token) return false;

  const body = new URLSearchParams({
    secret: process.env.TURNSTILE_SECRET_KEY!,
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
