import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { and, desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import {
  getCurrentVersion,
  getRegistryItemByOwnerNameAndVersionScoped,
  toShadcnRegistryItem,
} from "@/lib/registry";
import { readDependencyDecisionsFromMeta } from "@/lib/third-party-dependency-governance";
import { getAuthContextFromToken } from "@/lib/auth-api";
import { resolveOwner } from "@/lib/owner";
import { getOrganizationCanonicalOwnerRef } from "@/lib/registry-organization";
import { getRegistryPolicyForApiKey } from "@/lib/registry-policy";
import { findAccessibleRegistryProjectBySlug } from "@/lib/registry-project-access";
import { db } from "@/lib/db";
import {
  registryFileVersions,
  registryItems,
  registryItemVersions,
  registryProjectItems,
} from "@/lib/db/schema";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ owner: string; name: string }> },
) {
  const { owner, name } = await params;
  const url = new URL(request.url);
  const version = url.searchParams.get("v") ?? undefined;
  const projectSlug = url.searchParams.get("project")?.trim() || null;
  const session = await auth.api.getSession({ headers: await headers() });
  const tokenCtx = await getAuthContextFromToken(request);
  const userId = tokenCtx?.userId ?? session?.user?.id ?? null;
  const policy = tokenCtx ? await getRegistryPolicyForApiKey(tokenCtx.apiKeyId) : null;

  const item = await (async () => {
    if (!projectSlug || !userId) {
      return getRegistryItemByOwnerNameAndVersionScoped({
        ownerId: owner,
        name,
        version: version || null,
        requestUserId: userId,
        policy,
      });
    }
    const project = await findAccessibleRegistryProjectBySlug(userId, projectSlug);
    if (!project) return null;
    const ownershipPredicate =
      project.organizationId != null
        ? eq(registryItems.organizationId, project.organizationId)
        : project.ownerUserId != null
          ? eq(registryItems.userId, project.ownerUserId)
          : null;
    if (!ownershipPredicate) return null;
    const [linked] = await db
      .select({ itemId: registryItems.id })
      .from(registryProjectItems)
      .innerJoin(registryItems, eq(registryProjectItems.itemId, registryItems.id))
      .where(
        and(
          eq(registryProjectItems.projectId, project.id),
          eq(registryItems.name, name),
          ownershipPredicate,
        ),
      )
      .orderBy(desc(registryItems.updatedAt))
      .limit(1);
    if (!linked) return null;

    const base = await db.query.registryItems.findFirst({
      where: eq(registryItems.id, linked.itemId),
      with: { files: true },
    });
    if (!base || (base.status !== "active" && base.status !== "archived")) return null;

    const currentVer = getCurrentVersion(base);
    if (!version || version === currentVer) return base;
    const [itemVersion] = await db
      .select()
      .from(registryItemVersions)
      .where(
        and(eq(registryItemVersions.itemId, base.id), eq(registryItemVersions.version, version)),
      );
    if (!itemVersion) return null;
    const versionFiles = await db
      .select()
      .from(registryFileVersions)
      .where(eq(registryFileVersions.itemVersionId, itemVersion.id));
    return {
      ...base,
      title: itemVersion.title,
      description: itemVersion.description,
      dependencies: itemVersion.dependencies,
      registryDependencies: itemVersion.registryDependencies,
      meta: itemVersion.meta ?? base.meta,
      files: versionFiles.map((f) => ({
        path: f.path,
        content: f.content,
        type: f.type,
      })),
    };
  })();

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

  // 计算当前安装的版本（显式 ?v 优先，其次为 currentVersion）
  const installVersion =
    version && version.trim().length > 0 ? version.trim() : getCurrentVersion(item);

  const canonicalOwner = item.organizationId
    ? (await getOrganizationCanonicalOwnerRef(item.organizationId)) ?? owner
    : (await resolveOwner(item.userId ?? owner))?.handle ?? owner;
  const header = `// cozy-registry: @${canonicalOwner}/${item.name} v${installVersion}\n`;

  // 为 TS/TSX/JS/JSX 文件注入注释头，方便后续工具或 AI 识别来源与版本
  const filesWithHeader = shadcnItem.files.map((f) => {
    const lower = f.path.toLowerCase();
    const isCodeFile =
      lower.endsWith(".tsx") ||
      lower.endsWith(".ts") ||
      lower.endsWith(".jsx") ||
      lower.endsWith(".js");

    if (!isCodeFile) return f;
    if (f.content.startsWith("// cozy-registry:")) return f;

    return {
      ...f,
      content: `${header}${f.content}`,
    };
  });

  const isBare = (spec: string) =>
    typeof spec === "string" &&
    !spec.startsWith("./") &&
    !spec.startsWith("../") &&
    !spec.startsWith("/");

  const cleanDependencies = (shadcnItem.dependencies ?? []).filter(isBare);

  return NextResponse.json({
    ...shadcnItem,
    dependencies: cleanDependencies,
    dependencyDiagnostics: readDependencyDecisionsFromMeta(item.meta),
    files: filesWithHeader,
  });
}
