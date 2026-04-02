function DashboardLoadingCard({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-[28px] border border-zinc-200/80 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.04)] dark:border-zinc-800 dark:bg-zinc-900/70 ${className}`}
    >
      <div className="animate-pulse space-y-4">
        <div className="h-3 w-28 rounded-full bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-8 w-64 max-w-[70%] rounded-full bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-4 w-96 max-w-[82%] rounded-full bg-zinc-100 dark:bg-zinc-800/80" />
        <div className="grid gap-3 pt-3 sm:grid-cols-3">
          <div className="h-24 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80" />
          <div className="h-24 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80" />
          <div className="h-24 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80" />
        </div>
      </div>
    </div>
  );
}

export default function AuthLoading() {
  return (
    <div className="space-y-8">
      <DashboardLoadingCard />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="rounded-2xl border border-zinc-200/80 bg-white/80 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70"
          >
            <div className="animate-pulse space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="h-5 w-32 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                <div className="h-4 w-14 rounded-full bg-zinc-100 dark:bg-zinc-800/80" />
              </div>
              <div className="h-4 w-24 rounded-full bg-zinc-100 dark:bg-zinc-800/80" />
              <div className="grid grid-cols-2 gap-2 pt-2">
                <div className="h-18 rounded-xl bg-zinc-100 dark:bg-zinc-800/80" />
                <div className="h-18 rounded-xl bg-zinc-100 dark:bg-zinc-800/80" />
                <div className="h-18 rounded-xl bg-zinc-100 dark:bg-zinc-800/80" />
                <div className="h-18 rounded-xl bg-zinc-100 dark:bg-zinc-800/80" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
