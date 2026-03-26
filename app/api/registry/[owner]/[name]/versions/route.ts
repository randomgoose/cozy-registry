import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getRegistryItemVersions,
  getRegistryItemByOwnerNameAndVersion,
  createRegistryItemVersion,
  getCurrentVersion,
} from "@/lib/registry";
import { resolveOwner } from "@/lib/owner";
import {
  REGISTRY_THEME_TYPE,
  normalizeRegistryItemType,
} from "@/lib/registry-types";
import { validateComponentBundle, validateTsx } from "@/lib/validate-tsx";
import { parseTokensFromJson, tokensToRootCss } from "@/lib/theme-tokens";
import { analyzeUploadStyleHints } from "@/lib/upload-style-hints";
import { normalizePublishContract } from "@/lib/registry-publish-contract";

type Params = { params: Promise<{ owner: string; name: string }> };

type VersionRequestBody = {
  content?: string;
  files?: Record<string, unknown>;
  bump?: "patch" | "minor" | "major";
  message?: string;
  registryDependencies?: unknown;
  previewProps?: unknown;
  previewExport?: unknown;
};

/** 获取组件的版本列表 + 当前版本 */
export async function GET(request: Request, { params }: Params) {
  const { owner, name } = await params;
  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user?.id ?? null;

  const item = await getRegistryItemByOwnerNameAndVersion(
    owner,
    name,
    null,
    userId
  );
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const resolved = await resolveOwner(owner);
  if (!resolved) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const versions = await getRegistryItemVersions(resolved.userId, name, userId);
  const currentVersion = getCurrentVersion(item);

  return NextResponse.json({
    currentVersion,
    versions: versions.map((v) => ({
      version: v.version,
      createdAt: v.createdAt,
      createdBy: v.createdBy,
      message: v.message ?? null,
    })),
  });
}

/** 发布新版本（Vibe 更新组件时调用），需登录且为 owner */
export async function POST(request: Request, { params }: Params) {
  const { owner, name } = await params;
  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: VersionRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { content, files, bump, message } = body;
  const resolved = await resolveOwner(owner);
  if (!resolved) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const item = await getRegistryItemByOwnerNameAndVersion(
    owner,
    name,
    null,
    userId,
  );
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const normalizedType = normalizeRegistryItemType(item.type);
  const isTheme = normalizedType === REGISTRY_THEME_TYPE;
  const normalizedFiles =
    files && typeof files === "object" && !Array.isArray(files)
      ? Object.fromEntries(
          Object.entries(files).filter(([, value]) => typeof value === "string"),
        )
      : undefined;
  const hasFiles = !!normalizedFiles && Object.keys(normalizedFiles).length > 0;
  const normalizedContent =
    typeof content === "string" && content.trim().length > 0
      ? content.trim()
      : undefined;

  if (!hasFiles && !normalizedContent) {
    return NextResponse.json(
      { error: "content or files is required" },
      { status: 400 }
    );
  }

  let finalFiles = hasFiles ? (normalizedFiles as Record<string, string>) : undefined;
  let finalContent = normalizedContent;

  if (isTheme) {
    const maybeTokensJson =
      (finalFiles && typeof finalFiles["tokens.json"] === "string"
        ? finalFiles["tokens.json"]
        : undefined) ??
      (typeof finalContent === "string" && finalContent.trim().startsWith("{")
        ? finalContent
        : undefined);

    if (maybeTokensJson) {
      const tokens = parseTokensFromJson(maybeTokensJson);
      const css = tokensToRootCss(tokens);
      if (!css) {
        return NextResponse.json(
          { error: "Failed to derive CSS from tokens.json (no tokens found)" },
          { status: 400 },
        );
      }
      finalFiles = {
        "theme.css": css,
        "tokens.json": maybeTokensJson,
      };
      finalContent = undefined;
    }
  }

  const contract = normalizePublishContract({
    mode: "version",
    input: body as {
      registryDependencies?: unknown;
      previewProps?: unknown;
      previewExport?: unknown;
      provenance?: unknown;
      provenancePolicy?: unknown;
    },
    files: finalFiles,
    previousRegistryDependencies: (item.registryDependencies ?? []) as string[],
  });
  if (!contract.ok) {
    return NextResponse.json(
      { error: contract.error, code: contract.code },
      { status: 400 },
    );
  }

  if (finalFiles) {
    if (isTheme) {
      const hasThemePayload =
        Object.keys(finalFiles).length > 0 &&
        Object.values(finalFiles).some(
          (value) => typeof value === "string" && value.trim().length > 0,
        );
      if (!hasThemePayload) {
        return NextResponse.json(
          { error: "Theme files must include CSS or tokens content" },
          { status: 400 },
        );
      }
    } else {
    const validation = validateComponentBundle(
      (contract.value.filesToWrite ?? finalFiles) as Record<string, string>,
    );
    if (!validation.valid) {
      const details =
        validation.invalidFiles?.length
          ? validation.invalidFiles.slice(0, 10).join("\n")
          : validation.missingImports?.slice(0, 20).join("\n");
      return NextResponse.json(
        {
          error: details
            ? `${validation.error}:\n${details}`
            : validation.error ?? "Invalid component bundle",
        },
        { status: 400 }
      );
    }
    }
  } else if (finalContent) {
    if (isTheme) {
      if (finalContent.trim().length === 0) {
        return NextResponse.json(
          { error: "Theme content is required" },
          { status: 400 },
        );
      }
    } else {
      const validation = validateTsx(finalContent);
      if (!validation.valid) {
      return NextResponse.json(
        { error: `Invalid TSX: ${validation.error}` },
        { status: 400 }
      );
    }
    }
  }
  const bumpType = bump ?? "patch";
  if (!["patch", "minor", "major"].includes(bumpType)) {
    return NextResponse.json(
      { error: "bump must be patch, minor, or major" },
      { status: 400 }
    );
  }

  try {
    const hints = analyzeUploadStyleHints({
      itemType: normalizedType,
      files: finalFiles ?? undefined,
      content: finalFiles ? null : finalContent,
    });
    const result = await createRegistryItemVersion({
      ownerId: resolved.userId,
      name,
      content: finalContent,
      files: contract.value.filesToWrite ?? finalFiles,
      bump: bumpType,
      userId,
      message: typeof message === "string" ? message : undefined,
      registryDependencies: contract.value.registryDependenciesToWrite,
      previewProps: contract.value.previewProps,
      previewExport: contract.value.previewExport,
    });
    return NextResponse.json({
      version: result.version,
      hints,
      publishDiagnostics: {
        appliedRegistryDependencies:
          contract.value.appliedRegistryDependencies ??
          contract.value.registryDependenciesToWrite ??
          ((item.registryDependencies ?? []) as string[]),
        droppedPaths: contract.value.diagnostics.droppedPaths,
        dirtyDependencyPaths: contract.value.diagnostics.dirtyDependencyPaths,
        stubInferredRegistryDependencies:
          contract.value.diagnostics.stubInferredRegistryDependencies,
        policyApplied: contract.value.diagnostics.policyApplied,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg.includes("not found") || msg.includes("no access")) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    if (msg.includes("Only owner")) {
      return NextResponse.json({ error: msg }, { status: 403 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
