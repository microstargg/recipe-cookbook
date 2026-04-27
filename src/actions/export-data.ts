"use server";

import { db } from "@/db";
import { recipeImages, recipes } from "@/db/schema";
import { requireUserId } from "@/lib/require-user";
import { eq, inArray } from "drizzle-orm";

export async function exportAllRecipesForDownload() {
  const userId = await requireUserId();

  const list = await db
    .select()
    .from(recipes)
    .where(eq(recipes.userId, userId));

  if (!list.length) {
    return { json: "[]\n", markdown: "# No recipes yet\n" };
  }

  const ids = list.map((r) => r.id);
  const imgs = await db
    .select()
    .from(recipeImages)
    .where(inArray(recipeImages.recipeId, ids));

  const byRecipe = new Map<string, typeof imgs>();
  for (const im of imgs) {
    if (!byRecipe.has(im.recipeId)) byRecipe.set(im.recipeId, []);
    byRecipe.get(im.recipeId)!.push(im);
  }

  const payload = list.map((r) => ({
    id: r.id,
    title: r.title,
    ingredients: r.ingredients,
    steps: r.steps,
    tags: r.tags,
    sourceUrl: r.sourceUrl,
    notes: r.notes,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    images: (byRecipe.get(r.id) ?? []).map((i) => ({
      url: i.url,
      kind: i.kind,
    })),
  }));

  const json = JSON.stringify(payload, null, 2) + "\n";

  const md = payload
    .map((r) => {
      const lines: string[] = [
        `## ${r.title}`,
        "",
        r.sourceUrl ? `**Source:** ${r.sourceUrl}` : "",
        "",
        "### Ingredients",
        ...r.ingredients.map((i) => `- ${i}`),
        "",
        "### Steps",
        ...r.steps.map((s, j) => `${j + 1}. ${s}`),
        "",
      ];
      if (r.notes) lines.push("### Notes", r.notes, "");
      if (r.tags?.length) lines.push("### Tags", r.tags.map((t) => `- ${t}`).join("\n"), "");
      if (r.images.length)
        lines.push("### Images", ...r.images.map((i) => `- ${i.url} (${i.kind})`), "");
      return lines.filter((l) => l !== "").join("\n");
    })
    .join("\n---\n\n");

  return { json, markdown: md };
}
