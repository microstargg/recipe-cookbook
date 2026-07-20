# Ben's Cookbook

Personal recipe app: manual recipes, URL import (JSON-LD + fallbacks), AI photo import, export. **Neon** (DB + Auth), **Vercel Blob** (images), **Google Gemini** via the **Vercel AI SDK** (`@ai-sdk/google`) for text/vision.

## Environment variables

| Variable | Where it comes from |
|----------|---------------------|
| `DATABASE_URL` | Neon dashboard (pooled/serverless string). |
| `NEON_AUTH_BASE_URL` | Neon → Auth (your Auth service URL). |
| `NEON_AUTH_COOKIE_SECRET` | You generate (32+ chars), e.g. `openssl rand -base64 32`. |
| **`BLOB_READ_WRITE_TOKEN`** | **Vercel** → your project → **Storage** → **Blob** → create store → copy the **read/write** token. Not from the AI SDK — it only stores uploaded image files. |
| **`GOOGLE_GENERATIVE_AI_API_KEY`** | **[Google AI Studio](https://aistudio.google.com/apikey)** (free). Used by `ai` + `@ai-sdk/google` for photo import and URL text fallback. |
| `GEMINI_TEXT_MODEL` | Optional. Default: `gemini-3.5-flash`. |
| `GEMINI_VISION_MODEL` | Optional. Default: `gemini-3.5-flash`. |
| `IMPORT_DISABLE_JINA` | Optional. Set to `1` to skip **r.jina.ai** when direct fetch gets 403 (some sites block cloud IPs). If you disable it, those URLs may fail unless they allow your server. When the fallback runs, the recipe URL is retrieved through Jina’s HTML reader. |

You do **not** need Together.ai or OpenAI keys for the default setup.

## Quick start

1. Copy `.env.example` to `.env.local` and fill the variables above.

2. Push DB schema: `npm run db:push`

3. Sign up via Neon Auth at `/auth/sign-in` (or `/auth/sign-up`).

4. `npm run dev`

## Deploy (Vercel)

Set the same env vars in the Vercel project. Enable **Blob** and attach the token. Photo/URL AI calls go to **Google Gemini** with your `GOOGLE_GENERATIVE_AI_API_KEY`.

## Notes

- **`Invalid origin`** on sign-in: in Neon **Auth → Configuration → Domains**, add the **exact** URL users open in the browser (`https://…vercel.app` **and** any custom domain, **www** vs apex are different). Use Auth settings for the **same branch** as your `NEON_AUTH_BASE_URL`. In DevTools → Network, inspect the failing `/api/auth/…` request: the **`Origin`** (or **`Referer`** host) must be allowlisted. Preview URLs need their own domain entries unless you use the Neon–Vercel integration that adds them automatically.
- If Vercel shows **`MIDDLEWARE_INVOCATION_FAILED`** / proxy errors with Neon Auth, confirm **`NEON_AUTH_BASE_URL`** and **`NEON_AUTH_COOKIE_SECRET`** (≥32 chars) are set for **Production** (and Preview). This app uses **`src/proxy.ts`** (Next.js 16 **Node** runtime), not Edge `middleware.ts`, because Neon’s session proxy needs full `fetch` / `Set-Cookie` handling.
- A generic **500 / Internal Server Error** on normal page loads almost always means **`NEON_AUTH_COOKIE_SECRET` is missing or shorter than 32 characters** in the Vercel environment (the proxy imports auth config on first hit). Check **Functions** logs for the thrown message.
- URL import prefers `schema.org/Recipe` in JSON-LD; plain-text fallback can call Gemini when `GOOGLE_GENERATIVE_AI_API_KEY` is set.
- Sites that block server IPs (e.g. **Allrecipes** → HTTP 403) use an optional **read proxy** ([r.jina.ai](https://r.jina.ai)) with HTML return format so imports still work; you’ll see a short note on the draft. Set `IMPORT_DISABLE_JINA=1` if you must not use that path.
- Photo import uploads to Blob, then runs Gemini vision; always review before saving.
