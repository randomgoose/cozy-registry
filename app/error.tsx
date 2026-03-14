"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 dark:bg-zinc-950">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
        出错了
      </h1>
      <p className="mt-2 max-w-md text-center text-zinc-600 dark:text-zinc-400">
        可能是数据库未配置或连接失败。请在 Vercel 环境变量中设置{" "}
        <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-700">
          DATABASE_URL
        </code>
        ，并执行 <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-700">db:push</code> 和{" "}
        <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-700">db:seed</code>。
      </p>
      <div className="mt-6 flex gap-4">
        <button
          onClick={() => reset()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          重试
        </button>
        <Link
          href="/"
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          返回首页
        </Link>
      </div>
    </div>
  );
}
