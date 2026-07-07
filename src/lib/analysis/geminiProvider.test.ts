import { describe, expect, it, vi, beforeEach } from 'vitest';

const generateContentMock = vi.fn();

vi.mock('@google/genai', () => ({
  // vitest 4.x는 `new`로 호출되는 mock 구현에 화살표 함수를 허용하지 않으므로
  // (constructor로 사용 불가) function 표현식을 사용한다.
  GoogleGenAI: vi.fn().mockImplementation(function () {
    return { models: { generateContent: generateContentMock } };
  }),
  Type: { OBJECT: 'OBJECT', STRING: 'STRING', NUMBER: 'NUMBER', INTEGER: 'INTEGER', ARRAY: 'ARRAY' },
}));

import { analyzeWithGemini } from './geminiProvider';

describe('analyzeWithGemini', () => {
  beforeEach(() => {
    generateContentMock.mockReset();
    process.env.GEMINI_API_KEY = 'test-key';
  });

  it('parses a valid JSON response into an AnalysisResult', async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        verdict: '위험',
        riskScore: 90,
        redFlags: ['긴급성 조성'],
        explanation: '설명',
        recommendedAction: '링크를 클릭하지 마세요',
      }),
    });

    const result = await analyzeWithGemini({
      type: 'sms',
      senderNumber: '010-0000-0000',
      messageBody: '지금 즉시 확인하지 않으면 계좌가 정지됩니다',
    });

    expect(result.verdict).toBe('위험');
    expect(result.riskScore).toBe(90);
  });

  it('throws when the model response is empty', async () => {
    generateContentMock.mockResolvedValue({ text: '' });

    await expect(
      analyzeWithGemini({ type: 'sms', senderNumber: '010', messageBody: '테스트 메시지입니다' }),
    ).rejects.toThrow('Gemini returned an empty response');
  });

  it('throws when the model response fails schema validation', async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({ verdict: '알수없음', riskScore: 5, redFlags: [], explanation: '', recommendedAction: '' }),
    });

    await expect(
      analyzeWithGemini({ type: 'sms', senderNumber: '010', messageBody: '테스트 메시지입니다' }),
    ).rejects.toThrow();
  });

  it('throws when the model response is malformed JSON', async () => {
    generateContentMock.mockResolvedValue({ text: '{"verdict": "위험", "riskSc' });

    await expect(
      analyzeWithGemini({ type: 'sms', senderNumber: '010', messageBody: '테스트 메시지입니다' }),
    ).rejects.toThrow();
  });

  it('throws when GEMINI_API_KEY is not set', async () => {
    delete process.env.GEMINI_API_KEY;

    await expect(
      analyzeWithGemini({ type: 'sms', senderNumber: '010', messageBody: '테스트 메시지입니다' }),
    ).rejects.toThrow('GEMINI_API_KEY is not set');
  });
});
