import { describe, expect, it, vi } from 'vitest';

// vi.mock factories are hoisted above this file's own top-level statements,
// so the referenced mock fn must be declared via vi.hoisted() (or named with
// a `mock` prefix) — otherwise it's a TDZ ReferenceError at import time.
// Same reasoning applies to the env vars: rateLimit.ts now validates them at
// module load time, and that load happens when `checkIpRateLimit` is
// imported below — so they must be set inside vi.hoisted() too, not as a
// plain top-level assignment, or they won't exist yet when the check runs.
const { limitMock, slidingWindowMock } = vi.hoisted(() => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
  return { limitMock: vi.fn(), slidingWindowMock: vi.fn() };
});

// Both mocks below use `function`, not arrow functions — arrow functions are
// never constructible in JS, and rateLimit.ts invokes both with `new`.
vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(function () {
    return {};
  }),
}));

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: Object.assign(
    vi.fn().mockImplementation(function () {
      return { limit: limitMock };
    }),
    { slidingWindow: slidingWindowMock },
  ),
}));

import { Ratelimit } from '@upstash/ratelimit';
import { checkIpRateLimit } from './rateLimit';

describe('checkIpRateLimit', () => {
  it('allows the request when under the limit', async () => {
    limitMock.mockResolvedValue({ success: true, remaining: 9, reset: 0 });
    const result = await checkIpRateLimit('1.2.3.4');
    expect(result.allowed).toBe(true);
  });

  it('rejects the request when over the limit', async () => {
    limitMock.mockResolvedValue({ success: false, remaining: 0, reset: 123 });
    const result = await checkIpRateLimit('1.2.3.4');
    expect(result.allowed).toBe(false);
  });

  it('configures a 10 requests per hour sliding window', () => {
    expect(Ratelimit.slidingWindow).toHaveBeenCalledWith(10, '1 h');
  });
});
