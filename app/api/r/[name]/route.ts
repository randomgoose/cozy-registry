import { NextResponse } from "next/server";
import {
  getRegistryItemByName,
  toShadcnRegistryItem,
} from "@/lib/registry";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const item = await getRegistryItemByName(name);

  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const shadcnItem = toShadcnRegistryItem(item);
  return NextResponse.json(shadcnItem);
}
