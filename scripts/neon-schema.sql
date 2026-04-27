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
