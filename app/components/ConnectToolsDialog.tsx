"use client";

import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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
  /** Shown under OAuth method label; omit for tools that keep OAuth steps only. */
  oauthSummary?: string;
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
      "Go to Add context → Connectors → Manage → Created by you, then click Create.",
      "Set the MCP server URL field to {{MCP_URL}}.",
      "Prefer OAuth and use the client_id / client_secret below.",
      "If Figma still prompts for authorization, fall back to Custom request headers.",
      "For header fallback, use Authorization: Bearer <your-token>.",
    ],
    oauthMethodLabel: "Figma Make OAuth",
    oauthConfigSteps: [
      "In the connector editor, open Advanced settings.",
      "Under OAuth credentials, enter Client id and Client secret (copy each value below).",
    ],
    note:
      "This is still the custom connector phase, so OAuth client settings must be entered manually; after a formal listing, the platform will host this.",
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
      "Set the MCP server URL field to {{MCP_URL}}.",
      "Prefer Static OAuth and enter CLIENT_ID / CLIENT_SECRET in auth.",
      "To verify connectivity first, keep the Authorization headers fallback.",
      "After connecting, prefer get_project_registry_status and analyze_project_registry for project analysis.",
    ],
    oauthMethodLabel: "Cursor Static OAuth",
    oauthConfigSteps: [
      "Open Cursor → Preferences → Cursor Settings → Tools & MCP → Add new global MCP server (or edit an existing cozy entry).",
      "Set URL to {{MCP_URL}}; under Auth / OAuth, choose Static OAuth (or wording like “use client id/secret”).",
      "Paste Client id and Client secret from below into Cursor’s OAuth / auth fields; add scopes mcp:tools if the UI asks.",
      "If CLIENT_SECRET is unset, the server may use a public client (none); follow your environment variables.",
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

type CopyKind =
  | "mcp"
  | "oauthClientId"
  | "oauthClientSecret"
  | "header"
  | "token";

function useAbsoluteMcpUrl(mcpUrl: string): string {
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => null,
  );
  return useMemo(() => {
    const trimmed = mcpUrl.trim();
    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }
    const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    if (origin) {
      return `${origin}${path}`;
    }
    return mcpUrl;
  }, [mcpUrl, origin]);
}

/** Renders `{{MCP_URL}}` as a clickable full URL that copies on click. */
function StepInlineMcpUrl({
  text,
  mcpUrl,
  onCopyMcpUrl,
}: {
  text: string;
  mcpUrl: string;
  onCopyMcpUrl: () => void;
}) {
  const segments = text.split("{{MCP_URL}}");
  if (segments.length === 1) {
    return <span>{text}</span>;
  }
  return (
    <>
      {segments.map((segment, i) => (
        <span key={i}>
          {segment}
          {i < segments.length - 1 ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onCopyMcpUrl();
              }}
              className={cn(
                "inline max-w-full break-all rounded px-1 py-px text-left align-baseline font-mono text-[12px] leading-tight [overflow-wrap:anywhere]",
                "border border-zinc-200/90 bg-zinc-100/95 text-zinc-800 shadow-[0_1px_0_0_rgba(15,23,42,0.06)]",
                "transition-[transform,box-shadow,background-color] duration-100 ease-out",
                "cursor-pointer hover:bg-zinc-200/90 hover:text-zinc-900",
                "active:translate-y-px active:shadow-none active:bg-zinc-200/95 dark:active:bg-zinc-700/90",
                "focus-visible:outline focus-visible:ring-2 focus-visible:ring-zinc-400/80 focus-visible:ring-offset-1 dark:border-zinc-600 dark:bg-zinc-800/90 dark:text-zinc-200 dark:shadow-[0_1px_0_0_rgba(0,0,0,0.2)] dark:hover:bg-zinc-700/90 dark:hover:text-zinc-50 dark:focus-visible:ring-zinc-500",
              )}
              title="Click to copy"
            >
              {mcpUrl}
            </button>
          ) : null}
        </span>
      ))}
    </>
  );
}

function CopyableSnippet(
  props:
    | {
        value: string;
        disabled: true;
        className?: string;
      }
    | {
        value: string;
        kind: CopyKind;
        copied: CopyKind | null;
        onCopy: (value: string, kind: CopyKind) => void;
        className?: string;
        disabled?: false;
      },
) {
  if ("disabled" in props && props.disabled) {
    const { value, className } = props;
    return (
      <div
        className={cn(
          "rounded-xl bg-zinc-50 px-3 py-3 text-xs text-zinc-400 ring-1 ring-zinc-200 dark:bg-zinc-900/50 dark:text-zinc-500 dark:ring-zinc-800",
          "pointer-events-none select-none",
          className,
        )}
        aria-disabled="true"
      >
        <code className="block break-all whitespace-pre-wrap font-mono">
          {value}
        </code>
      </div>
    );
  }
  const { value, kind, copied, onCopy, className } = props;
  const done = copied === kind;
  return (
    <div
      tabIndex={0}
      title="Click to copy"
      aria-label="Copy to clipboard"
      onClick={() => onCopy(value, kind)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onCopy(value, kind);
        }
      }}
      className={cn(
        "group relative cursor-pointer rounded-xl bg-white px-3 py-3 pr-14 text-xs text-zinc-700 ring-1 ring-zinc-200 transition hover:ring-zinc-300 focus-visible:outline focus-visible:ring-2 focus-visible:ring-zinc-400 dark:bg-zinc-950 dark:text-zinc-300 dark:ring-zinc-800 dark:hover:ring-zinc-700 dark:focus-visible:ring-zinc-500",
        className,
      )}
    >
      <code className="block break-all whitespace-pre-wrap">{value}</code>
      <button
        type="button"
        className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white/95 px-2 py-1 text-[11px] font-medium text-zinc-600 opacity-0 transition-opacity hover:bg-zinc-50 group-hover:opacity-100 group-focus-within:opacity-100 dark:border-zinc-700 dark:bg-zinc-950/95 dark:text-zinc-400 dark:hover:bg-zinc-900"
        onClick={(e) => {
          e.stopPropagation();
          onCopy(value, kind);
        }}
        aria-label={done ? "Copied" : "Copy"}
      >
        {done ? (
          <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <Copy className="size-3.5" />
        )}
        <span>{done ? "Copied" : "Copy"}</span>
      </button>
    </div>
  );
}

