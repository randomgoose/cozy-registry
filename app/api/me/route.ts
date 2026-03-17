import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const [row] = await db
    .select({ id: user.id, email: user.email, name: user.name, handle: user.handle })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  return NextResponse.json({ user: row ?? null });
}

