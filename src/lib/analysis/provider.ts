import 'server-only';
import { ApiError } from '@google/genai';
import type { AnalysisInput, AnalysisResult } from './types';
import { analyzeWithGemini } from './geminiProvider';
import { analyzeWithGroq } from './groqProvider';

// Gemini의 무료 티어 일일/분당 할당량이 소진되면(429/RESOURCE_EXHAUSTED)
// Groq(gpt-oss-20b, 별도의 독립적인 무료 할당량)로 폴백한다 — 두 공급자의
// 무료 한도를 합쳐 전체 처리량을 늘리기 위함이다. 그 외의 에러(형식 오류,
// 네트워크 문제 등)는 폴백하지 않고 그대로 던진다 — 진짜 버그를 조용한
// 폴백 뒤에 숨기지 않기 위해서다.
const isGeminiQuotaExhausted = (err: unknown): boolean => {
  return err instanceof ApiError && err.status === 429;
};

export const analyzeMessage = async (input: AnalysisInput): Promise<AnalysisResult> => {
  try {
    return await analyzeWithGemini(input);
  } catch (err) {
    if (!isGeminiQuotaExhausted(err)) {
      throw err;
    }
    return analyzeWithGroq(input);
  }
};
