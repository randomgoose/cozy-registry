import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getRegistryItemVersions,
  getRegistryItemByOwnerNameAndVersion,
  createRegistryItemVersion,
  getCurrentVersion,
} from "@/lib/registry";

type Params = { params: Promise<{ owner: string; name: string }> };

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

  const versions = await getRegistryItemVersions(owner, name, userId);
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

  let body: { content?: string; bump?: "patch" | "minor" | "major"; message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { content, bump, message } = body;
  if (typeof content !== "string" || !content.trim()) {
    return NextResponse.json(
      { error: "content is required" },
      { status: 400 }
    );
  }
  const bumpType = bump ?? "patch";
  if (!["patch", "minor", "major"].includes(bumpType)) {
    return NextResponse.json(
      { error: "bump must be patch, minor, or major" },
      { status: 400 }
    );
  }

  try {
    const result = await createRegistryItemVersion({
      ownerId: owner,
      name,
      content: content.trim(),
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
