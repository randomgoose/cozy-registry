import { NextResponse } from "next/server";
import { getRegistryItems, toShadcnRegistryItemSummary } from "@/lib/registry";
import { getUserIdFromToken } from "@/lib/auth-api";

export async function GET(request: Request) {
  const userId = await getUserIdFromToken(request);
  const items = await getRegistryItems(userId);

  const registry = {
    $schema: "https://ui.shadcn.com/schema/registry.json",
    name: "registry",
    homepage: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    items: items.map(toShadcnRegistryItemSummary),
  };

  return NextResponse.json(registry);
}
