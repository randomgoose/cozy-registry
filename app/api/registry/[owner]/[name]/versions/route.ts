import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getRegistryItemVersions,
  getRegistryItemByOwnerNameAndVersion,
  createRegistryItemVersion,
  getCurrentVersion,
} from "@/lib/registry";
import { resolveOwner } from "@/lib/owner";
import { validateComponentBundle, validateTsx } from "@/lib/validate-tsx";

type Params = { params: Promise<{ owner: string; name: string }> };

type VersionRequestBody = {
  content?: string;
  files?: Record<string, unknown>;
  bump?: "patch" | "minor" | "major";
  message?: string;
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
  if (hasFiles) {
    const validation = validateComponentBundle(
      normalizedFiles as Record<string, string>,
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
  } else if (normalizedContent) {
    const validation = validateTsx(normalizedContent);
    if (!validation.valid) {
      return NextResponse.json(
        { error: `Invalid TSX: ${validation.error}` },
        { status: 400 }
      );
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
    const resolved = await resolveOwner(owner);
    if (!resolved) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const result = await createRegistryItemVersion({
      ownerId: resolved.userId,
      name,
      content: normalizedContent,
      files: hasFiles ? (normalizedFiles as Record<string, string>) : undefined,
      bump: bumpType,
      userId,
      message: typeof message === "string" ? message : undefined,
    });
    return NextResponse.json({ version: result.version });
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
