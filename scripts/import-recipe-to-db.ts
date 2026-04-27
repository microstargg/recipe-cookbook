/**
 * One-off: fetch a public recipe URL, parse with the same logic as /import/url,
 * insert into Neon for a given user.
 *
 * Usage (from repo root):
 *   export $(grep -v '^#' .env.local | xargs)
 *   IMPORT_USER_ID='your-neon-auth-user-id' npx tsx scripts/import-recipe-to-db.ts 'https://...'
 *
 * If IMPORT_USER_ID is omitted, uses the first user_id already present in `recipes` (dev convenience).
 */

import { db } from "../src/db";
import { recipeImages, recipes } from "../src/db/schema";
import { fetchAndParseUrl } from "../src/lib/import-url";
import { recipeDraftSchema } from "../src/lib/recipe-schema";
import { rehostRecipeImageIfConfigured } from "../src/lib/rehost-recipe-image";

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error("Usage: npx tsx scripts/import-recipe-to-db.ts <url>");
    process.exit(1);
  }

  let userId = process.env.IMPORT_USER_ID?.trim();
  if (!userId) {
    const row = await db.select({ userId: recipes.userId }).from(recipes).limit(1);
    userId = row[0]?.userId;
  }
  if (!userId) {
    console.error(
      "Set IMPORT_USER_ID to your Neon Auth user id, or insert any recipe first so we can reuse its user_id.",
    );
    process.exit(1);
  }

  const { parsed } = await fetchAndParseUrl(url);
  if (!parsed.ingredients.length && !parsed.steps.length) {
    console.error("No recipe content extracted from:", url);
    process.exit(1);
  }

  let imageUrl = parsed.coverImageUrl ?? undefined;
  if (imageUrl) {
    imageUrl = await rehostRecipeImageIfConfigured(imageUrl, parsed.title);
  }

  const draft = recipeDraftSchema.parse({
    title: parsed.title,
    ingredients: parsed.ingredients.length
      ? parsed.ingredients
      : ["(see steps)"],
    steps: parsed.steps.length ? parsed.steps : ["(see original page)"],
    tags: [],
    sourceUrl: url,
    notes: parsed.rawWarnings?.filter(Boolean).join(" ") || undefined,
    imageUrl,
  });

  const [created] = await db
    .insert(recipes)
    .values({
      userId,
      title: draft.title,
      ingredients: draft.ingredients,
      steps: draft.steps,
      tags: draft.tags ?? [],
      sourceUrl: draft.sourceUrl ?? null,
      notes: draft.notes ?? null,
    })
    .returning();

  if (draft.imageUrl) {
    await db.insert(recipeImages).values({
      recipeId: created.id,
      url: draft.imageUrl,
      kind: "cover",
    });
  }

  console.log(JSON.stringify({ id: created.id, title: created.title }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
