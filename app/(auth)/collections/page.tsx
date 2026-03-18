import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getRegistryItemsByUserId } from "@/lib/registry";
import { CollectionsPanel } from "../dashboard/CollectionsPanel";

export const dynamic = "force-dynamic";

export default async function CollectionsPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 dark:bg-zinc-950">
        <p className="text-zinc-600 dark:text-zinc-400">
          请先{" "}
          <a href="/sign-in" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            登录
          </a>{" "}
          管理你的 Collections
        </p>
      </div>
    );
  }

  const items = await getRegistryItemsByUserId(session.user.id);

  return (
    <>
      <CollectionsPanel
        items={items.map((i) => ({
          id: i.id,
          name: i.name,
          title: i.title,
          type: i.type,
        }))}
      />
    </>
  );
}

