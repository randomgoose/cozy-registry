import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getRegistryItemByOwnerNameAndVersion,
  toShadcnRegistryItem,
} from "@/lib/registry";
import { getUserIdFromToken } from "@/lib/auth-api";

const COMPONENT_NAME_MAP: Record<string, string> = {
  "hero-section": "HeroSection",
  faq: "FAQ",
  "pricing-card": "PricingCard",
};

const DEMO_PROPS: Record<string, string> = {
  "hero-section": JSON.stringify({
    title: "Welcome to Our Product",
    subtitle: "Build something amazing with our platform",
    ctaText: "Get Started",
    ctaHref: "#",
  }),
  faq: JSON.stringify({
    items: [
      { question: "What is this?", answer: "A component registry for your team." },
      { question: "How do I use it?", answer: "Copy the code and paste into your project." },
    ],
    title: "Frequently Asked Questions",
  }),
  "pricing-card": JSON.stringify({
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
  }),
};

/**
 * 将 TSX 源码转为可在内联 Babel 脚本中运行的代码：移除所有 import/export，
 * 并尽量保留原始组件名（尤其是 export default ContractPositionCard 场景），
 * 同时确保存在名为 componentName 的引用可供外层使用。
 */
function transformCodeForInlineBabel(
  code: string,
  componentName: string,
): string {
  let out = code
    .replace(/^["']use client["'];\s*\n?/i, "")
    .replace(/^["']use server["'];\s*\n?/i, "");

  let defaultId: string | null = null;

  // 1) export default function ContractPositionCard() { ... }
  out = out.replace(
    /export\s+default\s+function\s+([A-Za-z0-9_]+)\s*\(/,
    (_m, name: string) => {
      defaultId = name;
      return `function ${name}(`;
    },
  );

  // 2) export default function () { ... }  —— 匿名默认导出
  out = out.replace(
    /export\s+default\s+function\s*\(/,
    () => {
      defaultId = componentName;
      return `function ${componentName}(`;
    },
  );

  // 3) export default ContractPositionCard;
  out = out.replace(
    /export\s+default\s+([A-Za-z0-9_]+)\s*;/,
    (_m, name: string) => {
      defaultId = name;
      // 去掉这行，稍后用默认标识符生成绑定
      return "";
    },
  );

  // 4) 移除所有 import 语句（从 import 到分号，支持多行）
  out = out.replace(/import\s+[\s\S]*?;\s*\n?/g, "");

  // 5) 移除仅 export 的语句行（export { A }; export type { A };）
  out = out.replace(
    /^\s*export\s+(?:type\s+)?\{[^}]*\}\s*;?\s*\n?/gm,
    "",
  );

  // 6) 去掉剩余的 export / export default 关键字，保留声明
  out = out.replace(/\bexport\s+default\s+/g, "");
  out = out.replace(/\bexport\s+/g, "");

  out = out.trim();

  // 7) 如果有明确的默认导出标识符，且名称与 componentName 不同，
  //    追加一行绑定：const <componentName> = <defaultId>;
  if (defaultId && defaultId !== componentName) {
    out += `\n\nconst ${componentName} = ${defaultId};`;
  }

  return out;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ owner: string; name: string }> }
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
    userId
  );

  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const shadcnItem = toShadcnRegistryItem(item);
  const code = shadcnItem?.files?.[0]?.content ?? "";

  // 优先支持约定导出名 PreviewComponent，方便在 registry 中统一写法；
  // 若不存在，则回退到基于 name 推导的组件名，以兼容旧数据。
  const hasPreviewComponentExport = /export\s+function\s+PreviewComponent\b/.test(
    code
  );

  const componentName = hasPreviewComponentExport
    ? "PreviewComponent"
    : COMPONENT_NAME_MAP[name] ??
      name
        .split("-")
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join("");

  const demoProps = DEMO_PROPS[name] ?? "{}";

  const transformedCode = transformCodeForInlineBabel(code, componentName);

  const html = `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen bg-white">
  <div id="root"></div>
  <script type="text/babel" data-presets="react,typescript">
    (function() {
      const container = document.getElementById('root');
      Object.assign(typeof globalThis !== 'undefined' ? globalThis : window, {
        useState: React.useState,
        useEffect: React.useEffect,
        useRef: React.useRef,
        useMemo: React.useMemo,
        useCallback: React.useCallback,
        useContext: React.useContext,
      });

      try {
        const Component = (function() {
          ${transformedCode}
          return ${componentName};
        })();

        if (!Component) {
          throw new Error('组件未正确导出，请确保使用 export function ${componentName} 或 export function PreviewComponent');
        }

        const props = ${demoProps};
        const root = ReactDOM.createRoot(container);
        root.render(React.createElement(Component, props));
      } catch (error) {
        console.error(error);
        if (container) {
          container.innerHTML = '<div style="padding:16px;font-family:system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:0.5rem;white-space:pre-wrap;"><strong>预览出错：</strong> ' + (error && error.message ? error.message : String(error)) + '</div>';
        }
      }
    })();
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
