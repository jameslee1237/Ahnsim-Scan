# Ahnsim-Scan (안심스캔)

안심스캔 — AI-powered phishing/smishing detector for Korean SMS & email. Paste a message, get an instant risk verdict. No login, nothing stored.

## Status

🚧 Backend complete (analysis pipeline, rate limiting, quota guard, bot verification, API route). Frontend in progress.

- [Design spec](docs/superpowers/specs/2026-07-07-korean-scam-detector-design.md) — architecture, detection approach, security/privacy decisions
- [Implementation plan](docs/superpowers/plans/2026-07-07-korean-scam-detector-plan.md) — TDD task breakdown for v1

## Stack

Next.js 16 (App Router, Route Handlers only, no separate backend), Tailwind CSS, Zod, Google Gemini API (free tier) for detection, Upstash Redis for rate limiting, Cloudflare Turnstile for bot protection. See the design spec for the full rationale, including the planned migration path to Claude Sonnet 5 as the service grows.

## Setup

1. Copy `.env.local.example` to `.env.local` and fill in:
   - `GEMINI_API_KEY` — from [Google AI Studio](https://aistudio.google.com/apikey)
   - `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — from an [Upstash](https://upstash.com) Redis database (free tier)
   - `TURNSTILE_SECRET_KEY` / `NEXT_PUBLIC_TURNSTILE_SITE_KEY` — from the [Cloudflare Turnstile dashboard](https://dash.cloudflare.com/?to=/:account/turnstile)
2. Install dependencies: `pnpm install`
3. Run the dev server: `pnpm dev`
4. Run tests: `pnpm test`

## Deployment

Deploy to Vercel. Set all five environment variables above in the Vercel project settings before the first deploy. A missing `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` throws at module load (first request after cold start); a missing `GEMINI_API_KEY` or `TURNSTILE_SECRET_KEY` throws at request time, on the first call that needs it — both cases are caught by the route handler and returned as a sanitized 503, never a raw error page.
