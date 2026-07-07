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

  const res = await fetch(TURNSTILE_VERIFY_URL, { method: 'POST', body });
  if (!res.ok) return false;

  const data = (await res.json()) as { success: boolean };
  return data.success === true;
};
