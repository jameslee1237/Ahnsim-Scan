import { describe, expect, it, vi, beforeEach } from 'vitest';
import { verifyTurnstileToken } from './turnstile';

describe('verifyTurnstileToken', () => {
  beforeEach(() => {
    process.env.TURNSTILE_SECRET_KEY = 'test-secret';
  });

  it('returns false for an empty token without calling Cloudflare', async () => {
    global.fetch = vi.fn();
    const result = await verifyTurnstileToken('');
    expect(result).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns true when Cloudflare confirms success', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    }) as unknown as typeof fetch;

    const result = await verifyTurnstileToken('valid-token', '1.2.3.4');
    expect(result).toBe(true);
  });

  it('returns false when Cloudflare rejects the token', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: false }),
    }) as unknown as typeof fetch;

    const result = await verifyTurnstileToken('invalid-token');
    expect(result).toBe(false);
  });

  it('returns false when the Cloudflare request itself fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;

    const result = await verifyTurnstileToken('some-token');
    expect(result).toBe(false);
  });
});
