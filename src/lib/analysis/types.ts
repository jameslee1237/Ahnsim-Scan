import { z } from 'zod';

export const MAX_INPUT_LENGTH = 2000;

export const SmsInputSchema = z.object({
  type: z.literal('sms'),
  senderNumber: z.string().min(1).max(50),
  messageBody: z.string().min(5).max(MAX_INPUT_LENGTH),
});

export const EmailInputSchema = z.object({
  type: z.literal('email'),
  senderAddress: z.string().min(1).max(200),
  subject: z.string().max(500),
  body: z.string().min(5).max(MAX_INPUT_LENGTH),
});

// data:image/jpeg;base64,... 형태의 데이터 URL만 허용한다. 클라이언트의
// canvas.toDataURL('image/jpeg', ...) 출력과 정확히 일치하는 형식이며, MIME
// 타입 자체를 정규식으로 검증해 임의 문자열이 이미지인 척 통과하는 것을 막는다.
export const IMAGE_DATA_URL_PATTERN = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+=*)$/;

// Groq Llama 4 Scout(이미지 분석의 폴백 provider, groqProvider.ts)의 "요청당
// 이미지 최대 5장" 한도와 동일하게 맞춘다 — 어느 쪽이든 이 이상은 어차피
// 처리할 수 없다.
export const MAX_IMAGES = 5;
// 개별 이미지 상한(base64 문자열 길이, 원본 약 900KB 상당) — 다운스케일된
// 이미지(클라이언트 목표 ~400KB)가 예상보다 커지는 경우에도 이미지 하나가
// 전체 상한을 독점하지 못하도록 막는 1차 방어선. 서버는 클라이언트의
// 다운스케일 결과를 신뢰하지 않고 이 상한으로 독립 재검증한다.
export const MAX_SINGLE_IMAGE_DATA_URL_LENGTH = 1_200_000;
// 전체 이미지 합산 상한(base64 문자열 길이 합) — 두 개의 독립적인 실측
// 한도를 함께 만족하도록 여유 있게 설정: Groq Llama 4 Scout의 "요청당
// base64 이미지 4MB(디코딩 기준)" 한도, Vercel 함수의 "요청 바디 4.5MB"
// 한도. base64는 원본 대비 약 1.33배 커지므로, 이 문자열 길이 합이 대략
// 디코딩 바이트 수와 비슷한 자릿수라 두 한도 모두에 여유를 남긴다.
//
// 이 값은 MAX_IMAGES × MAX_SINGLE_IMAGE_DATA_URL_LENGTH(5 × 1,200,000 =
// 6,000,000)보다 작다 — 의도적이다. 개별 상한은 "이미지 하나가 상한을
// 독점하지 못하게" 막는 1차 방어선일 뿐이고, 실제 총량을 묶는 것은 이
// 전체 합산 상한이다. 즉 모든 이미지가 개별 상한에 가깝게 큰 경우 이
// 합산 상한이 먼저 걸려 거부되는 것이 정상 동작이며, 세 상수 사이에
// 산술적 정합성(개별×개수 ≤ 합산)을 맞출 필요는 없다.
export const MAX_TOTAL_IMAGES_DATA_URL_LENGTH = 4_000_000;

export const ImageInputSchema = z.object({
  type: z.literal('image'),
  images: z
    .array(z.string().regex(IMAGE_DATA_URL_PATTERN).max(MAX_SINGLE_IMAGE_DATA_URL_LENGTH))
    .min(1)
    .max(MAX_IMAGES),
});

// z.discriminatedUnion의 멤버는 일반 ZodObject여야 하며 .refine()이 붙은
// ZodEffects는 멤버로 쓸 수 없다 — 그래서 이미지 전체 합산 크기 검증은
// ImageInputSchema 자체가 아니라 union을 만든 뒤 아래에서 superRefine으로
// 붙인다 (AnalysisResultSchema가 riskScore/verdict 교차 검증에 쓰는 것과
// 같은 패턴).
export const AnalysisInputSchema = z
  .discriminatedUnion('type', [SmsInputSchema, EmailInputSchema, ImageInputSchema])
  .superRefine((data, ctx) => {
    if (data.type !== 'image') return;
    const totalLength = data.images.reduce((sum, image) => sum + image.length, 0);
    if (totalLength > MAX_TOTAL_IMAGES_DATA_URL_LENGTH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `이미지 전체 용량이 너무 큽니다 (최대 ${MAX_TOTAL_IMAGES_DATA_URL_LENGTH}자)`,
        path: ['images'],
      });
    }
  });

