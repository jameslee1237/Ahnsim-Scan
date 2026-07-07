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

// Kept below Gemini's actual free-tier ceiling as a safety margin. Public
// reporting on gemini-2.5-flash's free tier converges around ~1,500
// requests/day and somewhere in the 10-15 requests/minute range (sources
// disagree within that band, and Google has lowered these limits over time
// in the past) — DAILY_LIMIT is set comfortably under the daily figure;
// MINUTE_LIMIT is set at the conservative end of the per-minute range so
// this guard has a real chance of firing before Google's own 429, not after
// it. Re-verify both against the current Google AI Studio console before
// depending on them for real production traffic.
const DAILY_LIMIT = 1400;
const MINUTE_LIMIT = 8;

// Boundaries use UTC, not the Pacific-time midnight some Google APIs reset
// on — a deliberate simplification (no timezone/DST handling) since this is
// a safety-margin backstop, not the actual enforcement (Google's own limit
// is still authoritative regardless of how this guard's clock lines up with
// theirs). Worst case of the mismatch is a few hours of being slightly more
// or less conservative than Google's real reset, not a correctness or cost
// problem.
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
