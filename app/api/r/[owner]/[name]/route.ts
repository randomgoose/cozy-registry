import { NextResponse } from "next/server";
import {
  getCurrentVersion,
  getRegistryItemByOwnerNameAndVersion,
  toShadcnRegistryItem,
} from "@/lib/registry";
import { getUserIdFromToken } from "@/lib/auth-api";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ owner: string; name: string }> },
) {
  const { owner, name } = await params;
  const url = new URL(request.url);
  const version = url.searchParams.get("v") ?? undefined;
  const userId = await getUserIdFromToken(request);
  const item = await getRegistryItemByOwnerNameAndVersion(
    owner,
    name,
    version || null,
    userId,
  );

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
  const installVersion = version && version.trim().length > 0
    ? version.trim()
    : getCurrentVersion(item as any);

  const header = `// cozy-registry: @${owner}/${item.name} v${installVersion}\n`;

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
    files: filesWithHeader,
  });
}
