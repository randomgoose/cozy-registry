import Link from "next/link";
import { headers } from "next/headers";
import { getRegistryItems } from "@/lib/registry";
import { auth } from "@/lib/auth";
import { ConnectToolsDialog } from "./components/ConnectToolsDialog";
import { RegistryBrowser } from "./components/RegistryBrowser";

export const dynamic = "force-dynamic";

function normalizeVisibility(value: string): "public" | "private" {
  return value === "private" ? "private" : "public";
}

export default async function Home() {
  let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
  try {
    session = await auth.api.getSession({ headers: await headers() });
  } catch (err) {
    console.error("Failed to get session:", err);
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
              {hasEnv ? "数据库连接失败" : "数据库未配置"}
            </h2>
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
              {hasEnv ? (
                <>
                  环境变量已设置，但连接失败。请访问{" "}
                  <a
                    href="/api/health"
                    className="font-medium underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    /api/health
                  </a>{" "}
                  查看具体错误，并确认已执行{" "}
                  <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">
                    pnpm db:push
                  </code>{" "}
                  和{" "}
                  <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">
                    pnpm db:seed
                  </code>
                  。
                </>
              ) : (
                <>
                  请在 Vercel 环境变量中设置{" "}
                  <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">
                    DATABASE_URL
                  </code>
                  ，保存后重新部署，并执行{" "}
                  <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">
                    pnpm db:push
                  </code>{" "}
                  和{" "}
                  <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">
                    pnpm db:seed
                  </code>
                  。
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

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.08),transparent_30%),linear-gradient(180deg,#fffdf9_0%,#ffffff_42%,#fbfbfc_100%)] dark:bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.08),transparent_22%),linear-gradient(180deg,#09090b_0%,#09090b_100%)]">
      <header>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Cozy Registry
          </h1>
          <nav className="flex items-center gap-4">
            <Link
              href="/"
              className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              浏览
            </Link>
            <Link
              href="/docs"
              className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              文档
            </Link>
            <Link
              href="/publish"
              className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              发布组件
            </Link>
            {session ? (
              <>
                <Link
                  href="/dashboard"
                  className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  我的组件
                </Link>
                <Link
                  href="/settings"
                  className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  设置
                </Link>
              </>
            ) : (
              <Link
                href="/sign-in"
                className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                登录
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <ConnectToolsDialog mcpUrl={mcpUrl} isSignedIn={!!session} />

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
          }))}
          isSignedIn={!!session}
        />
      </main>
    </div>
  );
}
