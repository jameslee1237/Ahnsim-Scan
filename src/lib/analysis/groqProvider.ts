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
const TEXT_MODEL_NAME = 'openai/gpt-oss-20b';
// Llama 4 Scout: Groq 무료 티어에서 이미지 입력을 지원하는 멀티모달 모델.
// strict structured output을 지원하지 않는다. 실제 API 호출로 확인한 결과
// (2026-07-14), bare `{ type: 'json_object' }`로는 이 스키마(6개 필드,
// redFlags 중첩 배열 포함)에 대해 재현 가능하게 실패했다 — riskScore가
// 숫자가 아닌 문자열("90")로 오고, explanation/recommendedAction 필드가
// 통째로 누락되는 경우가 3/3 재현되었다. 같은 스키마를 `{ type:
// 'json_schema', json_schema: { schema } }`로 (strict 없이) 전달하면
// 3/3 모두 올바른 타입과 전체 필드로 응답했다 — strict 모드는 지원하지
// 않아도 스키마 힌트 자체는 응답 형식을 크게 개선한다. 그래도 완전한
// 보장은 아니므로 스키마 준수의 최종 방어선은 여전히
// AnalysisResultSchema.parse()의 사후 검증이다. Groq 문서 기준 요청당
// 이미지 최대 5장, base64 이미지 총합 최대 4MB(디코딩 기준) — types.ts의
// MAX_IMAGES/MAX_TOTAL_IMAGES_DATA_URL_LENGTH가 이 한도에 맞춰져 있다.
//
// 이 모델명과 이미지 관련 한도는 2026-07-13 시점 Groq의 모델 카탈로그/
// vision 문서 기준이다 — 서드파티 추론 제공자의 모델 카탈로그와 무료 티어
// 조건은 시간이 지나며 바뀐다. 이 모델이 이름 변경/폐기되었거나 한도가
// 달라졌다면, 코드를 의심하기 전에 Groq의 현재 모델 목록
// (https://console.groq.com/docs/models)과 vision 문서
// (https://console.groq.com/docs/vision)를 먼저 확인하라.
const IMAGE_MODEL_NAME = 'meta-llama/llama-4-scout-17b-16e-instruct';

// gpt-oss 모델은 기본적으로 reasoning_effort: 'medium'으로 동작하며, 추론
// 토큰이 max_completion_tokens 예산을 content와 나눠 쓴다 (실제 테스트에서
// 348 토큰 중 144 토큰, 약 41%가 추론에 소모됨). Gemini의
// thinkingConfig.thinkingBudget: 0과 같은 목적으로 'low'로 낮추고, 그래도
// 남는 추론 오버헤드에 대비해 예산 자체도 여유 있게 잡는다 — 응답이 잘려
// 빈 문자열이 되면 폴백이 필요할 때 오히려 실패하게 된다. Llama 4 Scout는
// reasoning 모델이 아니므로 reasoning_effort 파라미터 자체를 보내지 않는다
// (이미지 분기에서는 아예 생략).
const MAX_OUTPUT_TOKENS_TEXT = 1500;
// extractedText(이미지 판독 전문)까지 함께 반환해야 하므로 텍스트 모드보다
// 여유 있게 잡는다.
const MAX_OUTPUT_TOKENS_IMAGE = 2000;

const RED_FLAG_JSON_SCHEMA = {
  type: 'object',
  properties: {
    flag: {
      type: 'string',
      description: '탐지된 의심 신호에 대한 설명.',
    },
    evidence: {
      type: 'string',
      description:
        '이 신호의 근거가 되는, 메시지 또는 이미지 판독 내용에 실제로 존재하는 정확한 인용문.',
    },
  },
  required: ['flag', 'evidence'],
  additionalProperties: false,
} as const;

const ANALYSIS_RESULT_JSON_SCHEMA = {
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
      items: RED_FLAG_JSON_SCHEMA,
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
    extractedText: {
      type: 'string',
      description:
        '이미지에서 판독한 원문. 텍스트 모드 입력이거나 이미지에서 메시지 내용을 전혀 찾을 수 없는 경우 빈 문자열.',
    },
  },
  required: ['verdict', 'riskScore', 'redFlags', 'explanation', 'recommendedAction', 'extractedText'],
  additionalProperties: false,
} as const;

const getClient = (): Groq => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not set');
  }
  return new Groq({ apiKey });
};

export const analyzeWithGroq = async (input: AnalysisInput): Promise<AnalysisResult> => {
  const groq = getClient();
  const isImage = input.type === 'image';

  const userContent = isImage
    ? [
        { type: 'text' as const, text: buildUserContent(input) },
        ...(input.type === 'image' ? input.images : []).map((image) => ({
          type: 'image_url' as const,
          image_url: { url: image },
        })),
      ]
    : buildUserContent(input);

  const response = await groq.chat.completions.create({
    model: isImage ? IMAGE_MODEL_NAME : TEXT_MODEL_NAME,
    max_completion_tokens: isImage ? MAX_OUTPUT_TOKENS_IMAGE : MAX_OUTPUT_TOKENS_TEXT,
    ...(isImage ? {} : { reasoning_effort: 'low' as const }),
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    // 이미지(Scout) 분기는 strict를 지원하지 않지만, 스키마 힌트 자체는
    // bare json_object보다 훨씬 안정적인 결과를 낸다(위 IMAGE_MODEL_NAME
    // 주석 참고) — 그래서 strict 여부만 다르고 스키마는 두 분기가 동일하게
    // 공유한다.
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'analysis_result',
        ...(isImage ? {} : { strict: true }),
        schema: ANALYSIS_RESULT_JSON_SCHEMA,
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
