import { splitCookiesString } from "set-cookie-parser";

/**
 * `@neondatabase/auth` middleware proxies `fetch()` to Neon Auth and calls
 * `response.headers.getSetCookie()`. That method exists on Node/undici Responses but is often
 * missing on Vercel Edge, which causes `MIDDLEWARE_INVOCATION_FAILED` / 500.
 *
 * Install a spec-style polyfill using the merged `set-cookie` header when native
 * `getSetCookie` is absent. Safe to call multiple times.
 */
export function ensureHeadersGetSetCookie(): void {
  const proto = Headers.prototype as unknown as {
    getSetCookie?: () => string[];
  };
  if (typeof proto.getSetCookie === "function") return;

  proto.getSetCookie = function getSetCookiePolyfill(this: Headers): string[] {
    const v = this.get("set-cookie");
    if (v == null || v === "") return [];
    return splitCookiesString(v);
  };
}
