function StatCardSkeleton() {
  return <div className="h-24 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80" />;
}

function ItemCardSkeleton() {
  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white/80 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
      <div className="animate-pulse space-y-3">
        <div className="h-40 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80" />
        <div className="flex items-start justify-between gap-3">
          <div className="h-5 w-32 rounded-full bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-4 w-14 rounded-full bg-zinc-100 dark:bg-zinc-800/80" />
        </div>
        <div className="h-4 w-24 rounded-full bg-zinc-100 dark:bg-zinc-800/80" />
      </div>
    </div>
  );
}

export default function WorkspaceItemsLoading() {
  return (
    <div className="space-y-8">
      <section className="rounded-[28px] border border-zinc-200/80 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.04)] dark:border-zinc-800 dark:bg-zinc-900/70">
        <div className="animate-pulse space-y-4">
          <div className="h-3 w-28 rounded-full bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-8 w-72 max-w-[72%] rounded-full bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-4 w-96 max-w-[84%] rounded-full bg-zinc-100 dark:bg-zinc-800/80" />
          <div className="grid gap-3 pt-3 sm:grid-cols-3">
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </div>
          <div className="h-20 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80" />
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <ItemCardSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}
