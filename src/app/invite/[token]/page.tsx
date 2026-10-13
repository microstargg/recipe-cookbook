import type { Metadata } from "next";
import Link from "next/link";
import { getInvitePreview } from "@/actions/household";
import { JoinHouseholdButton } from "@/components/join-household-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "You're invited",
  robots: { index: false },
};

const linkBtn =
  "inline-flex min-h-[48px] w-full items-center justify-center rounded px-4 py-3 text-base font-medium";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const preview = await getInvitePreview(token);
  const back = encodeURIComponent(`/invite/${token}`);

  return (
    <main className="flex min-h-dvh min-h-screen flex-col items-center justify-center bg-paper px-4 py-8 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-6 text-center shadow-sm">
        {preview.status === "invalid" ? (
          <>
            <h1 className="font-display text-2xl font-semibold text-ink">Link not valid</h1>
            <p className="mt-2 text-stone-600">
              This invite has expired or was already used. Ask for a new link.
            </p>
            <Link href="/recipes" className={`${linkBtn} mt-6 border border-stone-300 text-ink`}>
              Go to the app
            </Link>
          </>
        ) : (
          <>
            <p className="text-sm uppercase tracking-wide text-stone-500">You&apos;re invited to</p>
            <h1 className="font-display mt-1 text-2xl font-semibold text-ink">
              {preview.householdName}
            </h1>

            {preview.status === "signed_out" && (
              <>
                <p className="mt-3 text-stone-600">
                  {preview.inviterName ? `${preview.inviterName} wants` : "You've been invited"} to
                  share recipes, meal plans and shopping lists with you.
                </p>
                <div className="mt-6 flex flex-col gap-3">
                  <Link href={`/auth/sign-up?redirectTo=${back}`} className={`${linkBtn} bg-sage text-white`}>
                    Create an account
                  </Link>
                  <Link
                    href={`/auth/sign-in?redirectTo=${back}`}
                    className={`${linkBtn} border border-stone-300 text-ink`}
                  >
                    I already have an account
                  </Link>
                </div>
              </>
            )}

            {preview.status === "already_member" && (
              <>
                <p className="mt-3 text-stone-600">You&apos;re already in this cookbook.</p>
                <Link href="/recipes" className={`${linkBtn} mt-6 bg-sage text-white`}>
                  Open it
                </Link>
              </>
            )}

            {preview.status === "blocked" && (
              <>
                <p className="mt-3 text-stone-600">
                  You already share <strong>{preview.currentName}</strong> with someone. Leave it
                  from Household settings first, then open this link again.
                </p>
                <Link href="/settings/household" className={`${linkBtn} mt-6 border border-stone-300 text-ink`}>
                  Household settings
                </Link>
              </>
            )}

            {preview.status === "ready" && (
              <>
                <p className="mt-3 text-stone-600">
                  {preview.inviterName ? `${preview.inviterName} wants` : "You've been invited"} to
                  share recipes, meal plans and shopping lists with you.
                </p>
                {preview.recipesToMove > 0 && (
                  <p className="mt-3 rounded bg-cream px-3 py-2 text-sm text-stone-700">
                    Your {preview.recipesToMove} recipe{preview.recipesToMove === 1 ? "" : "s"} will
                    move into this cookbook too.
                  </p>
                )}
                <JoinHouseholdButton token={token} />
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
