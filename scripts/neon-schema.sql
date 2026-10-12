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