export type SmsInput = z.infer<typeof SmsInputSchema>;
export type EmailInput = z.infer<typeof EmailInputSchema>;
export type ImageInput = z.infer<typeof ImageInputSchema>;
export type AnalysisInput = z.infer<typeof AnalysisInputSchema>;

// riskScore가 verdict의 문서화된 구간과 실제로 일치하는지 재검증한다.
// 시스템 프롬프트가 이 일관성을 명시적으로 요구하지만, 모델이 스스로의
// 지시를 어길 수 있다는 것을 실제로 확인했다 — Groq gpt-oss-20b가 verdict
// "위험"에 riskScore 0.92(0-100이 아닌 0-1 비율)를 반환한 사례가 있었고,
// 이는 min(0)/max(100) 범위 검사만으로는 걸러지지 않는다.
//
// 이 구간 값은 systemPrompt.ts와 두 provider(geminiProvider.ts,
// groqProvider.ts)의 JSON 스키마 설명 문구에도 등장한다 — 하드코딩된 문자열
// 4곳이 서로 어긋날 위험을 피하기 위해, 여기서 내보낸 텍스트를 세 곳 모두
// 그대로 가져다 쓴다(스키마 표현 자체는 SDK별로 다를 수밖에 없어 구조까지
// 공유하지는 않는다).
export const VERDICT_RISK_SCORE_RANGES: Record<'안전' | '의심' | '위험', readonly [number, number]> = {
  안전: [0, 30],
  의심: [31, 70],
  위험: [71, 100],
};

export const VERDICT_BAND_TEXT = Object.entries(VERDICT_RISK_SCORE_RANGES)
  .map(([verdict, [min, max]]) => `${min}-${max} ${verdict}`)
  .join(', ');

export const RISK_SCORE_FIELD_DESCRIPTION =
  '0에서 100 사이의 정수 위험도 점수 (예: 85). 0에서 1 사이의 비율이 아님.';

// v1의 redFlags: string[]에서 구조화된 형태로 바뀐 것 — evidence 필드가
// "실제로 원문에 있는 문구만 인용할 것"을 스키마 수준에서 강제해, 프롬프트
// 지시만으로 막던 신호 날조(예: 존재하지 않는 "암시적 긴급성")를 구조적으로
// 어렵게 만든다. 동시에 이 evidence 문자열이 ResultCard의 인라인
// 하이라이트(하이라이트 대상 문자열 매칭)의 데이터 소스가 된다.
export const RedFlagSchema = z.object({
  flag: z.string(),
  evidence: z.string(),
});

export type RedFlag = z.infer<typeof RedFlagSchema>;

export const AnalysisResultSchema = z
  .object({
    verdict: z.enum(['안전', '의심', '위험']),
    riskScore: z.number().int().min(0).max(100),
    redFlags: z.array(RedFlagSchema),
    explanation: z.string(),
    recommendedAction: z.string(),
    // 이미지 모드에서 모델이 판독한 원문. 텍스트 모드 입력이거나 이미지에서
    // 메시지 내용을 전혀 찾을 수 없는 경우 항상 빈 문자열('') — 후자의
    // 경우 route handler가 빈 문자열을 판독 실패로 취급해 별도 에러를
    // 반환한다(별도 Task에서 처리).
    extractedText: z.string(),
  })
  .superRefine((data, ctx) => {
    const [min, max] = VERDICT_RISK_SCORE_RANGES[data.verdict];
    if (data.riskScore < min || data.riskScore > max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `riskScore ${data.riskScore} does not match verdict "${data.verdict}" (expected ${min}-${max})`,
        path: ['riskScore'],
      });
    }
  });

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
