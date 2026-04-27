import { headers } from "next/headers";
import { auth } from "@/lib/auth/server";

export async function requireUserId(): Promise<string> {
  const h = await headers();
  const { data: session } = await auth.getSession({
    headers: h,
  } as Parameters<typeof auth.getSession>[0]);
  const id = session?.user?.id;
  if (!id) throw new Error("Unauthorized");
  return id;
}
