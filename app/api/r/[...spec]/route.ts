import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  getCurrentVersion,
  getRegistryItemByName,
  getRegistryItemByOwnerNameAndVersionScoped,
  toShadcnRegistryItem,
} from "@/lib/registry";
import { getAuthContextFromToken } from "@/lib/auth-api";
import { resolveOwner } from "@/lib/owner";
import { getOrganizationCanonicalOwnerRef } from "@/lib/registry-organization";
import { getRegistryPolicyForApiKey } from "@/lib/registry-policy";
import { isBarePackageSpecifier } from "@/lib/module-specifiers";

function parseOwnerAndName(spec: string[]): { owner: string | null; name: string | null } {
  if (spec.length >= 3) {
    return {
      owner: `${spec[0]}/${spec[1]}`,
      name: spec.slice(2).join("/"),
    };
  }
  if (spec.length >= 2) {
    return { owner: spec[0] ?? null, name: spec.slice(1).join("/") };
  }

  const only = spec[0];
  if (!only) return { owner: null, name: null };

  // Support encoded "owner%2Fname" packed into one segment.
  try {
    const decoded = decodeURIComponent(only);
    const idx = decoded.indexOf("/");
    if (idx > 0) {
      return { owner: decoded.slice(0, idx), name: decoded.slice(idx + 1) };
    }
  } catch {
    // ignore
  }

  // Fallback: legacy un-namespaced lookup by name only.
  return { owner: null, name: only };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ spec: string[] }> },
) {
  const { spec } = await params;
  const { owner, name } = parseOwnerAndName(spec);
  if (!name) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const version = url.searchParams.get("v") ?? undefined;
  const session = await auth.api.getSession({ headers: await headers() });
  const tokenCtx = await getAuthContextFromToken(request);
  const userId = tokenCtx?.userId ?? session?.user?.id ?? null;
  const policy = tokenCtx ? await getRegistryPolicyForApiKey(tokenCtx.apiKeyId) : null;

  const item = owner
    ? await getRegistryItemByOwnerNameAndVersionScoped({
        ownerId: owner,
        name,
        version: version || null,
        requestUserId: userId,
        policy,
      })
    : await getRegistryItemByName(name, userId);

  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const shadcnItem = toShadcnRegistryItem(item);
  if (!shadcnItem) {
    return NextResponse.json(
      { error: "Failed to convert registry item to shadcn format" },
      { status: 500 },
    );
  }

  const installVersion =
    version && version.trim().length > 0 ? version.trim() : getCurrentVersion(item);

  const canonicalOwner = item.organizationId
    ? (await getOrganizationCanonicalOwnerRef(item.organizationId)) ?? owner ?? "legacy"
    : (await resolveOwner(item.userId ?? owner ?? "legacy"))?.handle ?? owner ?? "legacy";
  const header = `// cozy-registry: @${canonicalOwner}/${item.name} v${installVersion}\n`;

  const filesWithHeader = shadcnItem.files.map((f) => {
    const lower = f.path.toLowerCase();
    const isCodeFile =
      lower.endsWith(".tsx") ||
      lower.endsWith(".ts") ||
      lower.endsWith(".jsx") ||
      lower.endsWith(".js");

    if (!isCodeFile) return f;
    if (f.content.startsWith("// cozy-registry:")) return f;

    return { ...f, content: `${header}${f.content}` };
  });

  const cleanDependencies = (shadcnItem.dependencies ?? []).filter(
    (spec) => typeof spec === "string" && isBarePackageSpecifier(spec),
  );

  return NextResponse.json({
    ...shadcnItem,
    dependencies: cleanDependencies,
    files: filesWithHeader,
  });
}
