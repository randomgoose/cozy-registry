import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";

const HANDLE_RE = /^[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])?$/;

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const handle =
    body && typeof body === "object" && "handle" in body
      ? String((body as Record<string, unknown>).handle ?? "").trim().toLowerCase()
      : "";

  if (!HANDLE_RE.test(handle)) {
    return NextResponse.json(
      { error: "用户名格式不正确（仅小写字母/数字/.-_，长度 2-30）" },
      { status: 400 },
    );
  }

  // Only allow first-time set: must currently be null.
  const updated = await db
    .update(user)
    .set({ handle })
    .where(and(eq(user.id, userId), isNull(user.handle)))
    .returning({ handle: user.handle });

  if (updated.length > 0) {
    return NextResponse.json({ success: true, handle });
  }

  // Either already set or conflict. Check which.
  const [self] = await db
    .select({ handle: user.handle })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (self?.handle) {
    return NextResponse.json(
      { error: "用户名已设置，暂不支持修改" },
      { status: 409 },
    );
  }

  return NextResponse.json(
    { error: "用户名已被占用" },
    { status: 409 },
  );
}

