import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  getCurrentVersion,
  getRegistryItemByName,
  getRegistryItemByScopedIdentityAndVersion,
  toShadcnRegistryItem,
} from "@/lib/registry";
import { getAuthContextFromToken } from "@/lib/auth-api";
import { resolveOwner } from "@/lib/owner";
import { getOrganizationCanonicalOwnerRef } from "@/lib/registry-organization";
import {
  getRegistryPolicyForApiKey,
  type RegistryPolicy,
} from "@/lib/registry-policy";
import { isBarePackageSpecifier } from "@/lib/module-specifiers";

function parseScopedSpec(spec: string[]): {
  owner: string | null;
  project: string | null;
  name: string | null;
} {
  if (spec.length >= 3) {
    return {
      owner: spec[0] ?? null,
      project: spec[1] ?? null,
      name: spec.slice(2).join("/"),
    };
  }
  if (spec.length >= 2) {
    return {
      owner: spec[0] ?? null,
      project: null,
      name: spec.slice(1).join("/"),
    };
  }

  const only = spec[0];
  if (!only) return { owner: null, project: null, name: null };

  // Support encoded "owner%2Fname" packed into one segment.
  try {
    const decoded = decodeURIComponent(only);
    const idx = decoded.indexOf("/");
    if (idx > 0) {
      return {
        owner: decoded.slice(0, idx),
        project: null,
        name: decoded.slice(idx + 1),
      };
    }
  } catch {
    // ignore
  }

  // Fallback: legacy un-namespaced lookup by name only.
  return { owner: null, project: null, name: only };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ spec: string[] }> },
) {
  const { spec } = await params;
  const { owner, project, name } = parseScopedSpec(spec);
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
    ? await getRegistryItemByScopedIdentityAndVersion({
        ownerId: owner,
        projectKey: project,
        name,
        version: version || null,
        requestUserId: userId,
      })
    : await getRegistryItemByName(name, userId);

  const visibleItem = item ? await applyRegistryPolicy(item, policy) : null;

  if (!visibleItem) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const shadcnItem = toShadcnRegistryItem(visibleItem);
  if (!shadcnItem) {
    return NextResponse.json(
      { error: "Failed to convert registry item to shadcn format" },
      { status: 500 },
    );
  }

  const installVersion =
    version && version.trim().length > 0 ? version.trim() : getCurrentVersion(visibleItem);

  const canonicalOwner = visibleItem.organizationId
    ? (await getOrganizationCanonicalOwnerRef(visibleItem.organizationId)) ??
      owner ??
      "legacy"
    : (await resolveOwner(visibleItem.userId ?? owner ?? "legacy"))?.handle ??
      owner ??
      "legacy";
  const header = `// cozy-registry: @${canonicalOwner}/${visibleItem.name} v${installVersion}\n`;

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

async function applyRegistryPolicy<T extends {
  id: string;
  type: string;
  visibility: string | null;
  userId?: string | null;
  organizationId?: string | null;
  canonicalProjectId?: string | null;
}>(item: T, policy: RegistryPolicy | null) {
  if (!policy) return item;

  const allowedTypes = (policy.allowedTypes ?? []).filter(Boolean);
  if (allowedTypes.length > 0 && !allowedTypes.includes(item.type)) return null;

  const allowedOwners = (policy.allowedOwnerHandlesOrIds ?? []).filter(Boolean);
  if (allowedOwners.length > 0) {
    const ownerHandle =
      item.userId != null ? ((await resolveOwner(item.userId))?.handle ?? null) : null;
    const orgRef =
      item.organizationId != null
        ? await getOrganizationCanonicalOwnerRef(item.organizationId)
        : null;
    const matches =
      (item.userId != null && allowedOwners.includes(item.userId)) ||
      (ownerHandle != null && allowedOwners.includes(ownerHandle)) ||
      (item.organizationId != null &&
        policy.ownerOrganizationId != null &&
        item.organizationId === policy.ownerOrganizationId) ||
      (orgRef != null && allowedOwners.includes(orgRef));
    if (!matches) return null;
  }

  const allowedProjectIds = policy.allowedProjectIds ?? [];
  const allowPublicOutsideProjects = !!policy.allowPublicOutsideProjects;
  if (allowedProjectIds.length === 0) {
    if (!allowPublicOutsideProjects) return null;
    if (item.visibility !== "public") return null;
    return item;
  }

  if (allowPublicOutsideProjects && item.visibility === "public") {
    return item;
  }

  return item.canonicalProjectId && allowedProjectIds.includes(item.canonicalProjectId)
    ? item
    : null;
}
