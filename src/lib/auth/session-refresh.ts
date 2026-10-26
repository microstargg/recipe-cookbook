import { SignJWT, jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";
import { NEON_AUTH_BASE_URL, NEON_AUTH_COOKIE_SECRET, SESSION_CACHE_TTL_SECONDS } from "@/lib/auth/server";

/** Cookie names used by `@neondatabase/auth` (see its `server/constants`). */
const COOKIE_PREFIX = "__Secure-neon-auth";
export const SESSION_TOKEN_COOKIE = `${COOKIE_PREFIX}.session_token`;
const SESSION_CACHE_COOKIE = `${COOKIE_PREFIX}.local.session_data`;

type UpstreamSession = { session: { expiresAt: string } | null; user: { id: string } | null };

const secretKey = () => new TextEncoder().encode(NEON_AUTH_COOKIE_SECRET);

export async function hasValidSessionCache(request: NextRequest): Promise<boolean> {
  const value = request.cookies.get(SESSION_CACHE_COOKIE)?.value;
  if (!value) return false;
  try {
    await jwtVerify(value, secretKey(), { algorithms: ["HS256"] });
    return true;
  } catch {
    return false;
  }
}

/**
 * Re-checks the session with Neon Auth and re-mints the signed session cache cookie.
 *
 * The stock `auth.middleware()` only mints that cache on sign-in (it lasts 5 minutes), and it
 * drops the `Set-Cookie` Neon sends when it extends a session. Afterwards every server render
 * and every `/api/media` image asked Neon separately, and the browser cookie still expired
 * 7 days after sign-in however often the app was used. Here one upstream call per cache window
 * refreshes both, and a network blip no longer looks like being signed out.
 *
 * Returns null when the session is gone, so the caller can send the person to sign in.
 * `verified` is false when Neon could not be reached and the request was let through anyway.
 */
export async function refreshSession(
  request: NextRequest,
): Promise<{ response: NextResponse; verified: boolean } | null> {
  const neonCookies = request.cookies
    .getAll()
    .filter((c) => c.name.startsWith(COOKIE_PREFIX))
    .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
    .join("; ");

  let upstream: Response;
  try {
    upstream = await fetch(`${NEON_AUTH_BASE_URL}/get-session`, {
      headers: {
        Cookie: neonCookies,
        Origin: request.nextUrl.origin,
        "User-Agent": request.headers.get("user-agent") ?? "",
        "x-neon-auth-middleware": "true",
      },
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    console.error("[auth] get-session unreachable, letting the request through", err);
    return { response: NextResponse.next(), verified: false };
  }
  if (upstream.status >= 500 || upstream.status === 429) {
    console.error("[auth] get-session failed, letting the request through", upstream.status);
    return { response: NextResponse.next(), verified: false };
  }

  const data = (await upstream.json().catch(() => null)) as UpstreamSession | null;
  if (!upstream.ok || !data?.session || !data.user) return null;

  const expiresAt = Math.min(
    new Date(data.session.expiresAt).getTime(),
    Date.now() + SESSION_CACHE_TTL_SECONDS * 1000,
  );
  const cache = await new SignJWT(data as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt / 1000))
    .setSubject(data.user.id)
    .sign(secretKey());

  // Let this request's server render see the fresh cookies too, so it skips its own Neon call.
  const forwarded = new Map(
    request.cookies.getAll().map((c) => [c.name, encodeURIComponent(c.value)]),
  );
  for (const setCookie of upstream.headers.getSetCookie()) {
    const [name, ...value] = setCookie.split(";")[0].split("=");
    forwarded.set(name.trim(), value.join("="));
  }
  forwarded.set(SESSION_CACHE_COOKIE, cache);
  const headers = new Headers(request.headers);
  headers.set("cookie", [...forwarded].map(([n, v]) => `${n}=${v}`).join("; "));

  const response = NextResponse.next({ request: { headers } });
  // Pass Neon's cookies through untouched (as the /api/auth route does) so an extended
  // session also extends the cookie in the browser. Raw headers, not `response.cookies`,
  // which rewrites every Set-Cookie from its own name-keyed map.
  for (const setCookie of upstream.headers.getSetCookie()) {
    response.headers.append("Set-Cookie", setCookie);
  }
  const maxAge = Math.floor((expiresAt - Date.now()) / 1000);
  response.headers.append(
    "Set-Cookie",
    `${SESSION_CACHE_COOKIE}=${cache}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`,
  );
  return { response, verified: true };
}
