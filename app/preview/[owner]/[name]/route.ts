import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getRegistryItemByOwnerNameAndVersion,
  toShadcnRegistryItem,
} from "@/lib/registry";
import { getUserIdFromToken } from "@/lib/auth-api";
import { buildPreviewBundle } from "@/lib/preview-build";

const DEMO_PROPS: Record<string, unknown> = {
  "hero-section": {
    title: "Welcome to Our Product",
    subtitle: "Build something amazing with our platform",
    ctaText: "Get Started",
    ctaHref: "#",
  },
  faq: {
    items: [
      {
        question: "What is this?",
        answer: "A component registry for your team.",
      },
      {
        question: "How do I use it?",
        answer: "Copy the code and paste into your project.",
      },
    ],
    title: "Frequently Asked Questions",
  },
  "pricing-card": {
    name: "Pro",
    price: "$29",
    period: "/month",
    description: "For growing teams",
    features: [
      { text: "Unlimited projects", included: true },
      { text: "Priority support", included: true },
      { text: "Advanced analytics", included: false },
    ],
    ctaText: "Get Started",
    highlighted: true,
  },
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ owner: string; name: string }> },
) {
  const { owner, name } = await params;
  const url = new URL(request.url);
  const version = url.searchParams.get("v") ?? null;

  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user?.id ?? (await getUserIdFromToken(request));
  const item = await getRegistryItemByOwnerNameAndVersion(
    owner,
    name,
    version,
    userId,
  );

  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const shadcnItem = toShadcnRegistryItem(item);
  const filesArray = shadcnItem?.files ?? [];

  const files: Record<string, string> = {};
  for (const f of filesArray) {
    files[f.path] = f.content;
  }

  const rawPreviewProps = (item as any)?.meta?.previewProps;
  let previewProps: unknown;
  if (rawPreviewProps === undefined || rawPreviewProps === null) {
    previewProps = DEMO_PROPS[name] ?? {};
  } else if (typeof rawPreviewProps === "string") {
    try {
      previewProps = JSON.parse(rawPreviewProps);
    } catch {
      previewProps = DEMO_PROPS[name] ?? {};
    }
  } else {
    previewProps = rawPreviewProps;
  }

  const dependencies = (item.dependencies ?? []) as string[];

  const buildResult = await buildPreviewBundle(
    {
      name: item.name,
      version: version ?? item.currentVersion ?? "0.1.0",
      files,
      // 传给 esbuild，用于 external 出所有运行时依赖
      dependencies,
    },
    previewProps,
  );

  if (!buildResult.ok) {
    const err = buildResult.error;
    const details =
      err.file && err.line != null
        ? `${err.file}:${err.line}:${err.column ?? 0}`
        : "";
    const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Preview build error</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body style="margin:0;padding:24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,sans-serif;background:#fef2f2;color:#b91c1c;">
    <h1 style="font-size:16px;margin:0 0 8px;">Preview build failed</h1>
    <pre style="white-space:pre-wrap;font-size:13px;background:#fff;border-radius:8px;border:1px solid #fecaca;padding:12px;color:#991b1b;">${err.message}${details ? "\\n" + details : ""
      }</pre>
  </body>
</html>`;

    return new NextResponse(html, {
      status: 500,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  }

  // 根据环境切换 React dev / prod 版本
  const isDev = process.env.NODE_ENV !== "production";

  const reactBase = "https://esm.sh/react@19";
  const reactDomBase = "https://esm.sh/react-dom@19";
  const reactDomClientBase = "https://esm.sh/react-dom@19/client";
  const reactJsxRuntimeBase = "https://esm.sh/react@19/jsx-runtime";
  const devSuffix = isDev ? "?dev" : "";

  // 基本 import map：始终提供 React 运行时（与项目 React 版本保持一致）
  const importMap: Record<string, string> = {
    react: `${reactBase}${devSuffix}`,
    "react-dom": `${reactDomBase}${devSuffix}`,
    "react-dom/client": `${reactDomClientBase}${devSuffix}`,
    "react/jsx-runtime": `${reactJsxRuntimeBase}${devSuffix}`,
  };

  // 告诉 CDN 依赖不要内联自己的 React，而是从 import map 取
  const reactExternalQuery = "?external=react,react-dom,react-dom/client";

  // 根据组件声明的 dependencies 动态扩展 import map。
  // 策略：所有 bare import <pkg> → https://esm.sh/<pkg>?external=react,react-dom,react-dom/client
  for (const dep of dependencies) {
    if (!dep) continue;
    if (dep in importMap) continue;
    importMap[dep] = `https://esm.sh/${dep}${reactExternalQuery}`;
  }

  const importMapJson = JSON.stringify({ imports: importMap }, null, 2);

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Component Preview</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script src="https://cdn.tailwindcss.com"></script>
    <script type="importmap">
${importMapJson}
    </script>
  </head>
  <body class="min-h-screen bg-white">
    <div id="root"></div>
    <script type="module">
${buildResult.code}
    </script>
  </body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
