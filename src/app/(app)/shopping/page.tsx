import type { Metadata } from "next";
import { getShoppingList } from "@/actions/shopping";
import { ShoppingList } from "@/components/shopping/shopping-list";

export const metadata: Metadata = { title: "Shopping list" };

export default async function ShoppingPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const list = await getShoppingList(week);
  return <ShoppingList list={list} />;
}
