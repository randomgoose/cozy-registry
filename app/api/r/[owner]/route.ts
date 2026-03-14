import { NextResponse } from "next/server";
import {
  getRegistryItemByName,
  toShadcnRegistryItem,
} from "@/lib/registry";
import { getUserIdFromToken } from "@/lib/auth-api";

/**
 * Backward compat: /api/r/[owner] (single segment) treats segment as component name.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ owner: string }> }
) {
  const { owner: nameFromPath } = await params;
  const userId = await getUserIdFromToken(request);
  const item = await getRegistryItemByName(nameFromPath, userId);

  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const shadcnItem = toShadcnRegistryItem(item);
  return NextResponse.json(shadcnItem);
}
