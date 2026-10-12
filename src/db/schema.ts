import {
  pgTable,
  text,
  timestamp,
  jsonb,
  uuid,
  index,
  integer,
  uniqueIndex,
  date,
  boolean,
  type AnyPgColumn,
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
  /** How many people usually eat a meal; pre-fills portions when planning. */
  defaultPortions: integer("default_portions").notNull().default(2),
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

export type MealSlot = "breakfast" | "lunch" | "dinner";
export type PlanEntryKind = "cook" | "leftovers" | "freezer" | "simple";

/**
 * One meal in the weekly plan. What it means depends on `kind`:
 * - cook: make `recipe_id`; total made = portions + linked leftovers + freeze_portions
 * - leftovers: eat portions of the cook entry `leftover_of_entry_id`
 * - freezer: eat portions from `freezer_item_id`
 * - simple: free-text meal (`title`), optional `ingredients` go on the shopping list as-is
 */
export const planEntries = pgTable(
  "plan_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    slot: text("slot").$type<MealSlot>().notNull(),
    kind: text("kind").$type<PlanEntryKind>().notNull(),
    /** Snapshot for display; for `simple` entries this is the meal itself. */
    title: text("title").notNull(),
    recipeId: uuid("recipe_id").references(() => recipes.id, { onDelete: "set null" }),
    /** Portions eaten at this meal. */
    portions: integer("portions").notNull(),
    /** cook only: extra portions made to go in the freezer. */
    freezePortions: integer("freeze_portions").notNull().default(0),
    leftoverOfEntryId: uuid("leftover_of_entry_id").references(
      (): AnyPgColumn => planEntries.id,
      { onDelete: "cascade" },
    ),
    freezerItemId: uuid("freezer_item_id").references(
      (): AnyPgColumn => freezerItems.id,
      { onDelete: "set null" },
    ),
    ingredients: jsonb("ingredients").$type<RecipeIngredient[]>().notNull().default([]),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("plan_entries_household_date_idx").on(t.householdId, t.date)],
);

/**
 * Portions in the freezer. `portions` is how many went in; what's left is that minus
 * the freezer entries that use it. Items from batch cooking link back to their cook entry.
 */
export const freezerItems = pgTable(
  "freezer_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    recipeId: uuid("recipe_id").references(() => recipes.id, { onDelete: "set null" }),
    portions: integer("portions").notNull(),
    frozenOn: date("frozen_on", { mode: "string" }).notNull(),
    sourceEntryId: uuid("source_entry_id").references((): AnyPgColumn => planEntries.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("freezer_items_household_idx").on(t.householdId),
    uniqueIndex("freezer_items_source_entry_uidx").on(t.sourceEntryId),
  ],
);

/** Saved go-to meals that aren't full recipes (e.g. "Overnight oats"). */
export const quickMeals = pgTable(
  "quick_meals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    slot: text("slot").$type<MealSlot>().notNull().default("breakfast"),
    ingredients: jsonb("ingredients").$type<RecipeIngredient[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("quick_meals_household_idx").on(t.householdId)],
);

/** One shopping list per household per plan week. */
export const shoppingLists = pgTable(
  "shopping_lists",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    weekStart: date("week_start", { mode: "string" }).notNull(),
    /** Fingerprint of the plan when generated; differs once the plan changes. */
    planSignature: text("plan_signature").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("shopping_lists_household_week_uidx").on(t.householdId, t.weekStart)],
);

export const shoppingItems = pgTable(
  "shopping_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    listId: uuid("list_id")
      .notNull()
      .references(() => shoppingLists.id, { onDelete: "cascade" }),
    /** Normalized name used for merging and remembering aisles. */
    key: text("key").notNull(),
    name: text("name").notNull(),
    quantity: text("quantity").notNull().default(""),
    aisle: text("aisle").notNull(),
    sources: jsonb("sources").$type<string[]>().notNull().default([]),
    checked: boolean("checked").notNull().default(false),
    /** Added by hand rather than generated from the plan; survives regeneration. */
    manual: boolean("manual").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("shopping_items_list_idx").on(t.listId)],
);

/** Where this household says an item lives, after moving it on a list. */
export const aisleOverrides = pgTable(
  "aisle_overrides",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    aisle: text("aisle").notNull(),
  },
  (t) => [uniqueIndex("aisle_overrides_household_key_uidx").on(t.householdId, t.key)],
);

/** Shared cache of AI aisle guesses for items the keyword list doesn't know. */
export const ingredientAisleCache = pgTable("ingredient_aisle_cache", {
  key: text("key").primaryKey(),
  aisle: text("aisle").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type ShoppingList = typeof shoppingLists.$inferSelect;
export type ShoppingItem = typeof shoppingItems.$inferSelect;
export type PlanEntry = typeof planEntries.$inferSelect;
export type FreezerItem = typeof freezerItems.$inferSelect;
export type QuickMeal = typeof quickMeals.$inferSelect;
export type Household = typeof households.$inferSelect;
export type HouseholdMember = typeof householdMembers.$inferSelect;
export type HouseholdInvite = typeof householdInvites.$inferSelect;
export type Recipe = typeof recipes.$inferSelect;
export type RecipeImage = typeof recipeImages.$inferSelect;
