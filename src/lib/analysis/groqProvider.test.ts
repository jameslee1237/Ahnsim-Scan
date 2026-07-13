import { describe, expect, it, vi, beforeEach } from 'vitest';

const createMock = vi.fn();

vi.mock('groq-sdk', () => ({
  default: vi.fn().mockImplementation(function () {
    return { chat: { completions: { create: createMock } } };
  }),
}));

import { analyzeWithGroq } from './groqProvider';

const validResponse = {
  verdict: '위험',
  riskScore: 90,
  redFlags: [{ flag: '긴급성 조성', evidence: '즉시 확인' }],
  explanation: '설명',
  recommendedAction: '링크를 클릭하지 마세요',
  extractedText: '',
};

const mockChatResponse = (body: unknown) => ({
  choices: [{ message: { content: JSON.stringify(body) } }],
});

describe('analyzeWithGroq', () => {
  beforeEach(() => {
    createMock.mockReset();
    process.env.GROQ_API_KEY = 'test-key';
  });

  it('parses a valid JSON response into an AnalysisResult for text input', async () => {
    createMock.mockResolvedValue(mockChatResponse(validResponse));

    const result = await analyzeWithGroq({
      type: 'sms',
      senderNumber: '010-0000-0000',
      messageBody: '지금 즉시 확인하지 않으면 계좌가 정지됩니다',
    });

    expect(result.verdict).toBe('위험');
    expect(result.riskScore).toBe(90);
  });

  it('uses the gpt-oss text model with strict json_schema for text input', async () => {
    createMock.mockResolvedValue(mockChatResponse(validResponse));

    await analyzeWithGroq({ type: 'sms', senderNumber: '010', messageBody: '테스트 메시지입니다' });

    const call = createMock.mock.calls[0][0];
    expect(call.model).toBe('openai/gpt-oss-20b');
    expect(call.response_format.type).toBe('json_schema');
    expect(call.response_format.json_schema.strict).toBe(true);
    expect(typeof call.messages[1].content).toBe('string');
  });

  it('uses the Llama 4 Scout model with a non-strict json_schema hint for image input', async () => {
    createMock.mockResolvedValue(
      mockChatResponse({ ...validResponse, extractedText: '발신: 010-0000-0000\n택배 도착' }),
    );

    await analyzeWithGroq({ type: 'image', images: ['data:image/jpeg;base64,AAAA'] });

    const call = createMock.mock.calls[0][0];
    expect(call.model).toBe('meta-llama/llama-4-scout-17b-16e-instruct');
    expect(call.response_format.type).toBe('json_schema');
    expect(call.response_format.json_schema.strict).toBeUndefined();
    expect(call.response_format.json_schema.schema).toBeDefined();
    expect(call.reasoning_effort).toBeUndefined();
  });

  it('sends each image as an image_url content part alongside the instruction text', async () => {
    createMock.mockResolvedValue(mockChatResponse(validResponse));

    await analyzeWithGroq({
      type: 'image',
      images: ['data:image/jpeg;base64,AAAA', 'data:image/png;base64,BBBB'],
    });

    const call = createMock.mock.calls[0][0];
    const userContent = call.messages[1].content;
    expect(Array.isArray(userContent)).toBe(true);
    expect(userContent[0].type).toBe('text');
    expect(userContent[1]).toEqual({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } });
    expect(userContent[2]).toEqual({ type: 'image_url', image_url: { url: 'data:image/png;base64,BBBB' } });
  });

  it('throws when the model response is empty', async () => {
    createMock.mockResolvedValue({ choices: [{ message: { content: null } }] });

    await expect(
      analyzeWithGroq({ type: 'sms', senderNumber: '010', messageBody: '테스트 메시지입니다' }),
    ).rejects.toThrow('Groq returned an empty response');
  });

  it('throws when the model response fails schema validation', async () => {
    createMock.mockResolvedValue(
      mockChatResponse({ verdict: '알수없음', riskScore: 5, redFlags: [], explanation: '', recommendedAction: '', extractedText: '' }),
    );

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
