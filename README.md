# Ahnsim-Scan (안심스캔)

안심스캔 — AI-powered phishing/smishing detector for Korean SMS & email. Paste a message, get an instant risk verdict. No login, nothing stored.

## Status

🚧 Design and implementation plan complete, implementation starting.

- [Design spec](docs/superpowers/specs/2026-07-07-korean-scam-detector-design.md) — architecture, detection approach, security/privacy decisions
- [Implementation plan](docs/superpowers/plans/2026-07-07-korean-scam-detector-plan.md) — TDD task breakdown for v1

## Stack

Next.js 16 (App Router, Route Handlers only, no separate backend), Tailwind CSS, Zod, Google Gemini API (free tier) for detection, Upstash Redis for rate limiting, Cloudflare Turnstile for bot protection. See the design spec for the full rationale, including the planned migration path to Claude Sonnet 5 as the service grows.

Setup and run instructions will be added here once the app is scaffolded (plan Task 10).
