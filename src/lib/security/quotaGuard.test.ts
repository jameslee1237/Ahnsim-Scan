import { describe, expect, it, vi, beforeEach } from 'vitest';

// vi.mock factories are hoisted above this file's own top-level statements.
// quotaGuard.ts constructs its Redis client at module top level (`const redis
// = new Redis(...)`) and now validates UPSTASH_REDIS_REST_URL/TOKEN at that
// same load time, so both the mock fns and the env vars must be set inside
// vi.hoisted() — a plain `const`/`process.env.X = ...` written above the
// vi.mock calls would still run after this test file's
// `import { checkGlobalQuota } from './quotaGuard'` line triggers that load.
const { incrMock, expireMock } = vi.hoisted(() => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
  return { incrMock: vi.fn(), expireMock: vi.fn() };
});

// `function`, not an arrow function — arrow functions are never constructible
// in JS, and quotaGuard.ts invokes this with `new Redis(...)`.
vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(function () {
    return { incr: incrMock, expire: expireMock };
  }),
}));

import { checkGlobalQuota } from './quotaGuard';

describe('checkGlobalQuota', () => {
  beforeEach(() => {
    incrMock.mockReset();
    expireMock.mockReset();
  });

  it('allows the request when under both limits', async () => {
    incrMock.mockResolvedValueOnce(5).mockResolvedValueOnce(2);
    const result = await checkGlobalQuota();
    expect(result.allowed).toBe(true);
  });

  it('rejects when the daily limit is exceeded', async () => {
    incrMock.mockResolvedValueOnce(1401);
    const result = await checkGlobalQuota();
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('daily');
  });

  it('rejects when the per-minute limit is exceeded', async () => {
    incrMock.mockResolvedValueOnce(5).mockResolvedValueOnce(9);
    const result = await checkGlobalQuota();
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('minute');
  });

  it('allows the request when exactly at the daily limit', async () => {
    incrMock.mockResolvedValueOnce(1400).mockResolvedValueOnce(1);
    const result = await checkGlobalQuota();
    expect(result.allowed).toBe(true);
  });

  it('allows the request when exactly at the per-minute limit', async () => {
    incrMock.mockResolvedValueOnce(1).mockResolvedValueOnce(8);
    const result = await checkGlobalQuota();
    expect(result.allowed).toBe(true);
  });
});
