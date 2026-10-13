"use server";

import { randomBytes } from "node:crypto";
import { and, asc, count, eq, gt, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  freezerItems,
  householdInvites,
  householdMembers,
  households,
  planEntries,
  quickMeals,
  recipes,
} from "@/db/schema";
import { getSessionUser, requireHousehold } from "@/lib/household";

const INVITE_TTL_DAYS = 7;

export async function getHouseholdOverview() {
  const ctx = await requireHousehold();

  const members = await db
    .select({
      id: householdMembers.id,
      userId: householdMembers.userId,
      name: householdMembers.name,
      email: householdMembers.email,
      role: householdMembers.role,
      joinedAt: householdMembers.joinedAt,
    })
    .from(householdMembers)
    .where(eq(householdMembers.householdId, ctx.householdId))
    .orderBy(asc(householdMembers.joinedAt));

  const invites = await db
    .select({
      id: householdInvites.id,
      token: householdInvites.token,
      expiresAt: householdInvites.expiresAt,
    })
    .from(householdInvites)
    .where(
      and(
        eq(householdInvites.householdId, ctx.householdId),
        isNull(householdInvites.acceptedAt),
        gt(householdInvites.expiresAt, new Date()),
      ),
    )
    .orderBy(asc(householdInvites.createdAt));

  const [{ defaultPortions }] = await db
    .select({ defaultPortions: households.defaultPortions })
    .from(households)
    .where(eq(households.id, ctx.householdId));

  return { ...ctx, defaultPortions, members, invites };
}

export async function renameHousehold(name: string) {
  const { householdId } = await requireHousehold();
  const clean = z.string().trim().min(1, "Name is required").max(80).parse(name);
  await db.update(households).set({ name: clean }).where(eq(households.id, householdId));
  revalidatePath("/", "layout");
}

export async function createInvite(): Promise<{ token: string }> {
  const { householdId, userId } = await requireHousehold();
  const token = randomBytes(24).toString("base64url");
  await db.insert(householdInvites).values({
    householdId,
    token,
    createdBy: userId,
    expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
  });
  revalidatePath("/settings/household");
  return { token };
}

export async function revokeInvite(inviteId: string) {
  const { householdId } = await requireHousehold();
  await db
    .delete(householdInvites)
    .where(
      and(
        eq(householdInvites.id, z.string().uuid().parse(inviteId)),
        eq(householdInvites.householdId, householdId),
        isNull(householdInvites.acceptedAt),
      ),
    );
  revalidatePath("/settings/household");
}

/** Owner removes someone else. They get a fresh, empty cookbook next time they visit. */
export async function removeMember(memberId: string) {
  const { householdId, role, userId } = await requireHousehold();
  if (role !== "owner") throw new Error("Only the owner can remove people");
  await db
    .delete(householdMembers)
    .where(
      and(
        eq(householdMembers.id, z.string().uuid().parse(memberId)),
        eq(householdMembers.householdId, householdId),
        ne(householdMembers.userId, userId),
      ),
    );
  revalidatePath("/settings/household");
}

/** Members (not the owner) can leave; shared recipes stay with the household. */
export async function leaveHousehold() {
  const { householdId, role, userId } = await requireHousehold();
  if (role === "owner") throw new Error("The owner can't leave their own cookbook");
  await db
    .delete(householdMembers)
    .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, userId)));
  revalidatePath("/", "layout");
}

async function findUsableInvite(token: string) {
  const [invite] = await db
    .select({
      id: householdInvites.id,
      householdId: householdInvites.householdId,
      householdName: households.name,
      expiresAt: householdInvites.expiresAt,
      acceptedAt: householdInvites.acceptedAt,
      createdBy: householdInvites.createdBy,
    })
    .from(householdInvites)
    .innerJoin(households, eq(households.id, householdInvites.householdId))
    .where(eq(householdInvites.token, token))
    .limit(1);
  if (!invite || invite.acceptedAt || invite.expiresAt <= new Date()) return null;
  return invite;
}

export type InvitePreview =
  | { status: "invalid" }
  | { status: "signed_out"; householdName: string; inviterName: string | null }
  | { status: "already_member"; householdName: string }
  | { status: "blocked"; householdName: string; currentName: string }
  | {
      status: "ready";
      householdName: string;
      inviterName: string | null;
      recipesToMove: number;
    };

/** Works signed in or out: the invite page is public so the link survives the sign-up detour. */
export async function getInvitePreview(token: string): Promise<InvitePreview> {
  const invite = await findUsableInvite(token);
  if (!invite) return { status: "invalid" };

  const [inviter] = await db
    .select({ name: householdMembers.name })
    .from(householdMembers)
    .where(eq(householdMembers.userId, invite.createdBy))
    .limit(1);
  const inviterName = inviter?.name ?? null;

  const user = await getSessionUser();
  if (!user) return { status: "signed_out", householdName: invite.householdName, inviterName };

  const current = await requireHousehold();
  if (current.householdId === invite.householdId) {
    return { status: "already_member", householdName: invite.householdName };
  }

  const [{ others }] = await db
    .select({ others: count() })
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.householdId, current.householdId),
        ne(householdMembers.userId, user.id),
      ),
    );
  if (others > 0) {
    return {
      status: "blocked",
      householdName: invite.householdName,
      currentName: current.householdName,
    };
  }

  const [{ n }] = await db
    .select({ n: count() })
    .from(recipes)
    .where(eq(recipes.householdId, current.householdId));

  return {
    status: "ready",
    householdName: invite.householdName,
    inviterName,
    recipesToMove: n,
  };
}

/**
 * Join the inviting household. The joiner's own (solo) cookbook is merged in:
 * their recipes, plans, freezer and quick meals move across and the empty household is deleted, all in one transaction.
 */
export async function acceptInvite(token: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in first" };

  const invite = await findUsableInvite(token);
  if (!invite) return { ok: false, error: "This invite has expired or was already used" };

  const current = await requireHousehold();
  if (current.householdId === invite.householdId) return { ok: true };

  const [{ others }] = await db
    .select({ others: count() })
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.householdId, current.householdId),
        ne(householdMembers.userId, user.id),
      ),
    );
  if (others > 0) {
    return {
      ok: false,
      error: "You already share a cookbook with someone else. Leave it first, then use this link.",
    };
  }

  await db.batch([
    db
      .update(recipes)
      .set({ householdId: invite.householdId })
      .where(eq(recipes.householdId, current.householdId)),
    db
      .update(planEntries)
      .set({ householdId: invite.householdId })
      .where(eq(planEntries.householdId, current.householdId)),
    db
      .update(freezerItems)
      .set({ householdId: invite.householdId })
      .where(eq(freezerItems.householdId, current.householdId)),
    db
      .update(quickMeals)
      .set({ householdId: invite.householdId })
      .where(eq(quickMeals.householdId, current.householdId)),
    db.delete(householdMembers).where(eq(householdMembers.userId, user.id)),
    db.insert(householdMembers).values({
      householdId: invite.householdId,
      userId: user.id,
      role: "member",
      name: user.name,
      email: user.email,
    }),
    db
      .update(householdInvites)
      .set({ acceptedBy: user.id, acceptedAt: new Date() })
      .where(eq(householdInvites.id, invite.id)),
    db.delete(households).where(eq(households.id, current.householdId)),
  ]);

  revalidatePath("/", "layout");
  return { ok: true };
}
