/**
 * Neon Auth (Better Auth) rejects API calls with "Invalid origin" when the Origin header
 * is missing, null, or not in the trusted allowlist. On Vercel, forwarded host/proto are
 * authoritative when the client did not send a usable Origin.
 */
export function normalizeAuthRequestOrigin(request: Request): Request {
  if (!process.env.VERCEL) {
    return request;
  }

  const headers = new Headers(request.headers);
  const rawOrigin = headers.get("origin");
  const fromReferer =
    headers.get("referer")?.split("/").slice(0, 3).join("/") || "";
  const derived =
    rawOrigin && rawOrigin !== "null" ? rawOrigin : fromReferer || "";

  const hasUsableBrowserOrigin = (): boolean => {
    if (!derived || derived === "null") return false;
    try {
      const u = new URL(derived);
      if (u.hostname === "localhost" || u.hostname.startsWith("127.")) {
        return false;
      }
      return u.protocol === "https:" || u.protocol === "http:";
    } catch {
      return false;
    }
  };

  if (hasUsableBrowserOrigin()) {
    return request;
  }

  const proto =
    headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  const host =
    headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    process.env.VERCEL_URL;

  if (!host) {
    return request;
  }

  headers.set("origin", `${proto}://${host}`);

  return new Request(request.url, {
    method: request.method,
    headers,
    body: request.body,
    ...(request.body ? { duplex: "half" as const } : {}),
  });
}
