import { NextResponse } from "next/server";
import { getRegistryItemsScoped, toShadcnRegistryItemSummary } from "@/lib/registry";
import { getAuthContextFromToken } from "@/lib/auth-api";
import { getRegistryPolicyForApiKey } from "@/lib/registry-policy";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limitRaw = searchParams.get("limit");
  const offsetRaw = searchParams.get("offset");
  const limit =
    limitRaw != null && limitRaw !== ""
      ? Math.min(200, Math.max(1, parseInt(limitRaw, 10) || 0))
      : undefined;
  const offset =
    offsetRaw != null && offsetRaw !== ""
      ? Math.max(0, parseInt(offsetRaw, 10) || 0)
      : undefined;
  const listLimit = limit != null ? limit + 1 : undefined;
  const listOffset = limit != null ? offset : undefined;

  const ctx = await getAuthContextFromToken(request);
  const policy = ctx ? await getRegistryPolicyForApiKey(ctx.apiKeyId) : null;
  const rows = await getRegistryItemsScoped({
    requestUserId: ctx?.userId ?? null,
    policy,
    listLimit,
    listOffset,
  });
  const items =
    limit != null && rows.length > limit ? rows.slice(0, limit) : rows;

  const registry = {
    $schema: "https://ui.shadcn.com/schema/registry.json",
    name: "cozy",
    homepage: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    items: items.map(toShadcnRegistryItemSummary),
  };

  return NextResponse.json(registry);
}
