import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getRegistryItems } from "@/lib/registry";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { getThumbnailFromMeta } from "@/lib/thumbnail";
import { getWorkspaceContextForSession } from "@/lib/workspace-context";
import { ConnectToolsDialog } from "./components/ConnectToolsDialog";
import { HomeUserMenu } from "./components/HomeUserMenu";
import { RegistryBrowser } from "./components/RegistryBrowser";
import { CozyLogoIcon } from "./components/icons/CozyLogoIcon";

export const dynamic = "force-dynamic";

function normalizeVisibility(value: string): "public" | "private" {
  return value === "private" ? "private" : "public";
}

type HomePageProps = {
  searchParams?: Promise<{ home?: string }> | { home?: string };
};

export default async function Home({ searchParams }: HomePageProps) {
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const forceHomepage = resolvedSearchParams.home === "1";
  let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
  let userHandle: string | null = null;
  try {
    session = await auth.api.getSession({ headers: await headers() });
  } catch (err) {
    console.error("Failed to get session:", err);
  }
  if (session?.user?.id && !forceHomepage) {
    const workspace = await getWorkspaceContextForSession(session);
    const activeWorkspaceSlug = workspace.activeOrganization?.slug ?? null;
    if (activeWorkspaceSlug) {
      redirect(`/workspace/${encodeURIComponent(activeWorkspaceSlug)}`);
    }
    redirect("/me");
  }
  if (session?.user?.id) {
    try {
      const [row] = await db
        .select({ handle: user.handle })
        .from(user)
        .where(eq(user.id, session.user.id))
        .limit(1);
      userHandle = row?.handle ?? null;
    } catch (err) {
      console.error("Failed to load user handle:", err);
    }
  }
  let items: Awaited<ReturnType<typeof getRegistryItems>> = [];
  let dbError = false;
  try {
    items = await getRegistryItems(session?.user?.id ?? null);
  } catch (err) {
    console.error("Failed to load registry:", err);
    dbError = true;
  }

  if (dbError) {
    const hasEnv = !!(process.env.DATABASE_URL || process.env.POSTGRES_URL);
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Cozy Registry
            </h1>
          </div>
        </header>
        <main className="mx-auto max-w-2xl px-6 py-16">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-900/20">
            <h2 className="font-semibold text-amber-800 dark:text-amber-200">
              {hasEnv ? "Database connection failed" : "Database not configured"}
            </h2>
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
              {hasEnv ? (
                <>
                  Environment variables are set, but the connection failed. Open{" "}
                  <a
                    href="/api/health"
                    className="font-medium underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    /api/health
                  </a>{" "}
                  for details, and confirm you have run{" "}
                  <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">
                    pnpm db:push
                  </code>{" "}
                  and{" "}
                  <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">
                    pnpm db:seed
                  </code>
                  .
                </>
              ) : (
                <>
                  Set{" "}
                  <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">
                    DATABASE_URL
                  </code>{" "}
                  in your Vercel project env, redeploy, then run{" "}
                  <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">
                    pnpm db:push
                  </code>{" "}
                  and{" "}
                  <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">
                    pnpm db:seed
                  </code>
                  .
                </>
              )}
            </p>
          </div>
        </main>
      </div>
    );
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  const mcpUrl = appUrl ? `${appUrl}/api/mcp` : "/api/mcp";
  const figmaClientId = process.env.OAUTH_FIGMA_CLIENT_ID ?? "cozy-figma-make";
  const figmaClientSecret = process.env.OAUTH_FIGMA_CLIENT_SECRET || null;
  const cursorClientId = process.env.OAUTH_CURSOR_CLIENT_ID ?? "cozy-cursor";
  const cursorClientSecret = process.env.OAUTH_CURSOR_CLIENT_SECRET || null;
  const cursorRedirectUri =
    process.env.OAUTH_CURSOR_REDIRECT_URIS?.split(",")[0]?.trim() ||
    "cursor://anysphere.cursor-mcp/oauth/callback";
  const cursorTokenEndpointAuthMethod =
    process.env.OAUTH_CURSOR_TOKEN_ENDPOINT_AUTH_METHOD?.trim() ||
    (cursorClientSecret ? "client_secret_post" : "none");
  const userFullName =
    session?.user?.name?.trim() ||
    session?.user?.email?.split("@")[0] ||
    "Dashboard";
  const userName = userHandle || session?.user?.email?.split("@")[0] || userFullName;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.08),transparent_30%),linear-gradient(180deg,#fffdf9_0%,#ffffff_42%,#fbfbfc_100%)] dark:bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.08),transparent_22%),linear-gradient(180deg,#09090b_0%,#09090b_100%)]">
      <header>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link
            href="/"
            className="inline-flex items-center text-zinc-950 transition-colors hover:text-zinc-700 dark:text-zinc-50 dark:hover:text-zinc-200"
            aria-label="Cozy Registry"
          >
            <CozyLogoIcon className="size-6" />
          </Link>
          <nav className="flex items-center gap-4">
            <Link
              href="/docs"
              className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300"
            >
              Docs
            </Link>
            {session ? (
              <HomeUserMenu fullName={userFullName} username={userName} />
            ) : (
              <Link
                href="/sign-in"
                className="rounded-lg bg-zinc-900 px-2.5 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Login
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <section className="pt-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
            Cozy Registry
          </p>
          <h1 className="mx-auto mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 md:text-5xl">
            Source-native blocks, UI, and themes for design-led web teams.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-zinc-600 dark:text-zinc-400 md:text-base">
            A source-native registry that design tools and coding agents can actually use.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={session ? "/me" : "/sign-up"}
              className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              {session ? "View my registry" : "Sign up"}
            </Link>
            <Link
              href="/docs"
              className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/70"
            >
              Read docs
            </Link>
          </div>
        </section>

        <section className="mt-10 rounded-[32px] bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.08),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.78)_0%,rgba(255,255,255,0.42)_100%)] px-6 py-8 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] dark:bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.1),transparent_30%),linear-gradient(180deg,rgba(24,24,27,0.72)_0%,rgba(9,9,11,0.3)_100%)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="mx-auto max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
              Connect from your tools
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 md:text-3xl">
              Use Cozy directly from Figma Make and Cursor.
            </h2>
            <p className="mt-3 text-sm leading-7 text-zinc-600 dark:text-zinc-400 md:text-base">
              Connect the tools your team already uses to browse, publish, and reuse registry assets without leaving the workflow.
            </p>
          </div>
          <div className="mt-8">
            <ConnectToolsDialog
              mcpUrl={mcpUrl}
              isSignedIn={!!session}
              oauthConfigs={{
                figma: {
                  clientId: figmaClientId,
                  clientSecret: figmaClientSecret,
                  redirectUri: "https://www.figma.com/oauth/mcp/callback",
                  tokenEndpointAuthMethod: "client_secret_post",
                },
                cursor: {
                  clientId: cursorClientId,
                  clientSecret: cursorClientSecret,
                  redirectUri: cursorRedirectUri,
                  tokenEndpointAuthMethod: cursorTokenEndpointAuthMethod,
                },
              }}
            />
          </div>
        </section>

        <section className="hidden">
          <RegistryBrowser
            items={items.map((item) => ({
              id: item.id,
              itemId: item.id,
              owner: item.ownerHandle ?? item.userId ?? "legacy",
              name: item.name,
              title: item.title,
              description: item.description,
              type: item.type,
              visibility: normalizeVisibility(item.visibility),
              thumbnailUrl: getThumbnailFromMeta(item.meta)?.url ?? null,
            }))}
            isSignedIn={!!session}
          />
        </section>
      </main>

      <footer className="border-t border-zinc-200/70 bg-white/30 dark:border-zinc-800/80 dark:bg-zinc-950/20">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 text-sm text-zinc-500 dark:text-zinc-400 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <CozyLogoIcon className="size-4" />
            <span>Cozy Registry</span>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Link
              href="/docs"
              className="transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              Docs
            </Link>
            <Link
              href={session ? "/me" : "/sign-up"}
              className="transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              {session ? "Dashboard" : "Sign up"}
            </Link>
            <span className="text-zinc-400 dark:text-zinc-500">
              Source-native registry for AI workflows
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
