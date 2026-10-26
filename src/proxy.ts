import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/server";
import { hasValidSessionCache, refreshSession, SESSION_TOKEN_COOKIE } from "@/lib/auth/session-refresh";

/**
 * Next.js 16+: use `proxy.ts` (Node.js runtime), not Edge `middleware.ts`.
 * Neon Auth calls `fetch()` + `Headers#getSetCookie()` on the response; that API is unreliable
 * on Vercel Edge and often yields `MIDDLEWARE_INVOCATION_FAILED` / 500.
 */
const runAuth = auth.middleware({ loginUrl: "/auth/sign-in" });

/** Forms that only make sense signed out; a home-screen shortcut saved on one kept reopening it. */
const SIGNED_OUT_PAGES = ["/auth/sign-in", "/auth/sign-up"];

function appDestination(request: NextRequest): URL {
  const to = request.nextUrl.searchParams.get("redirectTo");
  const safe = to?.startsWith("/") && !to.startsWith("//") ? to : "/plan";
  return new URL(safe, request.url);
}

export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  // Invite links must open while signed out; the page itself sends people to sign up and back.
  if (pathname.startsWith("/invite/")) return NextResponse.next();

  const hasToken = request.cookies.has(SESSION_TOKEN_COOKIE);

  if (SIGNED_OUT_PAGES.includes(pathname) && hasToken) {
    if (await hasValidSessionCache(request)) {
      return NextResponse.redirect(appDestination(request));
    }
    const refreshed = await refreshSession(request);
    if (refreshed?.verified) {
      const redirect = NextResponse.redirect(appDestination(request));
      for (const c of refreshed.response.headers.getSetCookie()) redirect.headers.append("Set-Cookie", c);
      return redirect;
    }
    return runAuth(request);
  }

  // Sign-in pages, OAuth callbacks, signed-out visitors and fresh session caches: the stock
  // middleware handles these without calling Neon.
  const needsRefresh =
    !pathname.startsWith("/auth/") &&
    !searchParams.has("neon_auth_session_verifier") &&
    hasToken &&
    !(await hasValidSessionCache(request));
  if (!needsRefresh) return runAuth(request);

  const refreshed = await refreshSession(request);
  if (refreshed) return refreshed.response;
  // Session is gone: the stock middleware asks Neon again and redirects to sign-in.
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
