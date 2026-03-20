"use client";

import { useState } from "react";
import Link from "next/link";
import { parseTokensFromJson, tokensToRootCss } from "@/lib/theme-tokens";

type PublishRequestBody = {
  name: string;
  type: string;
  title: string;
  description: string | null;
  visibility: "public" | "private";
  content?: string;
  files?: Record<string, string>;
};

const TYPE_LABELS = {
  "registry:block": "Block",
  "registry:component": "Component",
  "registry:theme": "Theme",
} as const;

const CONTENT_TEMPLATES = {
  "registry:block": `"use client";

type HeroSectionProps = {
  title: string;
  description: string;
  ctaLabel?: string;
};

export function HeroSection({
  title,
  description,
  ctaLabel = "Get started",
}: HeroSectionProps) {
  return (
    <section className="rounded-3xl border border-zinc-200 bg-white p-10">
      <p className="text-sm text-zinc-500">Launch faster</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-950">
        {title}
      </h1>
      <p className="mt-4 max-w-xl text-zinc-600">{description}</p>
      <button className="mt-8 rounded-full bg-zinc-950 px-5 py-3 text-white">
        {ctaLabel}
      </button>
    </section>
  );
}
`,
  "registry:component": `type MarketingBadgeProps = {
  label: string;
};

export function MarketingBadge({ label }: MarketingBadgeProps) {
  return (
    <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm text-amber-900">
      {label}
    </span>
  );
}
`,
  "registry:theme": `:root {
  --background: #fffdf8;
  --foreground: #221b16;
  --card: #ffffff;
  --card-foreground: #221b16;
  --primary: #d97706;
  --primary-foreground: #ffffff;
  --muted: #f4ede4;
  --muted-foreground: #6b5b4d;
  --border: #eadfce;
  --radius: 1rem;
}
`,
} as const;

