import { describe, expect, it, vi, beforeEach } from 'vitest';

const createMock = vi.fn();

vi.mock('groq-sdk', () => ({
  // vitest 4.x는 `new`로 호출되는 mock 구현에 화살표 함수를 허용하지 않으므로
  // (constructor로 사용 불가) function 표현식을 사용한다.
  default: vi.fn().mockImplementation(function () {
    return { chat: { completions: { create: createMock } } };
  }),
}));

import { analyzeWithGroq } from './groqProvider';

describe('analyzeWithGroq', () => {
  beforeEach(() => {
    createMock.mockReset();
    process.env.GROQ_API_KEY = 'test-key';
  });

  it('parses a valid JSON response into an AnalysisResult', async () => {
    createMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              verdict: '위험',
              riskScore: 90,
              redFlags: [{ flag: '긴급성 조성', evidence: '즉시 확인' }],
              explanation: '설명',
              recommendedAction: '링크를 클릭하지 마세요',
              extractedText: '',
            }),
          },
        },
      ],
    });

    const result = await analyzeWithGroq({
      type: 'sms',
      senderNumber: '010-0000-0000',
      messageBody: '지금 즉시 확인하지 않으면 계좌가 정지됩니다',
    });

    expect(result.verdict).toBe('위험');
    expect(result.riskScore).toBe(90);
  });

  it('throws when the model response is empty', async () => {
    createMock.mockResolvedValue({ choices: [{ message: { content: null } }] });

    await expect(
      analyzeWithGroq({ type: 'sms', senderNumber: '010', messageBody: '테스트 메시지입니다' }),
    ).rejects.toThrow('Groq returned an empty response');
  });

  it('throws when the model response fails schema validation', async () => {
    createMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({ verdict: '알수없음', riskScore: 5, redFlags: [], explanation: '', recommendedAction: '', extractedText: '' }),
          },
        },
      ],
    });

    await expect(
      analyzeWithGroq({ type: 'sms', senderNumber: '010', messageBody: '테스트 메시지입니다' }),
    ).rejects.toThrow();
  });

  it('throws when the model response is malformed JSON', async () => {
    createMock.mockResolvedValue({
      choices: [{ message: { content: '{"verdict": "위험", "riskSc' } }],
    });

    await expect(
      analyzeWithGroq({ type: 'sms', senderNumber: '010', messageBody: '테스트 메시지입니다' }),
    ).rejects.toThrow();
  });

  it('throws when GROQ_API_KEY is not set', async () => {
    delete process.env.GROQ_API_KEY;

    await expect(
      analyzeWithGroq({ type: 'sms', senderNumber: '010', messageBody: '테스트 메시지입니다' }),
    ).rejects.toThrow('GROQ_API_KEY is not set');
  });
});
