import 'server-only';
import { GoogleGenAI, Type } from '@google/genai';
import { AnalysisResultSchema, type AnalysisInput, type AnalysisResult } from './types';
import { SYSTEM_PROMPT, buildUserContent } from './systemPrompt';

// gemini-2.5-flash-lite is also an option if the free-tier quota on flash
// becomes a bottleneck — same responseSchema contract applies to both.
const MODEL_NAME = 'gemini-2.5-flash';
const MAX_OUTPUT_TOKENS = 800;

const getClient = (): GoogleGenAI => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }
  return new GoogleGenAI({ apiKey });
};

export const analyzeWithGemini = async (input: AnalysisInput): Promise<AnalysisResult> => {
  const ai = getClient();

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: buildUserContent(input),
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          verdict: {
            type: Type.STRING,
            enum: ['안전', '의심', '위험'],
            description: '판정 결과. riskScore와 반드시 일치해야 함 (0-30=안전, 31-70=의심, 71-100=위험).',
          },
          riskScore: {
            type: Type.NUMBER,
            description: '0에서 100 사이의 위험도 점수.',
          },
          redFlags: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '판정의 구체적인 근거가 된 의심 신호 목록. AI 조작 시도가 감지된 경우 이를 포함.',
          },
          explanation: {
            type: Type.STRING,
            description: '판정 이유에 대한 평이한 한국어 설명.',
          },
          recommendedAction: {
            type: Type.STRING,
            description: '사용자에게 권장하는 구체적인 다음 행동.',
          },
        },
        required: ['verdict', 'riskScore', 'redFlags', 'explanation', 'recommendedAction'],
      },
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error('Gemini returned an empty response');
  }

  const parsed = JSON.parse(text);
  return AnalysisResultSchema.parse(parsed);
};
