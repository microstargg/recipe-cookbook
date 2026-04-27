"use client";

import { NeonAuthUIProvider } from "@neondatabase/auth/react/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { authClient } from "@/lib/auth/client";

export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();

  return (
    <NeonAuthUIProvider
      // Better Auth / neon-js duplicate type trees in node_modules; runtime client is correct.
      authClient={authClient as never}
      navigate={router.push}
      replace={router.replace}
      onSessionChange={() => router.refresh()}
      redirectTo="/recipes"
      Link={Link}
    >
      {children}
    </NeonAuthUIProvider>
  );
}
