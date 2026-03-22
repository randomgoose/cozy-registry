"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { authClient } from "@/lib/auth-client";
import { FigmaMakeIcon } from "./icons/FigmaMakeIcon";
import { CursorIcon } from "./icons/CursorIcon";

type ToolKey = "figma" | "cursor";

type ToolDefinition = {
  key: ToolKey;
  title: string;
  description: string;
  actionLabel: string;
  actionHref: string;
  steps: string[];
  note?: string;
  icon?: ReactNode;
};

type ConnectToolsDialogProps = {
  mcpUrl: string;
  isSignedIn: boolean;
};

const TOOLS: ToolDefinition[] = [
  {
    key: "figma",
    title: "Connect Figma Make",
    description:
      "在 Figma Make 里连接 Cozy MCP，直接读取 registry、生成安装计划，并把 block 发布到 registry。",
    actionLabel: "打开 Figma Make",
    actionHref: "https://www.figma.com/make/",
    steps: [
      "将 MCP server URL 设置为下方的 Cozy MCP URL。",
      "认证方式选择 Custom request headers。",
      "添加请求头：Authorization: Bearer <你的 Token>。",
      "在 Cozy Registry 的 /settings 创建 API Token。",
    ],
    note:
      "OAuth 仍在兼容验证中。当前 Figma Make 推荐使用 Bearer token 接入，稳定性更高。",
    icon: <FigmaMakeIcon className="size-4" />,
  },
  {
    key: "cursor",
    title: "Connect Cursor",
    description:
      "把 Cozy Registry 接进 Cursor，让 agent 能读取 bundle、分析项目状态并规划安装与升级。",
    actionLabel: "打开 Cursor",
    actionHref: "https://www.cursor.com/",
    steps: [
      "将 MCP server URL 设置为下方的 Cozy MCP URL。",
      "在请求头中添加 Authorization: Bearer <你的 Token>。",
      "如果需要项目状态或升级规划，优先使用 get_project_registry_status 与 analyze_project_registry。",
    ],
    note: "如果你只想先验证连通性，先调用 initialize 和 tools/list 就够了。",
    icon: <CursorIcon className="size-4" />,
  },
];

function ToolTriggerCard({
  tool,
  onOpen,
}: {
  tool: ToolDefinition;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="rounded-2xl bg-white/70 px-5 py-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:bg-white/85 dark:bg-white/[0.045] dark:hover:bg-white/[0.07]"
    >
      <div className="flex items-center gap-2">
        {tool.icon ? (
          <span className="text-zinc-700 dark:text-zinc-200">{tool.icon}</span>
        ) : null}
        <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {tool.title}
        </h3>
      </div>
      <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        {tool.description}
      </p>
    </button>
  );
}

