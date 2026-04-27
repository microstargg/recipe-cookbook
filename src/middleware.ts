import { auth } from "@/lib/auth/server";

export default auth.middleware({ loginUrl: "/auth/sign-in" });

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|auth).*)",
      // Server Actions send `next-action`; auth redirects here break the action response
      // (HTML/302 instead of `text/x-component`) → "An unexpected response was received from the server".
      missing: [{ type: "header", key: "next-action" }],
    },
  ],
};
