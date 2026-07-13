import 'server-only';
import { GoogleGenAI, Type } from '@google/genai';
import {
  AnalysisResultSchema,
  RISK_SCORE_FIELD_DESCRIPTION,
  VERDICT_BAND_TEXT,
  type AnalysisInput,
  type AnalysisResult,
} from './types';
import { parseImageDataUrl } from './imageDataUrl';
import { SYSTEM_PROMPT, buildUserContent } from './systemPrompt';

// flash-lite documents a materially larger free-tier daily quota than flash
// (and this project's actual observed flash quota — 20 req/day on this
// project — was far below either model's documented figures, worth
// re-checking against the Google AI Studio console). Same responseSchema
// contract applies to both, so this is a same-behavior swap.
const MODEL_NAME = 'gemini-2.5-flash-lite';
// v1은 800이었다 — redFlags가 이제 짧은 라벨 문자열이 아니라 각 항목마다
// evidence(원문 인용문)까지 포함하는 객체 배열이라, 신호가 여러 개인
// 메시지는 출력 크기가 v1보다 커질 수 있다. 잘림 위험을 줄이기 위해
// 여유를 두고 올렸다.
const MAX_OUTPUT_TOKENS_TEXT = 1200;
// extractedText(이미지 판독 전문)까지 함께 반환해야 하므로 텍스트 모드보다
// 더 여유 있게 잡는다. Groq 쪽 이미지 예산(groqProvider.ts의
// MAX_OUTPUT_TOKENS_IMAGE)과 동일한 값으로 맞춰 두 provider 간 여유
// 수준을 일관되게 유지한다.
const MAX_OUTPUT_TOKENS_IMAGE = 2000;

const getClient = (): GoogleGenAI => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }
  return new GoogleGenAI({ apiKey });
};

export const analyzeWithGemini = async (input: AnalysisInput): Promise<AnalysisResult> => {
  const ai = getClient();

  const contents =
    input.type === 'image'
      ? [
          buildUserContent(input),
          ...input.images.map((image) => {
            const { mimeType, data } = parseImageDataUrl(image);
            return { inlineData: { mimeType, data } };
          }),
        ]
      : buildUserContent(input);

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      maxOutputTokens: input.type === 'image' ? MAX_OUTPUT_TOKENS_IMAGE : MAX_OUTPUT_TOKENS_TEXT,
      // 고정된 스키마로 판정만 내리는 분류 작업이라 별도의 사고 과정이 필요 없으며,
      // thinking을 켜두면 maxOutputTokens 예산을 내부 추론과 나눠 써서 응답이 잘릴 수 있다.
      thinkingConfig: { thinkingBudget: 0 },
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          verdict: {
            type: Type.STRING,
            enum: ['안전', '의심', '위험'],
            description: `판정 결과. riskScore와 반드시 일치해야 함 (${VERDICT_BAND_TEXT}).`,
          },
          riskScore: {
            type: Type.INTEGER,
            description: RISK_SCORE_FIELD_DESCRIPTION,
          },
          redFlags: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                flag: { type: Type.STRING, description: '탐지된 의심 신호에 대한 설명.' },
                evidence: {
                  type: Type.STRING,
                  description:
                    '이 신호의 근거가 되는, 메시지 또는 이미지 판독 내용에 실제로 존재하는 정확한 인용문.',
                },
              },
              required: ['flag', 'evidence'],
            },
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
          extractedText: {
            type: Type.STRING,
            description:
              '이미지에서 판독한 원문. 텍스트 모드 입력이거나 이미지에서 메시지 내용을 전혀 찾을 수 없는 경우 빈 문자열.',
          },
        },
        required: ['verdict', 'riskScore', 'redFlags', 'explanation', 'recommendedAction', 'extractedText'],
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
