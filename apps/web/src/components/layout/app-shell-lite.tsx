import { Bell, Boxes, BriefcaseBusiness, FolderKanban, Settings } from "lucide-react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useWorkspaceShellRouting } from "../../hooks/use-workspace-shell-routing";
import { CozyLogoIcon } from "../icons";
import { WorkspaceScopeSwitcher } from "../workspace";

type AppShellLiteProps = {
  children: React.ReactNode;
};

type NavItem = {
  label: string;
  to: string;
  end?: boolean;
  icon: typeof Boxes;
};

function navItemActive(pathname: string, to: string, end?: boolean): boolean {
  if (pathname === to) return true;
  if (end) return false;
  return pathname.startsWith(`${to}/`);
}

function sidebarItemClassName(isActive: boolean) {
  return isActive
    ? "flex items-center gap-3 rounded-2xl border border-zinc-200/80 bg-zinc-100/88 px-3 py-2.5 text-[13px] font-semibold text-zinc-950 shadow-[0_10px_24px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.55)] dark:border-white/12 dark:bg-white/[0.08] dark:text-zinc-50 dark:shadow-[0_12px_28px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.08)]"
    : "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[13px] font-semibold text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100";
}

export function AppShellLite({ children }: AppShellLiteProps) {
  const { pathname } = useLocation();
  const { hrefs, parsed } = useWorkspaceShellRouting();

  const navItems: NavItem[] = [
    { label: "Dashboard", to: hrefs.dashboard, end: true, icon: Boxes },
    { label: "Projects", to: hrefs.projects, icon: FolderKanban },
    ...(parsed.mode === "personal"
      ? []
      : [{ label: "Workspace", to: hrefs.workspace, end: true as const, icon: BriefcaseBusiness }]),
    { label: "Settings", to: hrefs.settings, end: true, icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.05),transparent_24%),linear-gradient(180deg,#fffdf9_0%,#ffffff_42%,#fbfbfc_100%)] dark:bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.08),transparent_20%),linear-gradient(180deg,#09090b_0%,#09090b_100%)]">
      <header>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <NavLink
            to="/"
            className="inline-flex items-center text-zinc-950 transition-colors hover:text-zinc-700 dark:text-zinc-50 dark:hover:text-zinc-200"
            aria-label="Cozy Registry"
          >
            <CozyLogoIcon className="size-6" />
          </NavLink>
          <div className="flex items-center gap-3">
            <NavLink
              to={hrefs.notifications}
              className="inline-flex rounded-full border border-zinc-300 bg-white/90 p-2 text-zinc-600 transition hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50"
              aria-label="Open notifications"
            >
              <Bell className="size-4" />
            </NavLink>
            <NavLink
              to={hrefs.dashboard}
              className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/70"
            >
              Workspace
            </NavLink>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start">
          <aside className="lg:sticky lg:top-8">
            <div className="rounded-[28px] border border-zinc-200 bg-white/92 p-3 shadow-[0_18px_38px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.65)] backdrop-blur dark:border-white/10 dark:bg-zinc-950/75 dark:shadow-[0_22px_44px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.06)]">
              <WorkspaceScopeSwitcher placement="sidebar" />

              <div className="my-4 border-t border-zinc-200 dark:border-zinc-800" />

              <nav className="space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = navItemActive(pathname, item.to, item.end);
                  return (
                    <Link
                      key={item.label}
                      to={item.to}
                      aria-current={isActive ? "page" : undefined}
                      className={sidebarItemClassName(isActive)}
                    >
                      <Icon className="size-4 shrink-0" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </aside>

          <div className="min-w-0">{children}</div>
        </div>
      </main>
    </div>
  );
}
