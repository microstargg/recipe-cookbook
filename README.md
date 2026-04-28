# Ben's Cookbook

Personal recipe app: manual recipes, URL import (JSON-LD + fallbacks), AI photo import, export. **Neon** (DB + Auth), **Vercel Blob** (images), **Together.ai** via the **Vercel AI SDK** (`@ai-sdk/togetherai`) for text/vision.

## Environment variables

| Variable | Where it comes from |
|----------|---------------------|
| `DATABASE_URL` | Neon dashboard (pooled/serverless string). |
| `NEON_AUTH_BASE_URL` | Neon → Auth (your Auth service URL). |
| `NEON_AUTH_COOKIE_SECRET` | You generate (32+ chars), e.g. `openssl rand -base64 32`. |
| **`BLOB_READ_WRITE_TOKEN`** | **Vercel** → your project → **Storage** → **Blob** → create store → copy the **read/write** token. Not from the AI SDK — it only stores uploaded image files. |
| **`TOGETHER_API_KEY`** | **[together.ai](https://api.together.ai/)** → API keys (free credits / trial). Used by `ai` + `@ai-sdk/togetherai` in code. |
| `TOGETHER_TEXT_MODEL` | Optional. Default: `meta-llama/Llama-3.3-70B-Instruct-Turbo` (serverless; best for structured recipe extraction). |
| `TOGETHER_VISION_MODEL` | Optional. Default: `Llama-Vision-Free` (photo → recipe; free tier, stricter rate limits). |
| `IMPORT_DISABLE_JINA` | Optional. Set to `1` to skip **r.jina.ai** when direct fetch gets 403 (some sites block cloud IPs). If you disable it, those URLs may fail unless they allow your server. When the fallback runs, the recipe URL is retrieved through Jina’s HTML reader. |

You do **not** need `OPENAI_API_KEY` unless you switch the code back to OpenAI.

## Quick start

1. Copy `.env.example` to `.env.local` and fill the variables above.

2. Push DB schema: `npm run db:push`

3. Sign up via Neon Auth at `/auth/sign-in` (or `/auth/sign-up`).

4. `npm run dev`

## Deploy (Vercel)

Set the same env vars in the Vercel project. Enable **Blob** and attach the token. Nothing routes “through” the Vercel AI Gateway unless you add that separately — the app calls **Together’s API** using your `TOGETHER_API_KEY`.

## Notes

- If Vercel shows **`MIDDLEWARE_INVOCATION_FAILED`** / proxy errors with Neon Auth, confirm **`NEON_AUTH_BASE_URL`** and **`NEON_AUTH_COOKIE_SECRET`** (≥32 chars) are set for **Production** (and Preview). This app uses **`src/proxy.ts`** (Next.js 16 **Node** runtime), not Edge `middleware.ts`, because Neon’s session proxy needs full `fetch` / `Set-Cookie` handling.
- A generic **500 / Internal Server Error** on normal page loads almost always means **`NEON_AUTH_COOKIE_SECRET` is missing or shorter than 32 characters** in the Vercel environment (the proxy imports auth config on first hit). Check **Functions** logs for the thrown message.
- URL import prefers `schema.org/Recipe` in JSON-LD; plain-text fallback can call Together when `TOGETHER_API_KEY` is set.
- Sites that block server IPs (e.g. **Allrecipes** → HTTP 403) use an optional **read proxy** ([r.jina.ai](https://r.jina.ai)) with HTML return format so imports still work; you’ll see a short note on the draft. Set `IMPORT_DISABLE_JINA=1` if you must not use that path.
- Photo import uploads to Blob, then runs a vision model; always review before saving.
- If `Llama-Vision-Free` is slow or rate-limited, set `TOGETHER_VISION_MODEL` to e.g. `meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo` in the dashboard (paid/usage-based).
