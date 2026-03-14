import { NextResponse } from "next/server";
import {
  getRegistryItemByOwnerAndName,
  toShadcnRegistryItem,
} from "@/lib/registry";
import { getUserIdFromToken } from "@/lib/auth-api";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ owner: string; name: string }> }
) {
  const { owner, name } = await params;
  const userId = await getUserIdFromToken(request);
  const item = await getRegistryItemByOwnerAndName(owner, name, userId);

  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const shadcnItem = toShadcnRegistryItem(item);
  return NextResponse.json(shadcnItem);
}
