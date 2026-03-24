"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CozyLogoIcon } from "@/app/components/icons/CozyLogoIcon";
import { HomeUserMenu } from "@/app/components/HomeUserMenu";
import { cn } from "@/lib/utils";

function shouldShowAppNav(pathname: string, email: string | null) {
  if (!email) return false;
  if (pathname.startsWith("/sign-in")) return false;
  if (pathname.startsWith("/sign-up")) return false;
  if (pathname.startsWith("/onboarding")) return false;
  return (
    pathname === "/dashboard" ||
    pathname === "/collections" ||
    pathname === "/settings" ||
    pathname === "/docs"
  );
}

const APP_NAV_ITEMS = [
  { href: "/dashboard", label: "My items" },
  { href: "/collections", label: "Collections" },
  { href: "/settings", label: "Settings" },
  { href: "/docs", label: "Docs" },
];

export function AppShell(props: {
  email: string | null;
  fullName: string;
  username: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const show = shouldShowAppNav(pathname, props.email);

  if (!show) return <>{props.children}</>;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.05),transparent_24%),linear-gradient(180deg,#fffdf9_0%,#ffffff_42%,#fbfbfc_100%)] dark:bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.08),transparent_20%),linear-gradient(180deg,#09090b_0%,#09090b_100%)]">
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
            <HomeUserMenu fullName={props.fullName} username={props.username} />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)] lg:items-start">
          <aside className="lg:sticky lg:top-8">
            <div className="p-1">
              <div className="px-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">
                Workspace
              </div>
              <nav className="mt-3 space-y-1">
                {APP_NAV_ITEMS.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center rounded-2xl px-3 py-2.5 text-[13px] font-semibold transition-colors",
                        isActive
                          ? "border border-zinc-200/80 bg-zinc-100/88 text-zinc-950 shadow-[0_10px_24px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.55)] dark:border-white/12 dark:bg-white/[0.08] dark:text-zinc-50 dark:shadow-[0_12px_28px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.08)]"
                          : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </aside>

          <div className="min-w-0">{props.children}</div>
        </div>
      </main>
    </div>
  );
}
