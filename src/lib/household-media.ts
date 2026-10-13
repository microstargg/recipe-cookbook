import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { recipeImages, recipes } from "@/db/schema";
import { isVercelBlobUrl } from "@/lib/blob-url";

/** New blobs are stored under the household's folder so access can be checked by path. */
export function householdBlobPath(householdId: string | null, pathname: string): string {
  return householdId ? `h/${householdId}/${pathname}` : pathname;
}

/**
 * Whether a household may read this private blob: either it lives under the household's folder,
 * or (for blobs uploaded before folders existed) one of the household's recipes references it.
 */
export async function householdCanReadBlob(url: string, householdId: string): Promise<boolean> {
  if (!isVercelBlobUrl(url)) return false;
  const pathname = new URL(url).pathname.replace(/^\/+/, "");
  if (pathname.startsWith(`h/${householdId}/`)) return true;

  const [ref] = await db
    .select({ id: recipeImages.id })
    .from(recipeImages)
    .innerJoin(recipes, eq(recipes.id, recipeImages.recipeId))
    .where(and(eq(recipeImages.url, url), eq(recipes.householdId, householdId)))
    .limit(1);
  return Boolean(ref);
}
