"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acceptInvite } from "@/actions/household";

export function JoinHouseholdButton({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await acceptInvite(token);
            if (!res.ok) {
              setError(res.error);
              return;
            }
            router.push("/recipes");
            router.refresh();
          })
        }
        className="mt-6 inline-flex min-h-[48px] w-full items-center justify-center rounded bg-sage px-4 py-3 text-base font-medium text-white hover:bg-sage/90 disabled:opacity-50"
      >
        {pending ? "Joining…" : "Join cookbook"}
      </button>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-800">
          {error}
        </p>
      )}
    </>
  );
}