export function ConnectToolsDialog({
  mcpUrl,
  isSignedIn,
  oauthConfigs,
}: ConnectToolsDialogProps) {
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<ToolKey>("figma");
  const [copied, setCopied] = useState<CopyKind | null>(null);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [isGeneratingToken, setIsGeneratingToken] = useState(false);

  const activeTool = useMemo(
    () => TOOLS.find((tool) => tool.key === activeKey) ?? TOOLS[0],
    [activeKey],
  );
  const activeOAuthConfig = oauthConfigs[activeKey];
  const absoluteMcpUrl = useAbsoluteMcpUrl(mcpUrl);
  const authHeader = `Authorization: Bearer ${generatedToken ?? "<your-token>"}`;
  const cursorInstallLink = useMemo(
    () => buildCursorInstallLink(absoluteMcpUrl, generatedToken),
    [generatedToken, absoluteMcpUrl],
  );
  const oauthSecretApplicable =
    activeOAuthConfig.tokenEndpointAuthMethod !== "none";

  async function handleCopy(value: string, kind: CopyKind) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      toast.success("Copied to clipboard");
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
      toast.error("Failed to copy");
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
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Connection steps
                </p>
                <ol className="mt-3 space-y-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
                  {activeTool.steps.map((step, index) => (
                    <li key={`step-${index}`} className="flex gap-3">
                      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-[11px] font-medium text-white dark:bg-zinc-100 dark:text-zinc-950">
                        {index + 1}
                      </span>
                      <span className="min-w-0">
                        <StepInlineMcpUrl
                          text={step}
                          mcpUrl={absoluteMcpUrl}
                          onCopyMcpUrl={() => void handleCopy(absoluteMcpUrl, "mcp")}
                        />
                      </span>
                    </li>
                  ))}
                </ol>
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
                    {activeTool.oauthSummary ? (
                      <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                        {activeTool.oauthSummary}
                      </p>
                    ) : null}
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
                      <span className="min-w-0">
                        <StepInlineMcpUrl
                          text={line}
                          mcpUrl={absoluteMcpUrl}
                          onCopyMcpUrl={() => void handleCopy(absoluteMcpUrl, "mcp")}
                        />
                      </span>
                    </li>
                  ))}
                </ol>
                {activeKey !== "figma" ? (
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
                ) : null}
                <div className="mt-3 grid grid-cols-1 gap-3 pl-8 sm:grid-cols-2 sm:items-start sm:gap-4">
                  <div className="min-w-0">
                    <p className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Client id
                    </p>
                    <CopyableSnippet
                      value={activeOAuthConfig.clientId}
                      kind="oauthClientId"
                      copied={copied}
                      onCopy={handleCopy}
                    />
                  </div>
                  {oauthSecretApplicable ? (
                    <div className="min-w-0">
                      <p className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Client secret
                      </p>
                      {isSignedIn ? (
                        <CopyableSnippet
                          value={
                            activeOAuthConfig.clientSecret ?? "<not-configured>"
                          }
                          kind="oauthClientSecret"
                          copied={copied}
                          onCopy={handleCopy}
                        />
                      ) : (
                        <CopyableSnippet
                          value={
                            activeOAuthConfig.clientSecret
                              ? "Sign in to reveal"
                              : "Not configured"
                          }
                          disabled
                        />
                      )}
                    </div>
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
                <p className="mt-4 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Header template
                </p>
                <CopyableSnippet
                  className="mt-2"
                  value={authHeader}
                  kind="header"
                  copied={copied}
                  onCopy={handleCopy}
                />
                <div className="mt-4 border-t border-zinc-200/80 pt-4 dark:border-zinc-800">
                  <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Generate token
                  </p>
                  {isSignedIn ? (
                    <div className="mt-3 space-y-3">
                      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                        Create a token for {activeTool.title} — the header template above updates as soon as it is generated.
                      </p>
                      {generatedToken ? (
                        <CopyableSnippet
                          className="bg-white/80 ring-zinc-200 dark:bg-zinc-950/80 dark:ring-zinc-800"
                          value={generatedToken}
                          kind="token"
                          copied={copied}
                          onCopy={handleCopy}
                        />
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
                        Sign in to create a token here without opening Settings.
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
