import 'server-only';
import type { AnalysisInput, AnalysisResult } from './types';
import { analyzeWithGemini } from './geminiProvider';

// v1: only Gemini is wired up. When migrating to Claude Sonnet 5, add
// claudeProvider.ts implementing the same (input) => Promise<AnalysisResult>
// signature and swap the call below — no caller of analyzeMessage() changes.
export const analyzeMessage = async (input: AnalysisInput): Promise<AnalysisResult> => {
  return analyzeWithGemini(input);
};
