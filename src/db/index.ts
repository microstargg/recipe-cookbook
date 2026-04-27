import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ??
  "postgres://user:pass@127.0.0.1:5432/placeholder?sslmode=disable";

const sql = neon(connectionString);

export const db = drizzle(sql, { schema });
export { schema };
