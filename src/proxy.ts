import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth/server";

/**
 * Next.js 16+: use `proxy.ts` (Node.js runtime), not Edge `middleware.ts`.
 * Neon Auth calls `fetch()` + `Headers#getSetCookie()` on the response; that API is unreliable
 * on Vercel Edge and often yields `MIDDLEWARE_INVOCATION_FAILED` / 500.
 */
const runAuth = auth.middleware({ loginUrl: "/auth/sign-in" });

export async function proxy(request: NextRequest) {
  return runAuth(request);
}

export const config = {
  matcher: [
    {
      // Do not exclude all of `/auth`: Neon Auth must run here for OAuth verifier exchange on
      // paths like `/auth/callback?…`. Skip lists inside `auth.middleware()` already allow sign-in and friends.
      source: "/((?!api|_next/static|_next/image|favicon.ico|icon.svg).*)",
      // Server Actions send `next-action`; auth redirects break the action response
      // (HTML/302 instead of `text/x-component`).
      missing: [{ type: "header", key: "next-action" }],
    },
  ],
};
