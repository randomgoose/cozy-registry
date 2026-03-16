import { NextResponse } from "next/server";
import {
  getRegistryItemByOwnerNameAndVersion,
  toShadcnRegistryItem,
} from "@/lib/registry";
import { getUserIdFromToken } from "@/lib/auth-api";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ owner: string; name: string }> }
) {
  const { owner, name } = await params;
  const url = new URL(request.url);
  const version = url.searchParams.get("v") ?? undefined;
  const userId = await getUserIdFromToken(request);
  const item = await getRegistryItemByOwnerNameAndVersion(
    owner,
    name,
    version || null,
    userId
  );

  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const shadcnItem = toShadcnRegistryItem(item);
  return NextResponse.json(shadcnItem);
}
