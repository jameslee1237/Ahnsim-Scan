import 'server-only';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
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
