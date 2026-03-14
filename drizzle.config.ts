import { defineConfig } from "drizzle-kit";

// drizzle-kit push 在 Supabase pooler (6543) 下会卡住，需用直连 (5432)
// 在 Supabase: Project Settings → Database → Connection string → Session mode
const dbUrl =
  process.env.DATABASE_DIRECT_URL ||
  process.env.DATABASE_URL!;

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: dbUrl,
  },
});
