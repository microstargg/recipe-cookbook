"use server";

import { auth } from "@/lib/auth/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export async function signOutAction() {
  const h = await headers();
  await auth.signOut({ headers: h } as never);
  redirect("/auth/sign-in");
}
