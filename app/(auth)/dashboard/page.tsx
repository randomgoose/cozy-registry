import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getRegistryItemsByUserId } from "@/lib/registry";
import { ComponentCard } from "@/app/components/ComponentCard";
import { getThumbnailFromMeta } from "@/lib/thumbnail";

export const dynamic = "force-dynamic";

function normalizeVisibility(value: string): "public" | "private" {
  return value === "private" ? "private" : "public";
}

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 dark:bg-zinc-950">
        <p className="text-zinc-600 dark:text-zinc-400">
          请先{" "}
          <a href="/sign-in" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            登录
          </a>{" "}
          查看你的组件
        </p>
      </div>
    );
  }

  const items = await getRegistryItemsByUserId(session.user.id);

  return (
    <>
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        我的组件
      </h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        你已发布 {items.length} 个组件
      </p>

      {items.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-zinc-300 py-16 text-center dark:border-zinc-700">
          <p className="text-zinc-500 dark:text-zinc-400">
            还没有发布过组件
          </p>
          <a
            href="/publish"
            className="mt-4 inline-block rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            发布第一个组件
          </a>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div key={item.id} className="relative">
              <ComponentCard
                itemId={item.id}
                owner={item.ownerHandle ?? item.userId ?? "legacy"}
                name={item.name}
                title={item.title}
                description={item.description}
                visibility={normalizeVisibility(item.visibility)}
                thumbnailUrl={getThumbnailFromMeta(item.meta)?.url ?? null}
              />
              <span
                className={`absolute right-3 top-3 rounded-full px-2 py-0.5 text-xs font-medium ${
                  item.visibility === "private"
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
                    : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                }`}
              >
                {item.visibility === "private" ? "私有" : "公开"}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
