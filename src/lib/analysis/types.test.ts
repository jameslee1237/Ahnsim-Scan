import { describe, expect, it } from 'vitest';
import { AnalysisInputSchema, AnalysisResultSchema } from './types';

describe('AnalysisInputSchema', () => {
  it('accepts a valid sms input', () => {
    const result = AnalysisInputSchema.safeParse({
      type: 'sms',
      senderNumber: '010-1234-5678',
      messageBody: '안녕하세요 택배가 도착했습니다',
    });
    expect(result.success).toBe(true);
  });

  it('rejects sms input with a body shorter than 5 characters', () => {
    const result = AnalysisInputSchema.safeParse({
      type: 'sms',
      senderNumber: '010-1234-5678',
      messageBody: '짧음',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid email input', () => {
    const result = AnalysisInputSchema.safeParse({
      type: 'email',
      senderAddress: 'bank@example.com',
      subject: '계좌 확인 요청',
      body: '고객님의 계좌를 확인해주세요',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown type discriminator', () => {
    const result = AnalysisInputSchema.safeParse({
      type: 'kakaotalk',
      body: '본문',
    });
    expect(result.success).toBe(false);
  });
});

describe('AnalysisResultSchema', () => {
  it('accepts a valid result', () => {
    const result = AnalysisResultSchema.safeParse({
      verdict: '위험',
      riskScore: 95,
      redFlags: ['긴급성을 조성하는 문구'],
      explanation: '설명',
      recommendedAction: '링크를 클릭하지 마세요',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid verdict value', () => {
    const result = AnalysisResultSchema.safeParse({
      verdict: '알수없음',
      riskScore: 50,
      redFlags: [],
      explanation: '설명',
      recommendedAction: '조치',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-integer riskScore (e.g. a 0-1 ratio instead of 0-100)', () => {
    // 실제로 Groq gpt-oss-20b가 verdict "위험"에 riskScore 0.92를 반환한
    // 사례가 있었다 — min(0)/max(100) 범위 검사만으로는 걸리지 않는다.
    const result = AnalysisResultSchema.safeParse({
      verdict: '위험',
      riskScore: 0.92,
      redFlags: [],
      explanation: '설명',
      recommendedAction: '조치',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a riskScore that does not match its verdict\'s documented band', () => {
    const result = AnalysisResultSchema.safeParse({
      verdict: '위험',
      riskScore: 20,
      redFlags: [],
      explanation: '설명',
      recommendedAction: '조치',
    });
    expect(result.success).toBe(false);
  });
});
