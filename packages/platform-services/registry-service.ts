import {
  getCurrentVersion,
  getRegistryItemByName,
  getRegistryItemsByTeamId,
  getRegistryItemsByUserId,
  getRegistryItemByOwnerNameAndVersionScoped,
  getRegistryItemsScoped,
  toShadcnRegistryItem,
  toShadcnRegistryItemSummary,
} from "@cozy/registry-domain/registry";
import { resolveOwner } from "@cozy/registry-domain/owner";
import { getRegistryPolicyForApiKey } from "@cozy/registry-domain/registry-policy";
import { getTeamCanonicalOwnerRef, isUserTeamMember } from "@cozy/auth-control/registry-team";
import type { PlatformRequestContext } from "@cozy/platform-core/platform-context";

type RegistryAccessContext = Pick<PlatformRequestContext, "userId" | "apiKeyId">;

export function parseRegistryListQuery(searchParams: URLSearchParams) {
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

  return {
    limit,
    listLimit: limit != null ? limit + 1 : undefined,
    listOffset: limit != null ? offset : undefined,
  };
}

export async function listRegistryCatalog(input: {
  context: RegistryAccessContext;
  searchParams: URLSearchParams;
  homepage: string;
}) {
  const { limit, listLimit, listOffset } = parseRegistryListQuery(input.searchParams);
  const policy = input.context.apiKeyId
    ? await getRegistryPolicyForApiKey(input.context.apiKeyId)
    : null;
  const rows = await getRegistryItemsScoped({
    requestUserId: input.context.userId,
    policy,
    listLimit,
    listOffset,
  });
  const items = limit != null && rows.length > limit ? rows.slice(0, limit) : rows;

  return {
    $schema: "https://ui.shadcn.com/schema/registry.json",
    name: "cozy",
    homepage: input.homepage,
    items: items.map(toShadcnRegistryItemSummary),
  };
}

export function parseRegistrySpecSegments(spec: string[]): {
  owner: string | null;
  name: string | null;
} {
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

  try {
    const decoded = decodeURIComponent(only);
    const idx = decoded.indexOf("/");
    if (idx > 0) {
      return { owner: decoded.slice(0, idx), name: decoded.slice(idx + 1) };
    }
  } catch {
    // ignore malformed segment and fall back to legacy lookup
  }

  return { owner: null, name: only };
}

export async function getRegistryConsumptionPayload(input: {
  context: RegistryAccessContext;
  owner: string | null;
  name: string;
  version?: string | null;
}) {
  const policy = input.context.apiKeyId
    ? await getRegistryPolicyForApiKey(input.context.apiKeyId)
    : null;

  const item = input.owner
    ? await getRegistryItemByOwnerNameAndVersionScoped({
        ownerId: input.owner,
        name: input.name,
        version: input.version || null,
        requestUserId: input.context.userId,
        policy,
      })
    : await getRegistryItemByName(input.name, input.context.userId);

  if (!item) {
    return null;
  }

  const shadcnItem = toShadcnRegistryItem(item);
  if (!shadcnItem) {
    throw new Error("Failed to convert registry item to shadcn format");
  }

  const installVersion =
    input.version && input.version.trim().length > 0
      ? input.version.trim()
      : getCurrentVersion(item);

  const fallbackOwner = input.owner ?? "legacy";
  const canonicalOwner = item.teamId
    ? (await getTeamCanonicalOwnerRef(item.teamId)) ?? fallbackOwner
    : (await resolveOwner(item.userId ?? fallbackOwner))?.handle ?? fallbackOwner;
  const header = `// cozy-registry: @${canonicalOwner}/${item.name} v${installVersion}\n`;

  const files = shadcnItem.files.map((file) => {
    const lower = file.path.toLowerCase();
    const isCodeFile =
      lower.endsWith(".tsx") ||
      lower.endsWith(".ts") ||
      lower.endsWith(".jsx") ||
      lower.endsWith(".js");

    if (!isCodeFile || file.content.startsWith("// cozy-registry:")) {
      return file;
    }

    return { ...file, content: `${header}${file.content}` };
  });

  const dependencies = (shadcnItem.dependencies ?? []).filter((spec) => {
    return (
      typeof spec === "string" &&
      !spec.startsWith("./") &&
      !spec.startsWith("../") &&
      !spec.startsWith("/")
    );
  });

  return {
    ...shadcnItem,
    dependencies,
    files,
  };
}

export async function listOwnedRegistryItems(input: {
  context: Pick<PlatformRequestContext, "userId">;
  teamId?: string | null;
}) {
  if (!input.context.userId) {
    return { status: 401, body: { error: "Authentication required" } };
  }

  if (input.teamId) {
    const isMember = await isUserTeamMember(input.context.userId, input.teamId);
    if (!isMember) {
      return { status: 403, body: { error: "Forbidden" } };
    }
    const items = await getRegistryItemsByTeamId(input.teamId);
    return { status: 200, body: { items } };
  }

  const items = await getRegistryItemsByUserId(input.context.userId);
  return { status: 200, body: { items } };
}

export async function lookupRegistryItemByName(input: {
  name: string;
  context: Pick<PlatformRequestContext, "userId">;
}) {
  const item = await getRegistryItemByName(input.name, input.context.userId);
  if (!item) {
    return null;
  }

  const owner = item.userId
    ? (await resolveOwner(item.userId))?.handle ?? item.userId
    : "legacy";

  return {
    owner,
    name: item.name,
  };
}
