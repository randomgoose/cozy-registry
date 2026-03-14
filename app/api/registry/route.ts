import { NextResponse } from "next/server";
import { getRegistryItems, toShadcnRegistryItemSummary } from "@/lib/registry";

export async function GET() {
  const items = await getRegistryItems();

  const registry = {
    $schema: "https://ui.shadcn.com/schema/registry.json",
    name: "registry",
    homepage: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    items: items.map(toShadcnRegistryItemSummary),
  };

  return NextResponse.json(registry);
}
