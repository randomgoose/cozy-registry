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

  const transformedCode = code
    .replace(/^["']use client["'];\s*\n?/i, "")
    .replace(/import\s+React(?:\s*,\s*\{[^}]*\})?\s+from\s+["']react["'];\s*\n?/g, "")
    .replace(new RegExp(`export\\s+function\\s+${componentName}\\b`), `function ${componentName}`)
    .replace(/export\s+(?:interface|type)\s+\w+[^]*?\}\s*;?\s*\n/g, "")
    .trim();

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
