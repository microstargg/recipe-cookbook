import { createNeonAuth } from "@neondatabase/auth/next/server";

const BUILD_TIME_COOKIE_PLACEHOLDER = "0123456789abcdef0123456789abcdef";

function neonAuthCookieSecret(): string {
  const s = process.env.NEON_AUTH_COOKIE_SECRET?.trim();
  if (s && s.length >= 32) return s;

  // `next build` on Vercel sets VERCEL=1 but env may be missing until you add it for all targets.
  // During `npm run build`, npm_lifecycle_event is "build"; at serverless runtime it is unset.
  const isInstallOrBuildStep =
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.npm_lifecycle_event === "build";

  if (isInstallOrBuildStep) {
    return BUILD_TIME_COOKIE_PLACEHOLDER;
  }

  if (process.env.VERCEL) {
    throw new Error(
      "NEON_AUTH_COOKIE_SECRET (≥32 characters) is required at runtime. Add it in Vercel → Project → Environment Variables for Production (and Preview if you use it).",
    );
  }

  // Local dev / `next start` without .env: replace in .env.local for real auth.
  return BUILD_TIME_COOKIE_PLACEHOLDER;
}

export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: {
    secret: neonAuthCookieSecret(),
  },
});
