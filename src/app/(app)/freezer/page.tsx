import type { Metadata } from "next";
import Link from "next/link";
import { getFreezer } from "@/actions/plan";
import { FreezerList } from "@/components/plan/freezer-list";

export const metadata: Metadata = { title: "Freezer" };

export default async function FreezerPage() {
  const items = await getFreezer();
  return (
    <div>
      <Link href="/plan" className="inline-flex min-h-[44px] items-center text-sm text-accent">
        ← Meal plan
      </Link>
      <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">Freezer</h1>
      <p className="mt-1 text-stone-600">
        Portions you&apos;ve batch cooked. Meals planned from the freezer are already taken off.
      </p>
      <FreezerList items={items} />
    </div>
  );
}
