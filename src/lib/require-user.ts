import { getSessionUser } from "@/lib/household";

export async function requireUserId(): Promise<string> {
  const user = await getSessionUser();
  if (!user) throw new Error("Unauthorized");
  return user.id;
}
