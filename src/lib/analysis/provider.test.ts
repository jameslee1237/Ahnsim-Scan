import { describe, expect, it, vi } from 'vitest';

vi.mock('./geminiProvider', () => ({
  analyzeWithGemini: vi.fn().mockResolvedValue({
    verdict: '안전',
    riskScore: 5,
    redFlags: [],
    explanation: '정상적인 메시지입니다.',
    recommendedAction: '별도 조치가 필요하지 않습니다.',
  }),
}));

import { analyzeMessage } from './provider';
import { analyzeWithGemini } from './geminiProvider';

describe('analyzeMessage', () => {
  it('delegates to the gemini provider', async () => {
    const input = {
      type: 'sms' as const,
      senderNumber: '010-0000-0000',
      messageBody: '안녕하세요 택배가 도착했습니다',
    };
    const result = await analyzeMessage(input);
    expect(analyzeWithGemini).toHaveBeenCalledWith(input);
    expect(result.verdict).toBe('안전');
  });
});
