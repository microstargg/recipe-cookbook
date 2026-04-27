import {
  pgTable,
  text,
  timestamp,
  jsonb,
  uuid,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/** `user_id` is the Neon Auth / Better Auth user id (string), not a local users table. */
export const recipes = pgTable(
  "recipes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    ingredients: jsonb("ingredients").$type<string[]>().notNull().default([]),
    steps: jsonb("steps").$type<string[]>().notNull().default([]),
    tags: jsonb("tags").$type<string[]>().default([]),
    sourceUrl: text("source_url"),
    rawExtractMeta: jsonb("raw_extract_meta").$type<Record<string, unknown> | null>(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("recipes_user_updated_idx").on(t.userId, t.updatedAt)],
);

export const recipesRelations = relations(recipes, ({ many }) => ({
  images: many(recipeImages),
}));

export const recipeImages = pgTable(
  "recipe_images",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    kind: text("kind").$type<"cover" | "attachment" | "import_source">().notNull().default("attachment"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("recipe_images_recipe_idx").on(t.recipeId)],
);

export const recipeImagesRelations = relations(recipeImages, ({ one }) => ({
  recipe: one(recipes, { fields: [recipeImages.recipeId], references: [recipes.id] }),
}));

export type Recipe = typeof recipes.$inferSelect;
export type RecipeImage = typeof recipeImages.$inferSelect;
