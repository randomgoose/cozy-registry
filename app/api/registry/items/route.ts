import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createRegistryItem } from "@/lib/registry";
import { validateTsx, extractDependencies } from "@/lib/validate-tsx";
import { auth } from "@/lib/auth";
import { getUserIdFromToken } from "@/lib/auth-api";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, type, title, description, content, files, visibility } = body;

    const hasFiles =
      files &&
      typeof files === "object" &&
      !Array.isArray(files) &&
      Object.keys(files as Record<string, unknown>).length > 0;

    if (!name || !type || !title || (!hasFiles && !content)) {
      return NextResponse.json(
        { error: "Missing required fields: name, type, title, and (files or content)" },
        { status: 400 }
      );
    }

    let userId: string | null = null;
    const session = await auth.api.getSession({ headers: await headers() });
    if (session?.user?.id) userId = session.user.id;
    if (!userId) userId = await getUserIdFromToken(request);
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required. Sign in or provide Authorization: Bearer <token>" },
        { status: 401 }
      );
    }

    const isTheme = type === "registry:theme";
    if (!hasFiles) {
      // 单文件模式校验
      if (!isTheme) {
        const validation = validateTsx(content);
        if (!validation.valid) {
          return NextResponse.json(
            { error: `Invalid TSX: ${validation.error}` },
            { status: 400 }
          );
        }
      } else if (typeof content !== "string" || content.trim().length === 0) {
        return NextResponse.json(
          { error: "Theme content (CSS) is required" },
          { status: 400 }
        );
      }
    } else {
      // 多文件模式：theme 允许只有 css；component/block 仅做最轻量的入口校验（如存在 index.tsx）
      if (!isTheme) {
        const record = files as Record<string, unknown>;
        const index = record["index.tsx"];
        if (typeof index === "string" && index.trim()) {
          const validation = validateTsx(index);
          if (!validation.valid) {
            return NextResponse.json(
              { error: `Invalid TSX (index.tsx): ${validation.error}` },
              { status: 400 }
            );
          }
        }
      }
    }

    const nameRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    if (!nameRegex.test(name)) {
      return NextResponse.json(
        { error: "Name must be kebab-case (e.g. my-component)" },
        { status: 400 }
      );
    }

    const validTypes = ["registry:block", "registry:component", "registry:theme"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: "Type must be registry:block, registry:component, or registry:theme" },
        { status: 400 }
      );
    }

    const validVisibility = visibility === "private" ? "private" : "public";
    const dependencies = (() => {
      if (isTheme) return [];
      if (hasFiles) {
        const all = new Set<string>();
        for (const src of Object.values(files as Record<string, unknown>)) {
          if (typeof src !== "string") continue;
          for (const dep of extractDependencies(src)) all.add(dep);
        }
        return Array.from(all).sort();
      }
      return extractDependencies(content);
    })();

    const normalizedFiles = hasFiles
      ? (Object.fromEntries(
          Object.entries(files as Record<string, unknown>)
            .filter(([, v]) => typeof v === "string")
            .map(([k, v]) => [k, v as string])
        ) as Record<string, string>)
      : undefined;
    const item = await createRegistryItem({
      name,
      type,
      title,
      description: description || null,
      content: hasFiles ? undefined : content,
      files: normalizedFiles,
      userId,
      visibility: validVisibility,
      dependencies,
    });

    return NextResponse.json({ success: true, item });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create";
    if (message.includes("unique") || message.includes("duplicate")) {
      return NextResponse.json(
        { error: "A component with this name already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
