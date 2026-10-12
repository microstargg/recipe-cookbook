-- Run once in Neon: SQL Editor → paste → execute (or: npm run db:push with DATABASE_URL set)
-- Creates tables expected by src/db/schema.ts

CREATE TABLE IF NOT EXISTS "recipes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "title" text NOT NULL,
  "ingredients" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb,
  "source_url" text,
  "servings" integer,
  "servings_label" text,
  "raw_extract_meta" jsonb,
  "notes" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "recipes_user_updated_idx"
  ON "recipes" ("user_id", "updated_at");

CREATE TABLE IF NOT EXISTS "recipe_images" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "recipe_id" uuid NOT NULL REFERENCES "recipes"("id") ON DELETE CASCADE,
  "url" text NOT NULL,
  "kind" text DEFAULT 'attachment' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "recipe_images_recipe_idx"
  ON "recipe_images" ("recipe_id");

-- Additive migration for existing DBs (safe to re-run)
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "servings" integer;
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "servings_label" text;

-- Households (shared cookbooks). Safe to re-run.
-- Existing recipes keep household_id NULL until their owner next opens the app,
-- which creates their household and adopts them (src/lib/household.ts).
CREATE TABLE IF NOT EXISTS "households" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "created_by" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "household_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" uuid NOT NULL REFERENCES "households"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL,
  "role" text DEFAULT 'member' NOT NULL,
  "name" text,
  "email" text,
  "joined_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "household_members_user_uidx" ON "household_members" ("user_id");
CREATE INDEX IF NOT EXISTS "household_members_household_idx" ON "household_members" ("household_id");

CREATE TABLE IF NOT EXISTS "household_invites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" uuid NOT NULL REFERENCES "households"("id") ON DELETE CASCADE,
  "token" text NOT NULL,
  "created_by" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "accepted_by" text,
  "accepted_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "household_invites_token_uidx" ON "household_invites" ("token");

ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "household_id" uuid REFERENCES "households"("id");
CREATE INDEX IF NOT EXISTS "recipes_household_updated_idx" ON "recipes" ("household_id", "updated_at");

-- Meal planning. Safe to re-run.
ALTER TABLE "households" ADD COLUMN IF NOT EXISTS "default_portions" integer DEFAULT 2 NOT NULL;

CREATE TABLE IF NOT EXISTS "plan_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" uuid NOT NULL REFERENCES "households"("id") ON DELETE CASCADE,
  "date" date NOT NULL,
  "slot" text NOT NULL,
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "recipe_id" uuid REFERENCES "recipes"("id") ON DELETE SET NULL,
  "portions" integer NOT NULL,
  "freeze_portions" integer DEFAULT 0 NOT NULL,
  "leftover_of_entry_id" uuid REFERENCES "plan_entries"("id") ON DELETE CASCADE,
  "freezer_item_id" uuid,
  "ingredients" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_by" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "plan_entries_household_date_idx" ON "plan_entries" ("household_id", "date");

CREATE TABLE IF NOT EXISTS "freezer_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" uuid NOT NULL REFERENCES "households"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "recipe_id" uuid REFERENCES "recipes"("id") ON DELETE SET NULL,
  "portions" integer NOT NULL,
  "frozen_on" date NOT NULL,
  "source_entry_id" uuid REFERENCES "plan_entries"("id") ON DELETE CASCADE,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "freezer_items_household_idx" ON "freezer_items" ("household_id");
CREATE UNIQUE INDEX IF NOT EXISTS "freezer_items_source_entry_uidx" ON "freezer_items" ("source_entry_id");

DO $$ BEGIN
  ALTER TABLE "plan_entries" ADD CONSTRAINT "plan_entries_freezer_item_id_fk"
    FOREIGN KEY ("freezer_item_id") REFERENCES "freezer_items"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "quick_meals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" uuid NOT NULL REFERENCES "households"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "slot" text DEFAULT 'breakfast' NOT NULL,
  "ingredients" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "quick_meals_household_idx" ON "quick_meals" ("household_id");

-- Shopping lists. Safe to re-run.
CREATE TABLE IF NOT EXISTS "shopping_lists" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" uuid NOT NULL REFERENCES "households"("id") ON DELETE CASCADE,
  "week_start" date NOT NULL,
  "plan_signature" text NOT NULL,
  "generated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "shopping_lists_household_week_uidx" ON "shopping_lists" ("household_id", "week_start");

CREATE TABLE IF NOT EXISTS "shopping_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "list_id" uuid NOT NULL REFERENCES "shopping_lists"("id") ON DELETE CASCADE,
  "key" text NOT NULL,
  "name" text NOT NULL,
  "quantity" text DEFAULT '' NOT NULL,
  "aisle" text NOT NULL,
  "sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "checked" boolean DEFAULT false NOT NULL,
  "manual" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "shopping_items_list_idx" ON "shopping_items" ("list_id");

CREATE TABLE IF NOT EXISTS "aisle_overrides" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" uuid NOT NULL REFERENCES "households"("id") ON DELETE CASCADE,
  "key" text NOT NULL,
  "aisle" text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "aisle_overrides_household_key_uidx" ON "aisle_overrides" ("household_id", "key");

CREATE TABLE IF NOT EXISTS "ingredient_aisle_cache" (
  "key" text PRIMARY KEY NOT NULL,
  "aisle" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
