import { NextResponse } from "next/server";
import { getRegistryItemsScoped, toShadcnRegistryItemSummary } from "@/lib/registry";
import { getAuthContextFromToken } from "@/lib/auth-api";
import { getRegistryPolicyForApiKey } from "@/lib/registry-policy";

export async function GET(request: Request) {
  const ctx = await getAuthContextFromToken(request);
  const policy = ctx ? await getRegistryPolicyForApiKey(ctx.apiKeyId) : null;
  const items = await getRegistryItemsScoped({
    requestUserId: ctx?.userId ?? null,
    policy,
  });

  const registry = {
    $schema: "https://ui.shadcn.com/schema/registry.json",
    name: "cozy",
    homepage: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    items: items.map(toShadcnRegistryItemSummary),
  };

  return NextResponse.json(registry);
}
