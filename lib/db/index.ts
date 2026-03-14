import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// DATABASE_URL or POSTGRES_URL (Vercel Supabase integration); placeholder for build when neither is set
const BUILD_PLACEHOLDER = "postgresql://build:build@localhost:5432/build";
const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  BUILD_PLACEHOLDER;

// On Vercel runtime without DB env, placeholder would connect to localhost and hang. Fail fast.
const isVercelRuntime = typeof process.env.VERCEL === "string";
const usePlaceholderInRuntime = connectionString === BUILD_PLACEHOLDER && isVercelRuntime;

// Supabase pooler (port 6543) + Vercel serverless: max 1 connection, disable prepared statements for PgBouncer
const isPooler = connectionString.includes(":6543") || connectionString.includes("pooler.supabase");
const postgresOptions = {
  ...(isPooler ? { max: 1, prepare: false } : { max: 1 }),
  // Avoid infinite hang on Vercel when DB is missing or unreachable (default 30s is too long)
  connect_timeout: usePlaceholderInRuntime ? 3 : 10,
};

export const db = drizzle(postgres(connectionString, postgresOptions), { schema });
