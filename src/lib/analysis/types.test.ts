import { describe, expect, it } from 'vitest';
import { AnalysisInputSchema, AnalysisResultSchema, MAX_IMAGES } from './types';

const validJpegDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAA=';

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

  it('accepts a valid image input with one image', () => {
    const result = AnalysisInputSchema.safeParse({
      type: 'image',
      images: [validJpegDataUrl],
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid image input with the maximum number of images', () => {
    const result = AnalysisInputSchema.safeParse({
      type: 'image',
      images: Array(MAX_IMAGES).fill(validJpegDataUrl),
    });
    expect(result.success).toBe(true);
  });

  it('rejects image input with zero images', () => {
    const result = AnalysisInputSchema.safeParse({ type: 'image', images: [] });
    expect(result.success).toBe(false);
  });

  it('rejects image input with more than the maximum number of images', () => {
    const result = AnalysisInputSchema.safeParse({
      type: 'image',
      images: Array(MAX_IMAGES + 1).fill(validJpegDataUrl),
    });
    expect(result.success).toBe(false);
  });

  it('rejects an image string that is not a data URL', () => {
    const result = AnalysisInputSchema.safeParse({
      type: 'image',
      images: ['https://example.com/screenshot.jpg'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an image data URL with an unsupported MIME type', () => {
    const result = AnalysisInputSchema.safeParse({
      type: 'image',
      images: ['data:image/gif;base64,R0lGODlh'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects when the combined size of all images exceeds the total cap', () => {
    // 개별 상한(MAX_SINGLE_IMAGE_DATA_URL_LENGTH)은 넘지 않지만 5장을 합치면
    // 전체 상한(MAX_TOTAL_IMAGES_DATA_URL_LENGTH)을 넘는 경우를 재현한다.
    const oversizedButIndividuallyValid =
      'data:image/jpeg;base64,' + 'A'.repeat(900_000);
    const result = AnalysisInputSchema.safeParse({
      type: 'image',
      images: Array(MAX_IMAGES).fill(oversizedButIndividuallyValid),
    });
    expect(result.success).toBe(false);
  });
});

describe('AnalysisResultSchema', () => {
  it('accepts a valid result with structured red flags and empty extractedText', () => {
    const result = AnalysisResultSchema.safeParse({
      verdict: '위험',
      riskScore: 95,
      redFlags: [{ flag: '긴급성을 조성하는 문구', evidence: '즉시 확인하지 않으면' }],
      explanation: '설명',
      recommendedAction: '링크를 클릭하지 마세요',
      extractedText: '',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid result with non-empty extractedText (image mode)', () => {
    const result = AnalysisResultSchema.safeParse({
      verdict: '안전',
      riskScore: 5,
      redFlags: [],
      explanation: '설명',
      recommendedAction: '조치 불필요',
      extractedText: '발신: 010-0000-0000\n안녕하세요 택배가 도착했습니다',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a redFlags entry that is a bare string instead of {flag, evidence}', () => {
    const result = AnalysisResultSchema.safeParse({
      verdict: '위험',
      riskScore: 95,
      redFlags: ['긴급성을 조성하는 문구'],
      explanation: '설명',
      recommendedAction: '조치',
      extractedText: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a redFlags entry missing the evidence field', () => {
    const result = AnalysisResultSchema.safeParse({
      verdict: '위험',
      riskScore: 95,
      redFlags: [{ flag: '긴급성을 조성하는 문구' }],
      explanation: '설명',
      recommendedAction: '조치',
      extractedText: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a result missing extractedText', () => {
    const result = AnalysisResultSchema.safeParse({
      verdict: '안전',
      riskScore: 5,
      redFlags: [],
      explanation: '설명',
      recommendedAction: '조치',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid verdict value', () => {
    const result = AnalysisResultSchema.safeParse({
      verdict: '알수없음',
      riskScore: 50,
      redFlags: [],
      explanation: '설명',
      recommendedAction: '조치',
      extractedText: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-integer riskScore (e.g. a 0-1 ratio instead of 0-100)', () => {
    const result = AnalysisResultSchema.safeParse({
      verdict: '위험',
      riskScore: 0.92,
      redFlags: [],
      explanation: '설명',
      recommendedAction: '조치',
      extractedText: '',
    });
    expect(result.success).toBe(false);
  });

  it("rejects a riskScore that does not match its verdict's documented band", () => {
    const result = AnalysisResultSchema.safeParse({
      verdict: '위험',
      riskScore: 20,
      redFlags: [],
      explanation: '설명',
      recommendedAction: '조치',
      extractedText: '',
    });
    expect(result.success).toBe(false);
  });
});
