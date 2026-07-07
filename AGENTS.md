<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 안심스캔 (Ahnsim-scan)

Korean SMS/email phishing detector. User pastes a message, an LLM returns a risk verdict. Anonymous, no database, no accounts. Full architecture and rationale: `docs/superpowers/specs/2026-07-07-korean-scam-detector-design.md`. Task-by-task build plan: `docs/superpowers/plans/2026-07-07-korean-scam-detector-plan.md`.

## Stack

Next.js 16 (App Router, Route Handlers only, no separate backend), React 19, TypeScript, Tailwind CSS v4, Zod, `@google/genai` (Gemini free tier), `@upstash/redis` + `@upstash/ratelimit`, Cloudflare Turnstile, Vitest. Node pinned to 24.18.0 via `.nvmrc` — Vitest 4/rolldown does not run on Node <22.12.

## Commands

- `npm run dev` — start dev server
- `npm test` — run Vitest once (not watch mode)
- `npm run build` — production build
- `npm run lint` — ESLint

## Project structure

- `src/app/api/analyze/route.ts` — the only backend endpoint
- `src/lib/analysis/` — types, system prompt, LLM provider (`analyzeMessage()` is the swap point for changing providers)
- `src/lib/security/` — rate limiting, quota guard, Turnstile verification
- `src/components/` — form, result card, privacy notice

## Code style

Arrow functions assigned to `const`, never `function` declarations — including components and route handlers:

```ts
export const checkIpRateLimit = async (ip: string) => { /* ... */ };
export const AnalyzeForm = ({ onResult }: IAnalyzeFormProps) => { /* ... */ };
```

Styling is Tailwind utility classes only — no `style={{}}`.

## Testing

Vitest, TDD (write the failing test first). Tests live next to source as `*.test.ts`. Mock external calls (`@google/genai`, `@upstash/redis`, `fetch`) with `vi.mock` — never hit real APIs in tests.

## Boundaries

**Never:**
- Log message content (`messageBody`, `subject`, `body`, `senderNumber`, `senderAddress`, `explanation`) anywhere — not console, not error objects
- Import `src/lib/analysis/{systemPrompt,provider,geminiProvider}.ts` or anything under `src/lib/security/` from a `'use client'` component — they're `server-only` for a reason
- Render LLM-derived text with `dangerouslySetInnerHTML`
- Push or commit directly to `main` or `develop`

**Always:**
- Wrap user-supplied message content in `<message_to_analyze>` tags in prompts sent to the LLM, and instruct the model to treat it as data, never instructions
- Validate all `/api/analyze` input against the Zod schemas in `src/lib/analysis/types.ts` before use
- Work on a branch cut from `develop` (e.g. `task-N-<name>`), push it, then stop — a human reviews and squash-merges via GitHub PR

**Ask first:**
- Before adding a new npm dependency
- Before changing a rate-limit or quota threshold value in a commit meant to ship (temporary local edits for manual testing, e.g. the plan's Task 15 verification steps, are fine without asking)
