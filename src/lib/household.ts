import { cache } from "react";
import { headers } from "next/headers";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { householdMembers, households, recipes } from "@/db/schema";
import { auth } from "@/lib/auth/server";

export type SessionUser = { id: string; name: string | null; email: string | null };

export type HouseholdContext = {
  userId: string;
  householdId: string;
  householdName: string;
  role: "owner" | "member";
};

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const h = await headers();
  const { data: session } = await auth.getSession({
    headers: h,
  } as Parameters<typeof auth.getSession>[0]);
  const u = session?.user;
  if (!u?.id) return null;
  return {
    id: u.id,
    name: typeof u.name === "string" && u.name.trim() ? u.name.trim() : null,
    email: typeof u.email === "string" ? u.email : null,
  };
});

export function defaultHouseholdName(user: SessionUser): string {
  const first = user.name?.split(/\s+/)[0] ?? user.email?.split("@")[0];
  return first ? `${first}'s Cookbook` : "My Cookbook";
}

async function findMembership(userId: string): Promise<HouseholdContext | null> {
  const [row] = await db
    .select({
      householdId: householdMembers.householdId,
      role: householdMembers.role,
      householdName: households.name,
    })
    .from(householdMembers)
    .innerJoin(households, eq(households.id, householdMembers.householdId))
    .where(eq(householdMembers.userId, userId))
    .limit(1);
  return row ? { userId, ...row } : null;
}

/**
 * Returns the user's household, creating a personal one on first visit.
 * Creation also adopts any recipes this user made before households existed.
 */
async function ensureHousehold(user: SessionUser): Promise<HouseholdContext> {
  const existing = await findMembership(user.id);
  if (existing) return existing;

  const householdId = crypto.randomUUID();
  try {
    await db.batch([
      db.insert(households).values({
        id: householdId,
        name: defaultHouseholdName(user),
        createdBy: user.id,
      }),
      db.insert(householdMembers).values({
        householdId,
        userId: user.id,
        role: "owner",
        name: user.name,
        email: user.email,
      }),
      db
        .update(recipes)
        .set({ householdId })
        .where(and(eq(recipes.userId, user.id), isNull(recipes.householdId))),
    ]);
  } catch (err) {
    // A concurrent request created the membership first (unique on user_id); the batch rolled back.
    const raced = await findMembership(user.id);
    if (raced) return raced;
    throw err;
  }

  const created = await findMembership(user.id);
  if (!created) throw new Error("Could not create household");
  return created;
}

/** Signed-in user plus their household. Throws if not signed in. Cached per request. */
export const requireHousehold = cache(async (): Promise<HouseholdContext> => {
  const user = await getSessionUser();
  if (!user) throw new Error("Unauthorized");
  return ensureHousehold(user);
});
