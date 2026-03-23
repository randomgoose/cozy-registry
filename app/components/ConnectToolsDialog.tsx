"use client";

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import Link from "next/link";
import { motion } from "motion/react";
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

type ToolDefinition =
  | {
      key: "figma";
      title: string;
      description: string;
      steps: string[];
      oauthMethodLabel: string;
      oauthConfigSteps: string[];
      oauthSummary?: string;
      headersMethodLabel: string;
      headersConfigSteps: string[];
      headersSummary: string;
      note?: string;
      icon?: ReactNode;
    }
  | {
      key: "cursor";
      title: string;
      description: string;
      steps: string[];
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
    steps: [
      "Go to Add context → Connectors → Manage → Created by you, then click Create.",
      "Set the MCP server URL field to {{MCP_URL}}.",
      "Choose one of the two authentication methods below (OAuth or Additional headers) and follow that section.",
    ],
    oauthMethodLabel: "Figma Make OAuth",
    oauthConfigSteps: [
      "In the connector editor, open Advanced settings.",
      "Under OAuth credentials, enter Client id and Client secret (copy each value below).",
    ],
    headersMethodLabel: "Additional headers",
    headersConfigSteps: [
      "In the connector, open Additional headers (or Custom request headers, depending on the UI).",
      "Add a row: set Name to Authorization and Value to the Bearer token from the fields below.",
    ],
    headersSummary:
      "Keep a Bearer token as fallback for quick checks, troubleshooting, or when custom-connector OAuth is temporarily unstable.",
    icon: <FigmaMakeIcon className="size-4" />,
  },
  {
    key: "cursor",
    title: "Connect Cursor",
    description:
      "Wire Cozy Registry into Cursor so agents can read bundles, analyze project state, and plan installs and upgrades.",
    steps: [
      "Use Open in Cursor below (or copy the install link). The link prefills Static OAuth (client id and secret) in Cursor—you do not need to type them by hand.",
      "After connecting, prefer get_project_registry_status and analyze_project_registry for project analysis.",
    ],
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
      className="rounded-2xl border border-white/50 bg-white/45 px-5 py-4 text-left shadow-[0_12px_32px_rgba(15,23,42,0.05),inset_0_1px_0_rgba(255,255,255,0.55)] backdrop-blur-xl transition duration-200 hover:-translate-y-0.5 hover:border-white/70 hover:bg-white/60 hover:shadow-[0_18px_40px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.62)] dark:border-white/10 dark:bg-white/[0.045] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] dark:hover:border-white/15 dark:hover:bg-white/[0.07]"
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

const CURSOR_MCP_SERVER_NAME = "cozy-registry";

/**
 * Install link `name` is the MCP server id; `config` must be that server’s entry only (same shape as
 * under `mcpServers.<name>` in mcp.json)—not wrapped again by server name. Docs’ postgres example
 * base64-decodes to `{ "command", "args" }` only, not `{ "postgres": { ... } }`.
 * @see https://cursor.com/docs/context/mcp/install-links
 */
function buildCursorInstallLink(mcpUrl: string, oauth: OAuthConfig) {
  const auth: {
    CLIENT_ID: string;
    CLIENT_SECRET?: string;
    scopes: string[];
  } = {
    CLIENT_ID: oauth.clientId,
    scopes: ["mcp:tools"],
  };
  if (oauth.clientSecret) {
    auth.CLIENT_SECRET = oauth.clientSecret;
  }

  const config = {
    url: mcpUrl,
    auth,
  };
  const encodedConfig = btoa(JSON.stringify(config));
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(
    CURSOR_MCP_SERVER_NAME,
  )}&config=${encodeURIComponent(encodedConfig)}`;
}

type CopyKind =
  | "mcp"
  | "oauthClientId"
  | "oauthClientSecret"
  | "headerName"
  | "headerValue"
  | "cursorInstall";

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
        /** Single line; overflow shows ellipsis. */
        truncate?: boolean;
      }
    | {
        value: string;
        kind: CopyKind;
        copied: CopyKind | null;
        onCopy: (value: string, kind: CopyKind) => void;
        className?: string;
        disabled?: false;
        truncate?: boolean;
      },
) {
  if ("disabled" in props && props.disabled) {
    const { value, className, truncate } = props;
    return (
      <div
        className={cn(
          "min-w-0 rounded-xl bg-zinc-50 px-3 py-3 text-xs text-zinc-400 ring-1 ring-zinc-200 dark:bg-zinc-900/50 dark:text-zinc-500 dark:ring-zinc-800",
          "pointer-events-none select-none",
          className,
        )}
        aria-disabled="true"
        title={truncate ? value : undefined}
      >
        <code
          className={cn(
            "block font-mono",
            truncate
              ? "min-w-0 truncate"
              : "break-all whitespace-pre-wrap",
          )}
        >
          {value}
        </code>
      </div>
    );
  }
  const { value, kind, copied, onCopy, className, truncate } = props;
  const done = copied === kind;
  return (
    <div
      tabIndex={0}
      title={truncate ? value : "Click to copy"}
      aria-label="Copy to clipboard"
      onClick={() => onCopy(value, kind)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onCopy(value, kind);
        }
      }}
      className={cn(
        "group relative min-w-0 cursor-pointer rounded-xl bg-white px-3 py-3 pr-14 text-xs text-zinc-700 ring-1 ring-zinc-200 transition hover:ring-zinc-300 focus-visible:outline focus-visible:ring-2 focus-visible:ring-zinc-400 dark:bg-zinc-950 dark:text-zinc-300 dark:ring-zinc-800 dark:hover:ring-zinc-700 dark:focus-visible:ring-zinc-500",
        className,
      )}
    >
      <code
        className={cn(
          "block",
          truncate ? "min-w-0 truncate" : "break-all whitespace-pre-wrap",
        )}
      >
        {value}
      </code>
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
  const toolButtonRefs = useRef<Partial<Record<ToolKey, HTMLButtonElement | null>>>({});
  const [activeIndicator, setActiveIndicator] = useState<{
    y: number;
    height: number;
  } | null>(null);

  const activeTool = useMemo(
    () => TOOLS.find((tool) => tool.key === activeKey) ?? TOOLS[0],
    [activeKey],
  );
  const activeOAuthConfig = oauthConfigs[activeKey];
  const absoluteMcpUrl = useAbsoluteMcpUrl(mcpUrl);
  const authHeaderName = "Authorization";
  const authHeaderValue = `Bearer ${generatedToken ?? "<your-token>"}`;
  const cursorOAuthConfig = oauthConfigs.cursor;
  const cursorInstallLink = useMemo(
    () => buildCursorInstallLink(absoluteMcpUrl, cursorOAuthConfig),
    [absoluteMcpUrl, cursorOAuthConfig],
  );
  const oauthSecretApplicable =
    activeOAuthConfig.tokenEndpointAuthMethod !== "none";

  useLayoutEffect(() => {
    if (!open) return;
    const activeButton = toolButtonRefs.current[activeKey];
    if (!activeButton) return;
    setActiveIndicator({
      y: activeButton.offsetTop,
      height: activeButton.offsetHeight,
    });
  }, [activeKey, open]);

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
        className="flex h-[min(88vh,720px)] max-h-[min(90vh,calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-1.5rem))] max-w-4xl flex-col gap-0 overflow-hidden rounded-3xl p-0 sm:max-w-4xl"
      >
        <div className="grid min-h-0 h-full w-full flex-1 grid-rows-[auto_1fr] md:grid-cols-[220px_minmax(0,1fr)] md:grid-rows-1">
          <aside className="shrink-0 overflow-hidden border-b border-white/50 bg-white/45 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.05),inset_0_1px_0_rgba(255,255,255,0.45)] backdrop-blur-xl md:border-b-0 md:border-r dark:border-white/10 dark:bg-white/[0.04] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <p className="px-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">
              Connect
            </p>
            <div className="relative mt-3 space-y-1">
              {activeIndicator ? (
                <motion.div
                  aria-hidden="true"
                  className="pointer-events-none absolute left-0 right-0 rounded-2xl border border-zinc-200/80 bg-zinc-100/88 shadow-[0_10px_24px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.55)] backdrop-blur-xl dark:border-white/12 dark:bg-white/[0.08] dark:shadow-[0_12px_28px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.08)]"
                  initial={false}
                  animate={{
                    y: activeIndicator.y,
                    height: activeIndicator.height,
                  }}
                  transition={{
                    type: "tween",
                    duration: 0.22,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                />
              ) : null}
              {TOOLS.map((tool) => {
                const active = tool.key === activeKey;
                return (
                  <motion.button
                    key={tool.key}
                    type="button"
                    ref={(node) => {
                      toolButtonRefs.current[tool.key] = node;
                    }}
                    onClick={() => setActiveKey(tool.key)}
                    whileTap={{ scale: 0.985 }}
                    className={cn(
                      "relative w-full overflow-hidden rounded-2xl px-3 py-3 text-left transition duration-200",
                      active
                        ? "text-zinc-950 dark:text-zinc-50"
                        : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {tool.icon ? (
                        <span className="relative z-10 text-zinc-700 dark:text-zinc-200">
                          {tool.icon}
                        </span>
                      ) : null}
                      <p className="relative z-10 text-sm font-semibold">
                        {tool.title}
                      </p>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </aside>

          <div className="min-h-0 overflow-y-auto overflow-x-hidden bg-zinc-50/50 p-6 sm:p-7 dark:bg-zinc-950/20">
            <DialogHeader className="gap-2">
              <DialogTitle className="text-xl font-semibold">
                {activeTool.title}
              </DialogTitle>
              <DialogDescription className="text-sm leading-6">
                {activeTool.description}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-6 grid gap-4">
              <div className="rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)] ring-1 ring-zinc-200/80 dark:bg-zinc-900 dark:shadow-[0_12px_30px_rgba(0,0,0,0.18)] dark:ring-zinc-800/80">
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

              {activeTool.key === "cursor" ? (
                <div className="rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)] ring-1 ring-zinc-200/80 dark:bg-zinc-900 dark:shadow-[0_12px_30px_rgba(0,0,0,0.18)] dark:ring-zinc-800/80">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Install in Cursor
                      </p>
                      <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                        Cursor still uses Static OAuth (client id
                        {cursorOAuthConfig.clientSecret ? " and secret" : ""}), but this
                        install link embeds them so you do not have to paste values by hand.
                        Complete sign-in in Cursor after opening the link.
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-zinc-300 bg-zinc-50 px-2.5 py-1 text-[11px] font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                      Deeplink
                    </span>
                  </div>
                  <div className="mt-4">
                    <p className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Install link
                    </p>
                    <CopyableSnippet
                      value={cursorInstallLink}
                      kind="cursorInstall"
                      copied={copied}
                      onCopy={handleCopy}
                    />
                  </div>
                  <div className="mt-4">
                    <a
                      href={cursorInstallLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
                    >
                      Open in Cursor
                    </a>
                  </div>
                </div>
              ) : (
                <>
              <div className="rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)] ring-1 ring-zinc-200/80 dark:bg-zinc-900 dark:shadow-[0_12px_30px_rgba(0,0,0,0.18)] dark:ring-zinc-800/80">
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
                <ol className="mt-4 space-y-2 pt-1 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
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
                          truncate
                        />
                      ) : (
                        <CopyableSnippet
                          value={
                            activeOAuthConfig.clientSecret
                              ? "Sign in to reveal"
                              : "Not configured"
                          }
                          disabled
                          truncate
                        />
                      )}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-2xl bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)] ring-1 ring-zinc-200/80 dark:bg-zinc-900 dark:shadow-[0_12px_30px_rgba(0,0,0,0.18)] dark:ring-zinc-800/80">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Headers fallback
                    </p>
                    <p className="mt-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      {activeTool.headersMethodLabel}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                      {activeTool.headersSummary}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                    Bearer
                  </span>
                </div>
                <ol className="mt-4 space-y-2 pt-1 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
                  {activeTool.headersConfigSteps.map((line, index) => (
                    <li key={`headers-step-${index}`} className="flex gap-3">
                      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-600/15 text-[11px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
                        {index + 1}
                      </span>
                      <span className="min-w-0">{line}</span>
                    </li>
                  ))}
                </ol>
                <div className="mt-3 grid grid-cols-1 gap-3 pl-8 sm:grid-cols-2 sm:items-start sm:gap-4">
                  <div className="min-w-0">
                    <p className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Name
                    </p>
                    <CopyableSnippet
                      value={authHeaderName}
                      kind="headerName"
                      copied={copied}
                      onCopy={handleCopy}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Value
                    </p>
                    {generatedToken ? (
                      <CopyableSnippet
                        value={authHeaderValue}
                        kind="headerValue"
                        copied={copied}
                        onCopy={handleCopy}
                        truncate
                      />
                    ) : isSignedIn ? (
                      <button
                        type="button"
                        onClick={handleGenerateToken}
                        disabled={isGeneratingToken}
                        className="inline-flex items-center justify-center rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        {isGeneratingToken ? "Generating…" : "Generate token"}
                      </button>
                    ) : (
                      <Link
                        href="/sign-in"
                        className="inline-flex items-center justify-center rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        Sign in to generate
                      </Link>
                    )}
                  </div>
                </div>
              </div>

              {activeTool.note ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                  {activeTool.note}
                </div>
              ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
