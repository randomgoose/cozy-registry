import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * 健康检查：用于调试 Vercel 生产环境的数据库连接问题。
 * 访问 /api/health 可查看实际错误信息（生产环境会隐藏具体错误）。
 */
export async function GET() {
  const hasDbUrl = !!(process.env.DATABASE_URL || process.env.POSTGRES_URL);
  try {
    await db.execute(sql`SELECT 1`);
    return Response.json({ ok: true, db: "connected", hasEnv: hasDbUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const name = err instanceof Error ? err.name : "Error";
    return Response.json(
      {
        ok: false,
        db: "error",
        hasEnv: hasDbUrl,
        error: message,
        errorName: name,
      },
      { status: 503 }
    );
  }
}
