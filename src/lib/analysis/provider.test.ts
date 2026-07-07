import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ApiError } from '@google/genai';

vi.mock('./geminiProvider', () => ({
  analyzeWithGemini: vi.fn(),
}));
vi.mock('./groqProvider', () => ({
  analyzeWithGroq: vi.fn(),
}));

import { analyzeMessage } from './provider';
import { analyzeWithGemini } from './geminiProvider';
import { analyzeWithGroq } from './groqProvider';

const validInput = {
  type: 'sms' as const,
  senderNumber: '010-0000-0000',
  messageBody: '안녕하세요 택배가 도착했습니다',
};

const validResult = {
  verdict: '안전' as const,
  riskScore: 5,
  redFlags: [],
  explanation: '정상적인 메시지입니다.',
  recommendedAction: '별도 조치가 필요하지 않습니다.',
};

describe('analyzeMessage', () => {
  beforeEach(() => {
    vi.mocked(analyzeWithGemini).mockReset();
    vi.mocked(analyzeWithGroq).mockReset();
  });

  it('delegates to the gemini provider and returns its result on success', async () => {
    vi.mocked(analyzeWithGemini).mockResolvedValue(validResult);

    const result = await analyzeMessage(validInput);

    expect(analyzeWithGemini).toHaveBeenCalledWith(validInput);
    expect(analyzeWithGroq).not.toHaveBeenCalled();
    expect(result.verdict).toBe('안전');
  });

  it('falls back to groq when gemini throws a 429 quota-exhaustion error', async () => {
    vi.mocked(analyzeWithGemini).mockRejectedValue(
      new ApiError({ message: 'RESOURCE_EXHAUSTED', status: 429 }),
    );
    vi.mocked(analyzeWithGroq).mockResolvedValue(validResult);

    const result = await analyzeMessage(validInput);

    expect(analyzeWithGemini).toHaveBeenCalledWith(validInput);
    expect(analyzeWithGroq).toHaveBeenCalledWith(validInput);
    expect(result.verdict).toBe('안전');
  });

  it('does not fall back to groq on a non-quota gemini error, and rethrows it', async () => {
    vi.mocked(analyzeWithGemini).mockRejectedValue(new Error('Gemini returned an empty response'));

    await expect(analyzeMessage(validInput)).rejects.toThrow('Gemini returned an empty response');
    expect(analyzeWithGroq).not.toHaveBeenCalled();
  });

  it('does not fall back to groq on a non-429 gemini ApiError (e.g. a 500)', async () => {
    vi.mocked(analyzeWithGemini).mockRejectedValue(
      new ApiError({ message: 'internal error', status: 500 }),
    );

    await expect(analyzeMessage(validInput)).rejects.toThrow();
    expect(analyzeWithGroq).not.toHaveBeenCalled();
  });

  it('propagates a groq error if the fallback itself fails', async () => {
    vi.mocked(analyzeWithGemini).mockRejectedValue(
      new ApiError({ message: 'RESOURCE_EXHAUSTED', status: 429 }),
    );
    vi.mocked(analyzeWithGroq).mockRejectedValue(new Error('GROQ_API_KEY is not set'));

    await expect(analyzeMessage(validInput)).rejects.toThrow('GROQ_API_KEY is not set');
  });
});
