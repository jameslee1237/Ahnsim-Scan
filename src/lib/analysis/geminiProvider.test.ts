import { describe, expect, it, vi, beforeEach } from 'vitest';

const generateContentMock = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(function () {
    return { models: { generateContent: generateContentMock } };
  }),
  Type: { OBJECT: 'OBJECT', STRING: 'STRING', NUMBER: 'NUMBER', INTEGER: 'INTEGER', ARRAY: 'ARRAY' },
}));

import { analyzeWithGemini } from './geminiProvider';

const validResponse = {
  verdict: '위험',
  riskScore: 90,
  redFlags: [{ flag: '긴급성 조성', evidence: '즉시 확인' }],
  explanation: '설명',
  recommendedAction: '링크를 클릭하지 마세요',
  extractedText: '',
};

describe('analyzeWithGemini', () => {
  beforeEach(() => {
    generateContentMock.mockReset();
    process.env.GEMINI_API_KEY = 'test-key';
  });

  it('parses a valid JSON response into an AnalysisResult', async () => {
    generateContentMock.mockResolvedValue({ text: JSON.stringify(validResponse) });

    const result = await analyzeWithGemini({
      type: 'sms',
      senderNumber: '010-0000-0000',
      messageBody: '지금 즉시 확인하지 않으면 계좌가 정지됩니다',
    });

    expect(result.verdict).toBe('위험');
    expect(result.riskScore).toBe(90);
  });

  it('sends contents as a plain string for text input', async () => {
    generateContentMock.mockResolvedValue({ text: JSON.stringify(validResponse) });

    await analyzeWithGemini({
      type: 'sms',
      senderNumber: '010-0000-0000',
      messageBody: '테스트 메시지입니다',
    });

    const call = generateContentMock.mock.calls[0][0];
    expect(typeof call.contents).toBe('string');
  });

  it('sends contents as an array with inlineData image parts for image input', async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({ ...validResponse, extractedText: '발신: 010-0000-0000\n택배 도착' }),
    });

    await analyzeWithGemini({
      type: 'image',
      images: ['data:image/jpeg;base64,AAAA', 'data:image/png;base64,BBBB'],
    });

    const call = generateContentMock.mock.calls[0][0];
    expect(Array.isArray(call.contents)).toBe(true);
    expect(typeof call.contents[0]).toBe('string');
    expect(call.contents[1]).toEqual({ inlineData: { mimeType: 'image/jpeg', data: 'AAAA' } });
    expect(call.contents[2]).toEqual({ inlineData: { mimeType: 'image/png', data: 'BBBB' } });
  });

  it('uses a larger maxOutputTokens budget for image input than for text input', async () => {
    generateContentMock.mockResolvedValue({ text: JSON.stringify(validResponse) });

    await analyzeWithGemini({ type: 'sms', senderNumber: '010', messageBody: '테스트 메시지입니다' });
    const textCallTokens = generateContentMock.mock.calls[0][0].config.maxOutputTokens;

    generateContentMock.mockClear();
    await analyzeWithGemini({ type: 'image', images: ['data:image/jpeg;base64,AAAA'] });
    const imageCallTokens = generateContentMock.mock.calls[0][0].config.maxOutputTokens;

    expect(imageCallTokens).toBeGreaterThan(textCallTokens);
  });

  it('throws when the model response is empty', async () => {
    generateContentMock.mockResolvedValue({ text: '' });

    await expect(
      analyzeWithGemini({ type: 'sms', senderNumber: '010', messageBody: '테스트 메시지입니다' }),
    ).rejects.toThrow('Gemini returned an empty response');
  });

  it('throws when the model response fails schema validation', async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({ verdict: '알수없음', riskScore: 5, redFlags: [], explanation: '', recommendedAction: '', extractedText: '' }),
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