function buildCursorInstallLink(mcpUrl: string, token: string | null) {
  const config = {
    url: mcpUrl,
    headers: {
      Authorization: `Bearer ${token ?? "<your-token>"}`,
    },
  };

  const encodedConfig = btoa(JSON.stringify(config));
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(
    "cozy-registry",
  )}&config=${encodeURIComponent(encodedConfig)}`;
}

export function ConnectToolsDialog({
  mcpUrl,
  isSignedIn,
}: ConnectToolsDialogProps) {
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<ToolKey>("figma");
  const [copied, setCopied] = useState<"mcp" | "header" | null>(null);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [isGeneratingToken, setIsGeneratingToken] = useState(false);

  const activeTool = useMemo(
    () => TOOLS.find((tool) => tool.key === activeKey) ?? TOOLS[0],
    [activeKey],
  );
  const authHeader = `Authorization: Bearer ${generatedToken ?? "<your-token>"}`;
  const cursorInstallLink = useMemo(
    () => buildCursorInstallLink(mcpUrl, generatedToken),
    [generatedToken, mcpUrl],
  );

  async function handleCopy(value: string, kind: "mcp" | "header") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  }

  async function handleGenerateToken() {
    setIsGeneratingToken(true);
    try {
      const { data, error } = await authClient.apiKey.create({
        name: `${activeTool.title} quick connect`,
      });

      if (error || !data?.key) {
        throw new Error(error?.message ?? "Failed to create token");
      }

      setGeneratedToken(data.key);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create token";
      alert(message);
    } finally {
      setIsGeneratingToken(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="mb-8 grid gap-3 md:grid-cols-2">
        {TOOLS.map((tool) => (
          <ToolTriggerCard
            key={tool.key}
            tool={tool}
            onOpen={() => {
              setActiveKey(tool.key);
              setOpen(true);
            }}
          />
        ))}
      </div>

      <DialogContent
        className="flex max-h-[min(90vh,calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-1.5rem))] max-w-4xl flex-col gap-0 overflow-hidden rounded-3xl p-0 sm:max-w-4xl"
      >
        <div className="grid min-h-0 w-full flex-1 grid-rows-[auto_1fr] md:grid-cols-[220px_minmax(0,1fr)] md:grid-rows-1 md:min-h-[560px]">
          <aside className="shrink-0 overflow-hidden border-b border-zinc-200 bg-zinc-50/80 p-4 md:border-b-0 md:border-r dark:border-zinc-800 dark:bg-zinc-950/80">
            <p className="px-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">
              Connect
            </p>
            <div className="mt-3 space-y-1">
              {TOOLS.map((tool) => {
                const active = tool.key === activeKey;
                return (
                  <button
                    key={tool.key}
                    type="button"
                    onClick={() => setActiveKey(tool.key)}
                    className={`w-full rounded-2xl px-3 py-3 text-left transition ${
                      active
                        ? "bg-white text-zinc-950 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-50 dark:ring-zinc-800"
                        : "text-zinc-600 hover:bg-white/80 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900/80 dark:hover:text-zinc-100"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {tool.icon ? (
                        <span className="text-zinc-700 dark:text-zinc-200">
                          {tool.icon}
                        </span>
                      ) : null}
                      <p className="text-sm font-semibold">{tool.title}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="min-h-0 overflow-y-auto overflow-x-hidden p-6 sm:p-7">
            <DialogHeader className="gap-2">
              <DialogTitle className="text-xl font-semibold">
                {activeTool.title}
              </DialogTitle>
              <DialogDescription className="text-sm leading-6">
                {activeTool.description}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-6 grid gap-4">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  MCP URL
                </p>
                <code className="mt-2 block break-all rounded-xl bg-white px-3 py-3 text-xs text-zinc-700 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-300 dark:ring-zinc-800">
                  {mcpUrl}
                </code>
                <button
                  type="button"
                  onClick={() => handleCopy(mcpUrl, "mcp")}
                  className="mt-3 inline-flex items-center justify-center rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                >
                  {copied === "mcp" ? "已复制 MCP URL" : "复制 MCP URL"}
                </button>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Header template
                </p>
                <code className="mt-2 block break-all rounded-xl bg-white px-3 py-3 text-xs text-zinc-700 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-300 dark:ring-zinc-800">
                  {authHeader}
                </code>
                <button
                  type="button"
                  onClick={() => handleCopy(authHeader, "header")}
                  className="mt-3 inline-flex items-center justify-center rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                >
                  {copied === "header" ? "已复制 Header" : "复制 Header 模板"}
                </button>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Quick token
                </p>
                {isSignedIn ? (
                  <div className="mt-3 space-y-3">
                    <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                      直接为 {activeTool.title} 创建一个可复制的 API token。生成后会立即填入上面的 Header 模板。
                    </p>
                    {generatedToken ? (
                      <code className="block break-all rounded-xl bg-zinc-50 px-3 py-3 text-xs text-zinc-700 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800">
                        {generatedToken}
                      </code>
                    ) : null}
                    <button
                      type="button"
                      onClick={handleGenerateToken}
                      disabled={isGeneratingToken}
                      className="inline-flex items-center justify-center rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                    >
                      {isGeneratingToken ? "生成中..." : generatedToken ? "重新生成 Token" : "立即生成 Token"}
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                      登录后可以直接在这里生成 token，不必跳去设置页。
                    </p>
                    <Link
                      href="/sign-in"
                      className="inline-flex items-center justify-center rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                    >
                      登录后生成
                    </Link>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Connection steps
                </p>
                <ol className="mt-3 space-y-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
                  {activeTool.steps.map((step, index) => (
                    <li key={step} className="flex gap-3">
                      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-[11px] font-medium text-white dark:bg-zinc-100 dark:text-zinc-950">
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {activeTool.note ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                  {activeTool.note}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <a
                  href={activeTool.key === "cursor" ? cursorInstallLink : activeTool.actionHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
                >
                  {activeTool.key === "cursor" ? "Add to Cursor" : activeTool.actionLabel}
                </a>
                <a
                  href="/settings"
                  className="inline-flex items-center justify-center rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                >
                  创建 Token
                </a>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
