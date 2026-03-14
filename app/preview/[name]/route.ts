import { NextResponse } from "next/server";
import { getRegistryItemByName, toShadcnRegistryItem } from "@/lib/registry";

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
  _request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const item = await getRegistryItemByName(name);

  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const shadcnItem = toShadcnRegistryItem(item);
  const code = shadcnItem?.files?.[0]?.content ?? "";
  const componentName = COMPONENT_NAME_MAP[name] ?? name.split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("");
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
    const Component = (function() {
      ${transformedCode}
      return ${componentName};
    })();
    const props = ${demoProps};
    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(React.createElement(Component, props));
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
