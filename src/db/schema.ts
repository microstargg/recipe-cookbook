import {
  pgTable,
  text,
  timestamp,
  jsonb,
  uuid,
  index,
  integer,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import type { RecipeIngredient } from "@/lib/recipe-schema";

/**
 * A household is the group of people sharing one cookbook (recipes, plans, lists).
 * `user_id` columns everywhere are Neon Auth / Better Auth user ids (strings), not a local users table.
 */
export const households = pgTable("households", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** A user belongs to exactly one household (unique on `user_id`). */
export const householdMembers = pgTable(
  "household_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    role: text("role").$type<"owner" | "member">().notNull().default("member"),
    name: text("name"),
    email: text("email"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("household_members_user_uidx").on(t.userId),
    index("household_members_household_idx").on(t.householdId),
  ],
);

export const householdInvites = pgTable(
  "household_invites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedBy: text("accepted_by"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("household_invites_token_uidx").on(t.token)],
);

export const recipes = pgTable(
  "recipes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Who created the recipe. Access is by `household_id`. */
    userId: text("user_id").notNull(),
    /** Nullable only for rows created before households existed; backfilled on first visit. */
    /** No cascade: deleting a household that still owns recipes must fail, never wipe them. */
    householdId: uuid("household_id").references(() => households.id),
    title: text("title").notNull(),
    ingredients: jsonb("ingredients")
      .$type<RecipeIngredient[]>()
      .notNull()
      .default([]),
    steps: jsonb("steps").$type<string[]>().notNull().default([]),
    tags: jsonb("tags").$type<string[]>().default([]),
    sourceUrl: text("source_url"),
    servings: integer("servings"),
    servingsLabel: text("servings_label"),
    rawExtractMeta: jsonb("raw_extract_meta").$type<Record<string, unknown> | null>(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("recipes_user_updated_idx").on(t.userId, t.updatedAt),
    index("recipes_household_updated_idx").on(t.householdId, t.updatedAt),
  ],
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

export type Household = typeof households.$inferSelect;
export type HouseholdMember = typeof householdMembers.$inferSelect;
export type HouseholdInvite = typeof householdInvites.$inferSelect;
export type Recipe = typeof recipes.$inferSelect;
export type RecipeImage = typeof recipeImages.$inferSelect;
