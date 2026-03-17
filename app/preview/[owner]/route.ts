import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getRegistryItemByName } from "@/lib/registry";
import { getUserIdFromToken } from "@/lib/auth-api";
import { resolveOwner } from "@/lib/owner";

/**
 * Backward compat: /preview/[owner] (single segment) treats segment as component name,
 * looks up and redirects to /preview/[owner]/[name].
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ owner: string }> }
) {
  const { owner: nameFromPath } = await params;
  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user?.id ?? (await getUserIdFromToken(request));
  const item = await getRegistryItemByName(nameFromPath, userId);

  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const resolved = item.userId ? await resolveOwner(item.userId) : null;
  const owner = resolved?.handle ?? item.userId ?? "legacy";
  return NextResponse.redirect(new URL(`/preview/${owner}/${item.name}`, request.url));
}
