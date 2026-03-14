import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getRegistryItemByName } from "@/lib/registry";
import { getUserIdFromToken } from "@/lib/auth-api";

/**
 * Backward compat: /preview/[name] redirects to /preview/[owner]/[name]
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user?.id ?? (await getUserIdFromToken(request));
  const item = await getRegistryItemByName(name, userId);

  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const owner = item.userId ?? "legacy";
  return NextResponse.redirect(new URL(`/preview/${owner}/${name}`, request.url));
}
