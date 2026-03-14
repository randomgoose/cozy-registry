import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// DATABASE_URL or POSTGRES_URL (Vercel Supabase integration); placeholder for build when neither is set
const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  "postgresql://build:build@localhost:5432/build";

// Supabase pooler (port 6543) + Vercel serverless: max 1 connection, disable prepared statements for PgBouncer
const isPooler = connectionString.includes(":6543") || connectionString.includes("pooler.supabase");
const postgresOptions = isPooler
  ? { max: 1, prepare: false }
  : { max: 1 };

export const db = drizzle(postgres(connectionString, postgresOptions), { schema });
