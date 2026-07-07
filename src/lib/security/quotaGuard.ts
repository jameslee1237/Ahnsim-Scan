import 'server-only';
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

// Kept below Gemini's actual free-tier ceiling as a safety margin — verify
// against the current published free-tier limits for the chosen model and
// tune these two constants before relying on them in production.
const DAILY_LIMIT = 1400;
const MINUTE_LIMIT = 12;

const todayKey = (): string => {
  const now = new Date();
  return `quota:daily:${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}`;
};

const minuteKey = (): string => {
  const now = new Date();
  return `quota:minute:${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}-${now.getUTCHours()}-${now.getUTCMinutes()}`;
};

export const checkGlobalQuota = async (): Promise<{
  allowed: boolean;
  reason?: 'daily' | 'minute';
}> => {
  const dailyCount = await redis.incr(todayKey());
  if (dailyCount === 1) {
    await redis.expire(todayKey(), 60 * 60 * 25); // outlives a full UTC day
  }
  if (dailyCount > DAILY_LIMIT) {
    return { allowed: false, reason: 'daily' };
  }

  const minuteCount = await redis.incr(minuteKey());
  if (minuteCount === 1) {
    await redis.expire(minuteKey(), 65);
  }
  if (minuteCount > MINUTE_LIMIT) {
    return { allowed: false, reason: 'minute' };
  }

  return { allowed: true };
};
