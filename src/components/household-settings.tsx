"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createInvite,
  leaveHousehold,
  removeMember,
  renameHousehold,
  revokeInvite,
} from "@/actions/household";

type Member = {
  id: string;
  userId: string;
  label: string;
  email: string | null;
  role: "owner" | "member";
};

type Invite = { id: string; token: string; expiresLabel: string };

const primaryBtn =
  "inline-flex min-h-[48px] items-center justify-center rounded bg-sage px-4 py-3 text-base font-medium text-white hover:bg-sage/90 disabled:opacity-50 sm:min-h-0 sm:py-2 sm:text-sm";
const secondaryBtn =
  "inline-flex min-h-[44px] items-center justify-center rounded border border-stone-300 bg-white px-3 py-2 text-sm text-ink hover:bg-cream disabled:opacity-50 sm:min-h-0 sm:py-1.5";

function inviteUrl(token: string): string {
  return `${window.location.origin}/invite/${token}`;
}

export function HouseholdSettings(props: {
  householdName: string;
  role: "owner" | "member";
  currentUserId: string;
  members: Member[];
  invites: Invite[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(props.householdName);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function run(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  async function shareInvite(invite: Invite) {
    const url = inviteUrl(invite.token);
    const text = `Join ${props.householdName} so we can share recipes and meal plans:`;
    if (navigator.share) {
      try {
        await navigator.share({ title: props.householdName, text, url });
        return;
      } catch {
        // Cancelled or unsupported payload: fall back to copying.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Copy this invite link:", url);
      return;
    }
    setCopiedId(invite.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div className="mt-8 space-y-10">
      {error && (
        <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <section>
        <h2 className="font-display text-lg font-semibold text-ink">Name</h2>
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => renameHousehold(name));
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            className="min-h-[48px] flex-1 rounded border border-stone-300 bg-white px-3 text-base sm:min-h-0 sm:py-2 sm:text-sm"
            aria-label="Household name"
          />
          <button
            type="submit"
            disabled={pending || !name.trim() || name.trim() === props.householdName}
            className={secondaryBtn}
          >
            Save name
          </button>
        </form>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-ink">People</h2>
        <ul className="mt-3 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
          {props.members.map((m) => {
            const isMe = m.userId === props.currentUserId;
            return (
              <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-ink">
                    {m.label}
                    {isMe && <span className="text-stone-500"> (you)</span>}
                  </p>
                  <p className="truncate text-sm text-stone-500">
                    {m.role === "owner" ? "Owner" : "Member"}
                    {m.email ? ` · ${m.email}` : ""}
                  </p>
                </div>
                {props.role === "owner" && !isMe && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (confirm(`Remove ${m.label}? They'll lose access to this cookbook.`)) {
                        run(() => removeMember(m.id));
                      }
                    }}
                    className="min-h-[44px] shrink-0 rounded px-3 text-sm text-red-800 hover:bg-red-50"
                  >
                    Remove
                  </button>
                )}
                {props.role !== "owner" && isMe && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (confirm("Leave this cookbook? The recipes stay here; you'll start a new empty one.")) {
                        run(async () => {
                          await leaveHousehold();
                          router.push("/recipes");
                        });
                      }
                    }}
                    className="min-h-[44px] shrink-0 rounded px-3 text-sm text-red-800 hover:bg-red-50"
                  >
                    Leave
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-ink">Invite someone</h2>
        <p className="mt-1 text-sm text-stone-600">
          Send them a link. It works once and expires after 7 days. They&apos;ll create an
          account (or sign in) and get full access to everything here.
        </p>
        <button
          type="button"
          disabled={pending}
          className={`${primaryBtn} mt-4 w-full sm:w-auto`}
          // Sharing straight away isn't reliable on iOS (the tap "expires" during the server call),
          // so the new link appears below with its own Share button.
          onClick={() => run(() => createInvite())}
        >
          Create invite link
        </button>

        {props.invites.length > 0 && (
          <ul className="mt-4 space-y-2">
            {props.invites.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-col gap-2 rounded-lg border border-stone-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-sm text-stone-600">
                  Open invite · expires {inv.expiresLabel}
                </span>
                <div className="flex gap-2">
                  <button type="button" className={secondaryBtn} onClick={() => shareInvite(inv)}>
                    {copiedId === inv.id ? "Copied!" : "Share link"}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    className={secondaryBtn}
                    onClick={() => run(() => revokeInvite(inv.id))}
                  >
                    Cancel
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