function normalizeName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function PublishPage() {
  const [name, setName] = useState("");
  const [type, setType] = useState("registry:block");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [content, setContent] = useState("");
  const [tokensJson, setTokensJson] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");

  const normalizedName = normalizeName(name);
  const isTheme = type === "registry:theme";
  const hasTokensJson = isTheme && tokensJson.trim().length > 0;
  const contentLabel = isTheme ? "CSS 代码" : "TSX 代码";
  const contentPlaceholder =
    CONTENT_TEMPLATES[type as keyof typeof CONTENT_TEMPLATES];
  const contentLineCount =
    content.trim().length === 0 ? 0 : content.split("\n").length;
  const nameIsValid =
    normalizedName.length > 0 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedName);
  const titleIsValid = title.trim().length >= 3;
  const contentLooksValid = isTheme
    ? hasTokensJson || content.trim().includes(":root") || content.trim().includes("--")
    : content.trim().includes("export");
  const descriptionTooLong = description.length > 180;
  const hasValidThemeSource = isTheme
    ? hasTokensJson || content.trim().length > 0
    : content.trim().length > 0;
  const canSubmit =
    nameIsValid &&
    titleIsValid &&
    !descriptionTooLong &&
    hasValidThemeSource &&
    contentLooksValid &&
    status !== "loading";

  function convertTokensJsonToCss(raw: string): string {
    const tokens = parseTokensFromJson(raw);
    if (tokens.length === 0) {
      throw new Error("Tokens JSON 解析失败，请检查格式是否为合法 JSON");
    }
    const css = tokensToRootCss(tokens);
    if (!css) {
      throw new Error(
        "未能从 JSON 中解析出任何 tokens（既不像 W3C Design Tokens，也不像 Figma Variables 导出）",
      );
    }
    return css;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) {
      setStatus("error");
      setError("请先修正表单中的提示项，再提交。");
      return;
    }

    setStatus("loading");
    setError("");

    try {
      const body: PublishRequestBody = {
        name: normalizedName,
        type,
        title: title.trim(),
        description: description.trim() || null,
        visibility,
      };

      if (type === "registry:theme" && tokensJson.trim()) {
        const css = convertTokensJsonToCss(tokensJson);
        body.files = {
          "theme.css": css,
          "tokens.json": tokensJson,
        };
      } else {
        body.content = content;
      }

      const res = await fetch("/api/registry/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("请先登录");
        }
        throw new Error(data.error || "Failed to publish");
      }

      setStatus("success");
      const ownerId = data?.item?.userId ?? "legacy";
      let owner = ownerId;
      try {
        const me = await fetch("/api/me");
        if (me.ok) {
          const meData = (await me.json()) as {
            user?: { handle?: string | null } | null;
          };
          if (meData.user?.handle) owner = meData.user.handle;
        }
      } catch {
        // ignore
      }
      window.location.href = `/registry/${owner}/${normalizedName}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to publish");
      setStatus("error");
    }
  }

  function applyTemplate() {
    setContent(contentPlaceholder);
    if (!title.trim()) {
      setTitle(
        isTheme
          ? "Sunset Landing Theme"
          : type === "registry:block"
            ? "Hero Section"
            : "Marketing Badge",
      );
    }
    if (!name.trim()) {
      setName(
        isTheme
          ? "sunset-theme"
          : type === "registry:block"
            ? "hero-section"
            : "marketing-badge",
      );
    }
    if (isTheme) {
      setTokensJson("");
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
          >
            ← 返回
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="rounded-[28px] border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-700 dark:text-amber-300">
                Publish to Cozy registry
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                发布一个可被团队和 AI 复用的 {TYPE_LABELS[type as keyof typeof TYPE_LABELS]}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                这一步会把代码和元数据写入 registry。表单会先做基础检查，避免发布后才发现名称、描述或代码格式有问题。
              </p>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <label
                    htmlFor="name"
                    className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                  >
                    名称 (kebab-case) *
                  </label>
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="hero-section"
                    required
                    pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                    className="mt-2 block w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-4 focus:ring-amber-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:ring-amber-500/10"
                  />
                  <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                    将自动规范为小写与连字符。预览 slug：{" "}
                    <span className="font-mono text-zinc-700 dark:text-zinc-200">
                      {normalizedName || "hero-section"}
                    </span>
                  </p>
                  {!nameIsValid && name.trim().length > 0 && (
                    <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                      名称只能包含小写字母、数字和连字符。
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="type"
                    className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                  >
                    类型 *
                  </label>
                  <select
                    id="type"
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="mt-2 block w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-4 focus:ring-amber-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:ring-amber-500/10"
                  >
                    <option value="registry:block">Block (模块)</option>
                    <option value="registry:component">Component (组件)</option>
                    <option value="registry:theme">Theme (主题)</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <label
                    htmlFor="title"
                    className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                  >
                    标题 *
                  </label>
                  <input
                    id="title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Hero Section"
                    required
                    className="mt-2 block w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-4 focus:ring-amber-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:ring-amber-500/10"
                  />
                  {!titleIsValid && title.trim().length > 0 && (
                    <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                      标题至少输入 3 个字符，方便列表和详情页识别。
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="visibility"
                    className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                  >
                    可见性
                  </label>
                  <select
                    id="visibility"
                    value={visibility}
                    onChange={(e) =>
                      setVisibility(e.target.value as "public" | "private")
                    }
                    className="mt-2 block w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-4 focus:ring-amber-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:ring-amber-500/10"
                  >
                    <option value="public">公开 - 所有人可访问</option>
                    <option value="private">私有 - 仅本人（需 Bearer Token）可访问</option>
                  </select>
                  <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                    私有条目更适合草稿或内部组件，MCP/Figma Make 访问时需配置 Bearer Token。
                  </p>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="description"
                    className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                  >
                    描述
                  </label>
                  <span
                    className={`text-xs ${
                      descriptionTooLong
                        ? "text-red-600 dark:text-red-400"
                        : "text-zinc-500 dark:text-zinc-400"
                    }`}
                  >
                    {description.length}/180
                  </span>
                </div>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="说明用途、适用页面和接入时机，例如：适合活动页首屏的大块 hero。"
                  rows={3}
                  className="mt-2 block w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-4 focus:ring-amber-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:ring-amber-500/10"
                />
                {descriptionTooLong && (
                  <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                    描述建议控制在 180 个字符内，方便首页卡片与 AI 检索展示。
                  </p>
                )}
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label
                    htmlFor="content"
                    className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                  >
                    {contentLabel} {hasTokensJson ? "(可选)" : "*"}
                  </label>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {contentLineCount} 行
                    </span>
                    <button
                      type="button"
                      onClick={applyTemplate}
                      className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      插入模板
                    </button>
                  </div>
                </div>
                <textarea
                  id="content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={contentPlaceholder}
                  required={!hasTokensJson}
                  rows={18}
                  className="mt-2 block w-full rounded-2xl border border-zinc-300 bg-zinc-50 px-4 py-3 font-mono text-sm text-zinc-900 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-4 focus:ring-amber-100 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-amber-500/10"
                />
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  {isTheme
                    ? "Theme 建议至少包含 :root 或 CSS variables；或者直接粘贴 Tokens JSON 自动生成。"
                    : "组件或模块建议包含 export，便于 Registry 解析与消费。"}
                </p>
                {!contentLooksValid && content.trim().length > 0 && (
                  <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                    {isTheme
                      ? "当前代码看起来不像可发布的主题样式，建议至少定义 :root 或变量。"
                      : "当前代码缺少 export，发布后可能无法被其他项目正常引用。"}
                  </p>
                )}
              </div>

              {type === "registry:theme" && (
                <div>
                  <label
                    htmlFor="tokens-json"
                    className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                  >
                    可选：从 Tokens JSON 生成（Figma Variables / W3C Design Tokens）
                  </label>
                  <textarea
                    id="tokens-json"
                    value={tokensJson}
                    onChange={(e) => setTokensJson(e.target.value)}
                    placeholder={`{
  "color": {
    "primary": { "value": "#2563eb", "type": "color" }
  }
}
// 或粘贴 Figma Variables 导出的 JSON`}
                    rows={10}
                    className="mt-2 block w-full rounded-2xl border border-zinc-300 bg-zinc-50 px-4 py-3 font-mono text-xs text-zinc-900 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-4 focus:ring-amber-100 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-amber-500/10"
                  />
                  <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                    若填写此项，将自动生成 <code>theme.css</code> 和 <code>tokens.json</code> 一并发布；无需手写 CSS。
                  </p>
                </div>
              )}

              {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300">
                  {error}
                </div>
              )}

              {status === "success" && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-300">
                  发布成功，正在跳转到详情页。你也可以先{" "}
                  <Link href="/" className="font-medium underline">
                    返回列表
                  </Link>
                  。
                </div>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full rounded-2xl bg-amber-500 px-4 py-3.5 font-medium text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-zinc-300 dark:disabled:bg-zinc-700"
              >
                {status === "loading" ? "发布中..." : "发布到 Registry"}
              </button>
            </form>
          </section>

          <aside className="space-y-4">
            <div className="rounded-[28px] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                发布前检查
              </h2>
              <ul className="mt-4 space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
                <li>名称使用 kebab-case，便于 URL 和安装命令复用。</li>
                <li>标题和描述尽量写场景语义，方便 AI 搜索和团队浏览。</li>
                <li>Block 适合整段页面模块，Component 适合基础 UI，Theme 适合一组样式变量。</li>
              </ul>
            </div>

            <div className="rounded-[28px] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                当前状态
              </h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-zinc-500 dark:text-zinc-400">类型</dt>
                  <dd className="font-medium text-zinc-900 dark:text-zinc-100">
                    {TYPE_LABELS[type as keyof typeof TYPE_LABELS]}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-zinc-500 dark:text-zinc-400">可见性</dt>
                  <dd className="font-medium text-zinc-900 dark:text-zinc-100">
                    {visibility}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-zinc-500 dark:text-zinc-400">slug</dt>
                  <dd className="font-mono text-xs text-zinc-900 dark:text-zinc-100">
                    {normalizedName || "未填写"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-zinc-500 dark:text-zinc-400">代码检查</dt>
                  <dd
                    className={`font-medium ${
                      !hasValidThemeSource
                        ? "text-zinc-500 dark:text-zinc-400"
                        : contentLooksValid
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {!hasValidThemeSource
                      ? "待输入"
                      : hasTokensJson
                        ? "将由 Tokens JSON 生成"
                        : contentLooksValid
                          ? "通过基础检查"
                          : "需要修正"}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-[28px] border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                还没登录？
              </h2>
              <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                发布时如果返回 401，请先去登录，再回到这里继续提交。
              </p>
              <Link
                href="/sign-in"
                className="mt-4 inline-flex rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                前往登录
              </Link>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
