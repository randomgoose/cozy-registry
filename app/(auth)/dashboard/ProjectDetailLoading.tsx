export function ProjectDetailLoading() {
  return (
    <div className="min-h-[calc(100vh-4.5rem)] animate-pulse">
      <div className="grid min-h-[calc(100vh-4.5rem)] lg:grid-cols-[320px_minmax(0,1fr)]">
        <section className="min-h-0 border-b border-zinc-200/80 lg:border-r lg:border-b-0 dark:border-zinc-800">
          <div className="border-b border-zinc-200/80 px-4 py-3 dark:border-zinc-800">
            <div className="h-3 w-20 rounded-full bg-zinc-200 dark:bg-zinc-800" />
          </div>
          <div className="space-y-1 p-2 lg:h-[calc(100vh-7.5rem)]">
            {Array.from({ length: 9 }).map((_, index) => (
              <div
                key={index}
                className="w-full rounded-lg px-3 py-2.5"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 size-8 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
                  <div className="min-w-0 flex-1">
                    <div className="h-4 w-28 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                    <div className="mt-2 h-3 w-20 rounded-full bg-zinc-100 dark:bg-zinc-800/80" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="min-h-0 overflow-hidden">
          <div className="border-b border-zinc-200/80 px-4 py-3 dark:border-zinc-800">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="h-4 w-40 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                <div className="mt-2 h-3 w-48 max-w-full rounded-full bg-zinc-100 dark:bg-zinc-800/80" />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <div className="h-8 w-16 rounded-lg bg-zinc-100 dark:bg-zinc-800/80" />
                <div className="h-8 w-20 rounded-lg bg-zinc-100 dark:bg-zinc-800/80" />
              </div>
            </div>
          </div>

          <div className="border-b border-zinc-200/80 px-4 py-2 dark:border-zinc-800">
            <div className="inline-flex items-center gap-1 rounded-lg bg-zinc-100/80 p-1 dark:bg-zinc-900">
              <div className="h-8 w-18 rounded-md bg-white shadow-sm dark:bg-zinc-800" />
              <div className="h-8 w-14 rounded-md bg-zinc-100 dark:bg-zinc-900" />
            </div>
          </div>

          <div className="h-[calc(100vh-10.5rem)] bg-[linear-gradient(180deg,rgba(244,244,245,0.65),rgba(250,250,250,0.9))] dark:bg-[linear-gradient(180deg,rgba(24,24,27,0.8),rgba(9,9,11,0.95))]">
            <div className="mx-auto flex h-full max-w-5xl items-start justify-center px-6 py-8">
              <div className="w-full max-w-3xl rounded-[28px] border border-zinc-200/80 bg-white/90 p-6 shadow-[0_24px_80px_-40px_rgba(24,24,27,0.45)] dark:border-zinc-800/80 dark:bg-zinc-900/88">
                <div className="flex items-center justify-between gap-4">
                  <div className="h-4 w-32 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                  <div className="h-3 w-20 rounded-full bg-zinc-100 dark:bg-zinc-800/80" />
                </div>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div className="space-y-3">
                    <div className="h-10 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80" />
                    <div className="h-24 rounded-3xl bg-zinc-100 dark:bg-zinc-800/70" />
                    <div className="h-10 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80" />
                  </div>
                  <div className="space-y-3">
                    <div className="h-20 rounded-[24px] bg-zinc-100 dark:bg-zinc-800/70" />
                    <div className="grid grid-cols-2 gap-3">
                      <div className="h-24 rounded-[24px] bg-zinc-100 dark:bg-zinc-800/70" />
                      <div className="h-24 rounded-[24px] bg-zinc-100 dark:bg-zinc-800/70" />
                    </div>
                  </div>
                </div>
                <div className="mt-6 space-y-3">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-3 rounded-full bg-zinc-100 dark:bg-zinc-800/70"
                      style={{ width: `${78 - (index % 3) * 11}%` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
