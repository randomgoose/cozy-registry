function SettingsSummaryCardSkeleton() {
  return (
    <section className="rounded-[28px] border border-zinc-200/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] dark:border-zinc-800 dark:bg-zinc-900/90 dark:shadow-[0_24px_60px_rgba(0,0,0,0.2)]">
      <div className="animate-pulse space-y-4">
        <div className="h-3 w-28 rounded-full bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-8 w-64 max-w-[72%] rounded-full bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-4 w-80 max-w-[84%] rounded-full bg-zinc-100 dark:bg-zinc-800/80" />
        <div className="grid gap-3 pt-3 sm:grid-cols-3">
          <div className="h-24 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80" />
          <div className="h-24 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80" />
          <div className="h-24 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80" />
        </div>
      </div>
    </section>
  );
}

function SettingsSectionSkeleton() {
  return (
    <section className="rounded-[28px] border border-zinc-200/80 bg-white/90 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] dark:border-zinc-800 dark:bg-zinc-900/90 dark:shadow-[0_24px_60px_rgba(0,0,0,0.2)]">
      <div className="animate-pulse space-y-5">
        <div className="space-y-2">
          <div className="h-6 w-40 rounded-full bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-4 w-96 max-w-[78%] rounded-full bg-zinc-100 dark:bg-zinc-800/80" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <div className="h-3 w-24 rounded-full bg-zinc-100 dark:bg-zinc-800/80" />
            <div className="h-11 rounded-xl bg-zinc-100 dark:bg-zinc-800/80" />
          </div>
          <div className="space-y-2">
            <div className="h-3 w-28 rounded-full bg-zinc-100 dark:bg-zinc-800/80" />
            <div className="h-11 rounded-xl bg-zinc-100 dark:bg-zinc-800/80" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <div className="h-3 w-32 rounded-full bg-zinc-100 dark:bg-zinc-800/80" />
            <div className="h-28 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80" />
          </div>
        </div>
        <div className="flex justify-end">
          <div className="h-10 w-28 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
        </div>
      </div>
    </section>
  );
}

export default function PersonalSettingsLoading() {
  return (
    <div className="space-y-6">
      <SettingsSummaryCardSkeleton />
      <SettingsSectionSkeleton />
    </div>
  );
}
