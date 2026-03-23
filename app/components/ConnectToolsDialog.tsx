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
  /** OAuth method name in the tool (labels and titles) */
  oauthMethodLabel: string;
  /** How to fill OAuth in that tool (matches the copyable snippet below) */
  oauthConfigSteps: string[];
  oauthSummary: string;
  headersSummary: string;
  note?: string;
  icon?: ReactNode;
};

type OAuthConfig = {
  clientId: string;
  clientSecret: string | null;
  redirectUri: string;
  tokenEndpointAuthMethod: string;
};

type ConnectToolsDialogProps = {
  mcpUrl: string;
  isSignedIn: boolean;
  oauthConfigs: Record<ToolKey, OAuthConfig>;
};

const TOOLS: ToolDefinition[] = [
  {
    key: "figma",
    title: "Connect Figma Make",
    description:
      "Connect Cozy MCP in Figma Make to read the registry, generate install plans, and publish blocks to the registry.",
    actionLabel: "Open Figma Make",
    actionHref: "https://www.figma.com/make/",
    steps: [
      "Set the MCP server URL to the Cozy MCP URL below.",
      "Prefer OAuth and use the client_id / client_secret below.",
      "If Figma still prompts for authorization, fall back to Custom request headers.",
      "For header fallback, use Authorization: Bearer <your-token>.",
    ],
    oauthMethodLabel: "Figma Make OAuth",
    oauthConfigSteps: [
      "In Figma Make, add or edit the MCP connection and set Server URL to the Cozy MCP URL below.",
      "Choose OAuth (or the equivalent under Custom connector).",
      "Paste CLIENT_ID and CLIENT_SECRET from the snippet into the matching fields; REDIRECT_URI is usually Figma’s fixed MCP OAuth callback (match below; if the UI pre-fills it, leave it).",
      "Set TOKEN_ENDPOINT_AUTH_METHOD to client_secret_post as required by the server (below); after authorization, Figma hosts the session.",
    ],
    note:
      "This is still the custom connector phase, so OAuth client settings must be entered manually; after a formal listing, the platform will host this.",
    oauthSummary:
      "Recommended. Figma Make supports full OAuth end-to-end for a more stable session and a path closer to the future official connector.",
    headersSummary:
      "Keep a Bearer token as fallback for quick checks, troubleshooting, or when custom-connector OAuth is temporarily unstable.",
    icon: <FigmaMakeIcon className="size-4" />,
  },
  {
    key: "cursor",
    title: "Connect Cursor",
    description:
      "Wire Cozy Registry into Cursor so agents can read bundles, analyze project state, and plan installs and upgrades.",
    actionLabel: "Open Cursor",
    actionHref: "https://www.cursor.com/",
    steps: [
      "Set the MCP server URL to the Cozy MCP URL below.",
      "Prefer Static OAuth and enter CLIENT_ID / CLIENT_SECRET in auth.",
      "To verify connectivity first, keep the Authorization headers fallback.",
      "After connecting, prefer get_project_registry_status and analyze_project_registry for project analysis.",
    ],
    oauthMethodLabel: "Cursor Static OAuth",
    oauthConfigSteps: [
      "Open Cursor → Preferences → Cursor Settings → Tools & MCP → Add new global MCP server (or edit an existing cozy entry).",
      "Set URL to the Cozy MCP URL below; under Auth / OAuth, choose Static OAuth (or wording like “use client id/secret”).",
      "Fill Cursor’s fields from CLIENT_ID and CLIENT_SECRET in mcpServers.cozy.auth in the JSON below; use scopes mcp:tools (as in the snippet).",
      "If CLIENT_SECRET is unset, the server may use a public client (none); follow your environment variables and TOKEN_ENDPOINT_AUTH_METHOD below.",
    ],
    note:
      "Cursor supports both Static OAuth and manual headers. Prefer Static OAuth for now; headers remain a low-friction fallback.",
    oauthSummary:
      "Recommended. Cursor can connect to Cozy Registry via Static OAuth for production use and tighter permission control later.",
    headersSummary:
      "If you only need to verify connectivity or want to skip OAuth temporarily, keep using Authorization headers directly.",
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

function buildOAuthSnippet(
  tool: ToolKey,
  mcpUrl: string,
  oauth: OAuthConfig,
  revealSecret: boolean,
) {
  const clientSecret = revealSecret
    ? oauth.clientSecret ?? "<not-configured>"
    : "<sign in to reveal>";

  if (tool === "cursor") {
    return JSON.stringify(
      {
        mcpServers: {
          cozy: {
            url: mcpUrl,
            auth: {
              CLIENT_ID: oauth.clientId,
              ...(oauth.tokenEndpointAuthMethod !== "none"
                ? { CLIENT_SECRET: clientSecret }
                : {}),
              scopes: ["mcp:tools"],
            },
          },
        },
      },
      null,
      2,
    );
  }

  return [
    `MCP URL: ${mcpUrl}`,
    `CLIENT_ID: ${oauth.clientId}`,
    `CLIENT_SECRET: ${clientSecret}`,
    `REDIRECT_URI: ${oauth.redirectUri}`,
    `TOKEN_ENDPOINT_AUTH_METHOD: ${oauth.tokenEndpointAuthMethod}`,
    `SCOPES: mcp:tools`,
  ].join("\n");
}

export function ConnectToolsDialog({
  mcpUrl,
  isSignedIn,
  oauthConfigs,
}: ConnectToolsDialogProps) {
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<ToolKey>("figma");
  const [copied, setCopied] = useState<"mcp" | "oauth" | "header" | null>(null);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [isGeneratingToken, setIsGeneratingToken] = useState(false);

  const activeTool = useMemo(
    () => TOOLS.find((tool) => tool.key === activeKey) ?? TOOLS[0],
    [activeKey],
  );
  const activeOAuthConfig = oauthConfigs[activeKey];
  const authHeader = `Authorization: Bearer ${generatedToken ?? "<your-token>"}`;
  const cursorInstallLink = useMemo(
    () => buildCursorInstallLink(mcpUrl, generatedToken),
    [generatedToken, mcpUrl],
  );
  const oauthSnippet = useMemo(
    () =>
      buildOAuthSnippet(
        activeKey,
        mcpUrl,
        activeOAuthConfig,
        isSignedIn && Boolean(activeOAuthConfig.clientSecret),
      ),
    [activeKey, activeOAuthConfig, isSignedIn, mcpUrl],
  );

  async function handleCopy(value: string, kind: "mcp" | "oauth" | "header") {
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
                  {copied === "mcp" ? "Copied MCP URL" : "Copy MCP URL"}
                </button>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      OAuth setup
                    </p>
                    <p className="mt-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      {activeTool.oauthMethodLabel}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                      {activeTool.oauthSummary}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                    OAuth
                  </span>
                </div>
                <ol className="mt-4 space-y-2 border-t border-zinc-200/80 pt-4 text-sm leading-6 text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
                  {activeTool.oauthConfigSteps.map((line, index) => (
                    <li key={`oauth-step-${index}`} className="flex gap-3">
                      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600/15 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200">
                        {index + 1}
                      </span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ol>
                <div className="mt-4 rounded-xl border border-zinc-200/80 bg-white/60 px-3 py-3 text-xs leading-5 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-400">
                  <p className="font-medium text-zinc-700 dark:text-zinc-300">
                    OAuth values matching this page
                  </p>
                  <dl className="mt-2 space-y-1.5">
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                      <dt className="font-mono text-[11px] text-zinc-500 dark:text-zinc-500">
                        REDIRECT_URI
                      </dt>
                      <dd className="min-w-0 flex-1 break-all font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                        {activeOAuthConfig.redirectUri}
                      </dd>
                    </div>
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                      <dt className="font-mono text-[11px] text-zinc-500 dark:text-zinc-500">
                        TOKEN_ENDPOINT_AUTH_METHOD
                      </dt>
                      <dd className="min-w-0 flex-1 font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                        {activeOAuthConfig.tokenEndpointAuthMethod}
                      </dd>
                    </div>
                  </dl>
                </div>
                <p className="mt-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Copyable config
                </p>
                <code className="mt-2 block break-all rounded-xl bg-white px-3 py-3 text-xs text-zinc-700 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-300 dark:ring-zinc-800">
                  {oauthSnippet}
                </code>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => handleCopy(oauthSnippet, "oauth")}
                    className="inline-flex items-center justify-center rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  >
                    {copied === "oauth" ? "Copied OAuth config" : "Copy OAuth config"}
                  </button>
                  {!isSignedIn && activeOAuthConfig.clientSecret ? (
                    <span className="inline-flex items-center rounded-full bg-zinc-100 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                      Sign in to reveal secret
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Headers fallback
                    </p>
                    <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                      {activeTool.headersSummary}
                    </p>
                  </div>
                  <span className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
                    Bearer
                  </span>
                </div>
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
                  {copied === "header" ? "Copied header" : "Copy header template"}
                </button>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Quick token
                </p>
                {isSignedIn ? (
                  <div className="mt-3 space-y-3">
                    <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                      Create a copyable API token for {activeTool.title}. It fills the header template above as soon as it is generated.
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
                      {isGeneratingToken
                        ? "Generating…"
                        : generatedToken
                          ? "Regenerate token"
                          : "Generate token"}
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                      Sign in to generate a token here without opening Settings.
                    </p>
                    <Link
                      href="/sign-in"
                      className="inline-flex items-center justify-center rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                    >
                      Sign in to generate
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
                  {activeTool.key === "cursor" ? "Add to Cursor (Headers)" : activeTool.actionLabel}
                </a>
                <a
                  href="/settings"
                  className="inline-flex items-center justify-center rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                >
                  Create token
                </a>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
