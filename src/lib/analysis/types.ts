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

export const AnalysisResultSchema = z.object({
  verdict: z.enum(['안전', '의심', '위험']),
  riskScore: z.number().min(0).max(100),
  redFlags: z.array(z.string()),
  explanation: z.string(),
  recommendedAction: z.string(),
});

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
