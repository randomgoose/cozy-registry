import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function PostAuthPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;

  if (!userId) {
    redirect("/sign-in?callbackUrl=%2Fpost-auth");
  }

  const [row] = await db
    .select({ handle: user.handle })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  redirect(row?.handle ? "/dashboard" : "/onboarding/handle");
}
