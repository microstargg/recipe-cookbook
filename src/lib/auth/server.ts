import { createNeonAuth } from "@neondatabase/auth/next/server";

function neonAuthCookieSecret(): string {
  const s = process.env.NEON_AUTH_COOKIE_SECRET?.trim();
  if (s && s.length >= 32) return s;
  if (process.env.VERCEL) {
    throw new Error(
      "NEON_AUTH_COOKIE_SECRET (≥32 characters) is required. Add it in Vercel → Project → Environment Variables, or in .env.local for local builds.",
    );
  }
  // Local `next build` / dev: deterministic placeholder. Replace in .env.local for real auth.
  return "0123456789abcdef0123456789abcdef";
}

export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: {
    secret: neonAuthCookieSecret(),
  },
});
