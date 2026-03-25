import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createRegistryItem } from "@/lib/registry";
import {
  validateTsx,
  extractDependencies,
  validateComponentBundle,
} from "@/lib/validate-tsx";
import {
  LEGACY_REGISTRY_COMPONENT_TYPE,
  REGISTRY_BLOCK_TYPE,
  REGISTRY_THEME_TYPE,
  REGISTRY_UI_TYPE,
  normalizeRegistryItemType,
} from "@/lib/registry-types";
import { parseTokensFromJson, tokensToRootCss } from "@/lib/theme-tokens";
import { auth } from "@/lib/auth";
import { getUserIdFromToken } from "@/lib/auth-api";
import { analyzeUploadStyleHints } from "@/lib/upload-style-hints";
import { normalizeRegistryDependenciesInput } from "@/lib/registry-dependency-input";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, type, title, description, content, files, visibility } = body as {
      name?: string;
      type?: string;
      title?: string;
      description?: string | null;
      content?: string | null;
      files?: Record<string, unknown> | null;
      visibility?: string | null;
      registryDependencies?: unknown;
      previewProps?: unknown;
      previewExport?: unknown;
    };

    const hasFiles =
      files &&
      typeof files === "object" &&
      !Array.isArray(files) &&
      Object.keys(files as Record<string, unknown>).length > 0;

    const normalizedType =
      typeof type === "string" ? normalizeRegistryItemType(type) : "";

    if (!name || !normalizedType || !title || (!hasFiles && !content)) {
      return NextResponse.json(
        { error: "Missing required fields: name, type, title, and (files or content)" },
        { status: 400 }
      );
    }
    const normalizedRegistryDeps = normalizeRegistryDependenciesInput(
      (body as { registryDependencies?: unknown }).registryDependencies,
    );
    if (normalizedRegistryDeps.error) {
      return NextResponse.json({ error: normalizedRegistryDeps.error }, { status: 400 });
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

    const isTheme = normalizedType === REGISTRY_THEME_TYPE;
    if (!hasFiles) {
      // 单文件模式校验
      if (!isTheme) {
        const validation = validateTsx(content as string);
        if (!validation.valid) {
          return NextResponse.json(
            { error: `Invalid TSX: ${validation.error}` },
            { status: 400 }
          );
        }
      } else if (typeof content !== "string" || content.trim().length === 0) {
        return NextResponse.json(
          { error: "Theme content is required (either CSS or tokens JSON)" },
          { status: 400 }
        );
      }
    } else {
      // 多文件模式：theme 允许仅包含样式/tokens；component/block 必须保证代码文件可解析且本地 import 完整
      if (!isTheme) {
        const record = Object.fromEntries(
          Object.entries(files as Record<string, unknown>).filter(
            ([, value]) => typeof value === "string",
          ),
        ) as Record<string, string>;
        const validation = validateComponentBundle(record);
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
    }

    const nameRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    if (!nameRegex.test(name)) {
      return NextResponse.json(
        { error: "Name must be kebab-case (e.g. my-component)" },
        { status: 400 }
      );
    }

    const validTypes = [REGISTRY_BLOCK_TYPE, REGISTRY_UI_TYPE, REGISTRY_THEME_TYPE] as const;
    if (!validTypes.includes(normalizedType as (typeof validTypes)[number])) {
      return NextResponse.json(
        {
          error:
            `Type must be ${REGISTRY_BLOCK_TYPE}, ${REGISTRY_UI_TYPE}, or ${REGISTRY_THEME_TYPE}. ` +
            `${LEGACY_REGISTRY_COMPONENT_TYPE} is accepted as a legacy alias.`,
        },
        { status: 400 }
      );
    }

    // 规范化 theme：若 type === registry:theme，优先将 content 或 files 中的 JSON 视为 tokens.json，
    // 并从中派生 theme.css（:root 视图）。
    let normalizedFiles: Record<string, string> | undefined;
    let normalizedContent: string | undefined | null = content ?? undefined;

    if (isTheme) {
      const asRecord =
        files && typeof files === "object" && !Array.isArray(files)
          ? (files as Record<string, unknown>)
          : null;
      let tokensJson = "";

      if (asRecord && typeof asRecord["tokens.json"] === "string") {
        tokensJson = asRecord["tokens.json"] as string;
      } else if (typeof content === "string" && content.trim().startsWith("{")) {
        tokensJson = content;
      }

      if (tokensJson) {
        const tokens = parseTokensFromJson(tokensJson);
        const css = tokensToRootCss(tokens);
        if (!css) {
          return NextResponse.json(
            { error: "Failed to derive CSS from tokens.json (no tokens found)" },
            { status: 400 }
          );
        }
        normalizedFiles = {
          "theme.css": css,
          "tokens.json": tokensJson,
        };
        normalizedContent = undefined;
      }
    }

    const validVisibility = visibility === "private" ? "private" : "public";
    // 仅保留裸模块依赖（npm 包），忽略相对路径 import
    const dependencies = (() => {
      if (isTheme) return [];
      const isBare = (spec: string) =>
        !spec.startsWith("./") && !spec.startsWith("../") && !spec.startsWith("/");
      const all = new Set<string>();

      const addDepsFromSource = (src: string | undefined | null) => {
        if (!src) return;
        for (const dep of extractDependencies(src)) {
          if (isBare(dep)) all.add(dep);
        }
      };

      if (hasFiles && !normalizedFiles) {
        for (const src of Object.values(files as Record<string, unknown>)) {
          if (typeof src !== "string") continue;
          addDepsFromSource(src);
        }
      } else {
        addDepsFromSource(normalizedContent ?? content);
      }

      return Array.from(all).sort();
    })();

    if (!normalizedFiles && hasFiles) {
      normalizedFiles = Object.fromEntries(
        Object.entries(files as Record<string, unknown>)
          .filter(([, v]) => typeof v === "string")
          .map(([k, v]) => [k, v as string])
      ) as Record<string, string>;
    }
    const hints = analyzeUploadStyleHints({
      itemType: normalizedType,
      files: normalizedFiles ?? undefined,
      content: normalizedFiles ? null : normalizedContent,
    });

    const item = await createRegistryItem({
      name,
      type: normalizedType,
      title,
      description: description || null,
      content: normalizedFiles ? undefined : normalizedContent,
      files: normalizedFiles,
      userId,
      visibility: validVisibility,
      dependencies,
      registryDependencies: normalizedRegistryDeps.value,
      previewProps: (body as { previewProps?: unknown }).previewProps,
      previewExport:
        typeof (body as { previewExport?: unknown }).previewExport === "string"
          ? ((body as { previewExport?: unknown }).previewExport as string)
          : undefined,
    });

    return NextResponse.json({ success: true, item, hints });
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
