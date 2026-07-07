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

export const AnalysisInputSchema = z.discriminatedUnion('type', [
  SmsInputSchema,
  EmailInputSchema,
]);

export type SmsInput = z.infer<typeof SmsInputSchema>;
export type EmailInput = z.infer<typeof EmailInputSchema>;
export type AnalysisInput = z.infer<typeof AnalysisInputSchema>;

// riskScore가 verdict의 문서화된 구간과 실제로 일치하는지 재검증한다.
// 시스템 프롬프트가 이 일관성을 명시적으로 요구하지만, 모델이 스스로의
// 지시를 어길 수 있다는 것을 실제로 확인했다 — Groq gpt-oss-20b가 verdict
// "위험"에 riskScore 0.92(0-100이 아닌 0-1 비율)를 반환한 사례가 있었고,
// 이는 min(0)/max(100) 범위 검사만으로는 걸러지지 않는다.
const VERDICT_RISK_SCORE_RANGES: Record<'안전' | '의심' | '위험', readonly [number, number]> = {
  안전: [0, 30],
  의심: [31, 70],
  위험: [71, 100],
};

export const AnalysisResultSchema = z
  .object({
    verdict: z.enum(['안전', '의심', '위험']),
    riskScore: z.number().int().min(0).max(100),
    redFlags: z.array(z.string()),
    explanation: z.string(),
    recommendedAction: z.string(),
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
