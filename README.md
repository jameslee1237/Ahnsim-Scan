# Ahnsim-Scan (안심스캔)

안심스캔 — AI-powered phishing/smishing detector for Korean SMS & email. Paste a message, get an instant risk verdict. No login, nothing stored.

## Status

✅ v1 complete and deployed. Full analysis pipeline (Gemini primary, Groq fallback on quota exhaustion), rate limiting, quota guard, bot verification, and the full UI.

✅ v2 adds screenshot upload (1-5 images) as a third input mode alongside SMS/email text — a single multimodal LLM call transcribes and analyzes the image in one pass. Gemini flash-lite handles images directly on the primary path; Groq's Llama 4 Scout is the image-capable fallback, distinct from the existing text-only `gpt-oss-20b` fallback used for SMS/email. No new environment variables were introduced.

- [Design spec](docs/superpowers/specs/2026-07-07-korean-scam-detector-design.md) — architecture, detection approach, security/privacy decisions
- [Implementation plan](docs/superpowers/plans/2026-07-07-korean-scam-detector-plan.md) — TDD task breakdown for v1
- [v2 design spec](docs/superpowers/specs/2026-07-13-v2-screenshot-analysis-and-ui-upgrade-design.md) — screenshot analysis + UI upgrade
- [v2 implementation plan](docs/superpowers/plans/2026-07-13-v2-screenshot-analysis-and-ui-upgrade-plan.md) — TDD task breakdown for v2

## Stack

Next.js 16 (App Router, Route Handlers only, no separate backend), Tailwind CSS, shadcn/ui, Zod, Google Gemini API (free tier) as the primary detection provider with Groq (free tier) as an automatic fallback when Gemini's daily quota is exhausted, Upstash Redis for rate limiting, Cloudflare Turnstile for bot protection. SMS/email text and screenshot images (up to 5 per submission) share this same provider pipeline — Gemini flash-lite and Groq's Llama 4 Scout both handle images multimodally, transcribing and analyzing in a single call. See the design spec for the full rationale, including the planned migration path to Claude Sonnet 5 as the service grows.

## Setup

1. Copy `.env.local.example` to `.env.local` and fill in:
   - `GEMINI_API_KEY` — from [Google AI Studio](https://aistudio.google.com/apikey)
   - `GROQ_API_KEY` — from [console.groq.com](https://console.groq.com) (free, no credit card) — used only as a fallback when Gemini's quota is exhausted
   - `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — from an [Upstash](https://upstash.com) Redis database (free tier)
   - `TURNSTILE_SECRET_KEY` / `NEXT_PUBLIC_TURNSTILE_SITE_KEY` — from the [Cloudflare Turnstile dashboard](https://dash.cloudflare.com/?to=/:account/turnstile)
2. Install dependencies: `pnpm install`
3. Run the dev server: `pnpm dev`
4. Run tests: `pnpm test`

## Deployment

Deploy to Vercel. Set all six environment variables above in the Vercel project settings before the first deploy. A missing `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` throws at module load (first request after cold start); a missing `GEMINI_API_KEY` or `TURNSTILE_SECRET_KEY` throws at request time, on the first call that needs it — both cases are caught by the route handler and returned as a sanitized 503, never a raw error page. A missing `GROQ_API_KEY` only surfaces once Gemini's quota is actually exhausted and the fallback tries to run.
