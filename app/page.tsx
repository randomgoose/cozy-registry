import Link from "next/link";
import { headers } from "next/headers";
import { getRegistryItems } from "@/lib/registry";
import { ComponentCard } from "./components/ComponentCard";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  let items: Awaited<ReturnType<typeof getRegistryItems>> = [];
  let dbError = false;
  try {
    items = await getRegistryItems();
  } catch (err) {
    console.error("Failed to load registry:", err);
    dbError = true;
  }

  if (dbError) {
    const hasEnv =
      !!(process.env.DATABASE_URL || process.env.POSTGRES_URL);
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Vibe Registry
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

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Vibe Registry
          </h1>
          <nav className="flex items-center gap-4">
            <Link
              href="/"
              className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              浏览
            </Link>
            <Link
              href="/publish"
              className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              发布组件
            </Link>
            {session ? (
              <Link
                href="/settings"
                className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                设置
              </Link>
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

      <main className="mx-auto max-w-5xl px-6 py-10">
        <p className="mb-8 text-zinc-600 dark:text-zinc-400">
          团队组件库，支持复制代码到项目中使用。AI 可通过 MCP 发现并引用这些组件。
        </p>

        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 py-16 text-center text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            暂无组件，{" "}
            <Link href="/publish" className="text-blue-600 hover:underline dark:text-blue-400">
              发布第一个
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <ComponentCard
                key={item.id}
                name={item.name}
                title={item.title}
                description={item.description}
                type={item.type}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
