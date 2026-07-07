import 'server-only';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!upstashUrl || !upstashToken) {
  throw new Error('UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN is not set');
}

const redis = new Redis({
  url: upstashUrl,
  token: upstashToken,
});

// 10 requests/hour per IP — generous for a real user checking a few
// messages, tight enough to blunt casual scripted abuse.
const ipRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 h'),
  prefix: 'ratelimit:ip',
});

export const checkIpRateLimit = async (
  ip: string,
): Promise<{ allowed: boolean; remaining: number; reset: number }> => {
  const { success, remaining, reset } = await ipRatelimit.limit(ip);
  return { allowed: success, remaining, reset };
};
