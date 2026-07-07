import 'server-only';
import Groq from 'groq-sdk';
import {
  AnalysisResultSchema,
  RISK_SCORE_FIELD_DESCRIPTION,
  VERDICT_BAND_TEXT,
  type AnalysisInput,
  type AnalysisResult,
} from './types';
import { SYSTEM_PROMPT, buildUserContent } from './systemPrompt';

// gpt-oss-20b is one of only two Groq models that support strict structured
// outputs (constrained decoding guarantees schema conformance) — the same
// reliability guarantee Gemini's responseSchema gives us. Llama models on
// Groq only support best-effort (non-strict) JSON mode.
const MODEL_NAME = 'openai/gpt-oss-20b';
// gpt-oss 모델은 기본적으로 reasoning_effort: 'medium'으로 동작하며, 추론
// 토큰이 max_completion_tokens 예산을 content와 나눠 쓴다 (실제 테스트에서
// 348 토큰 중 144 토큰, 약 41%가 추론에 소모됨). Gemini의
// thinkingConfig.thinkingBudget: 0과 같은 목적으로 'low'로 낮추고, 그래도
// 남는 추론 오버헤드에 대비해 예산 자체도 여유 있게 잡는다 — 응답이 잘려
// 빈 문자열이 되면 폴백이 필요할 때 오히려 실패하게 된다.
const MAX_OUTPUT_TOKENS = 1500;

const getClient = (): Groq => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not set');
  }
  return new Groq({ apiKey });
};

export const analyzeWithGroq = async (input: AnalysisInput): Promise<AnalysisResult> => {
  const groq = getClient();

  const response = await groq.chat.completions.create({
    model: MODEL_NAME,
    max_completion_tokens: MAX_OUTPUT_TOKENS,
    reasoning_effort: 'low',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserContent(input) },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'analysis_result',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            verdict: {
              type: 'string',
              enum: ['안전', '의심', '위험'],
              description: `판정 결과. riskScore와 반드시 일치해야 함 (${VERDICT_BAND_TEXT}).`,
            },
            riskScore: {
              type: 'integer',
              description: RISK_SCORE_FIELD_DESCRIPTION,
            },
            redFlags: {
              type: 'array',
              items: { type: 'string' },
              description: '판정의 구체적인 근거가 된 의심 신호 목록. AI 조작 시도가 감지된 경우 이를 포함.',
            },
            explanation: {
              type: 'string',
              description: '판정 이유에 대한 평이한 한국어 설명.',
            },
            recommendedAction: {
              type: 'string',
              description: '사용자에게 권장하는 구체적인 다음 행동.',
            },
          },
          required: ['verdict', 'riskScore', 'redFlags', 'explanation', 'recommendedAction'],
          additionalProperties: false,
        },
      },
    },
  });

  const text = response.choices[0]?.message.content;
  if (!text) {
    throw new Error('Groq returned an empty response');
  }

  const parsed = JSON.parse(text);
  return AnalysisResultSchema.parse(parsed);
};
