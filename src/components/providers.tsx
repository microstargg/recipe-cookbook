"use client";

import { NeonAuthUIProvider } from "@neondatabase/auth/react/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, type ReactNode } from "react";
import { authClient } from "@/lib/auth/client";

export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();
  // Set once someone signs in or out. The redirect that follows is then a full page load:
  // the client router cache can still hold pages prefetched while signed out (redirects to
  // sign-in), so a soft navigation would send them straight back to the sign-in form.
  const sessionChanged = useRef(false);

  const navigate = useCallback(
    (href: string) => (sessionChanged.current ? window.location.assign(href) : router.push(href)),
    [router],
  );
  const replace = useCallback(
    (href: string) => (sessionChanged.current ? window.location.replace(href) : router.replace(href)),
    [router],
  );

  return (
    <NeonAuthUIProvider
      // Better Auth / neon-js duplicate type trees in node_modules; runtime client is correct.
      authClient={authClient as never}
      navigate={navigate}
      replace={replace}
      onSessionChange={() => {
        sessionChanged.current = true;
        router.refresh();
      }}
      redirectTo="/plan"
      Link={Link}
    >
      {children}
    </NeonAuthUIProvider>
  );
}
