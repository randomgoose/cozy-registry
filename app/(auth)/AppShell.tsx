"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { FolderKanban, LayoutGrid, Settings2 } from "lucide-react";
import { CozyLogoIcon } from "@/app/components/icons/CozyLogoIcon";
import { HomeUserMenu } from "@/app/components/HomeUserMenu";
import { NotificationBell } from "@/app/components/NotificationBell";
import { WorkspaceScopeSwitcher } from "@/app/components/WorkspaceScopeSwitcher";
import { ProjectsShellCacheProvider, useProjectsShellCache } from "@/app/(auth)/dashboard/ProjectsShellCache";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import type { ProjectListItem } from "@/lib/project-list";
import type { WorkspaceContext } from "@/lib/workspace-context";
import { cn } from "@/lib/utils";

function shouldShowAppNav(pathname: string, email: string | null) {
  if (!email) return false;
  if (pathname.startsWith("/sign-in")) return false;
  if (pathname.startsWith("/sign-up")) return false;
  if (pathname.startsWith("/onboarding")) return false;
  return (
    pathname.startsWith("/me") ||
    pathname.startsWith("/workspace") ||
    pathname === "/docs" ||
    pathname.startsWith("/docs/")
  );
}

function normalizePath(p: string) {
  if (p.length > 1 && p.endsWith("/")) return p.slice(0, -1);
  return p;
}

function navActive(pathname: string, href: string) {
  const path = normalizePath(pathname);
  const h = normalizePath(href);
  if (h === "/me") return path === "/me";
  // Workspace catalog root: /workspace/{slug} only (not /projects or /settings)
  if (/^\/workspace\/[^/]+$/.test(h)) return path === h;
  return path === h || path.startsWith(`${h}/`);
}

function navIconForHref(href: string) {
  if (href.includes("/projects")) return FolderKanban;
  if (href.includes("/settings")) return Settings2;
  return LayoutGrid;
}

export function AppShell(props: {
  userId: string | null;
  email: string | null;
  fullName: string;
  username: string;
  workspace: WorkspaceContext;
  children: React.ReactNode;
}) {
  return (
    <ProjectsShellCacheProvider>
      <SidebarProvider defaultOpen>
        <AppShellFrame {...props} />
      </SidebarProvider>
    </ProjectsShellCacheProvider>
  );
}

function AppSidebar(props: {
  userId: string | null;
  workspace: WorkspaceContext;
  navItems: readonly { href: string; label: string }[];
  pathname: string;
  selectedProjectId: string | null;
  showSidebarProjects: boolean;
  sidebarProjects: ProjectListItem[];
  isWorkspaceShell: boolean;
  activeWorkspaceSlug?: string;
}) {
  const { open } = useSidebar();

  return (
    <Sidebar className="h-screen shrink-0 bg-white/88 backdrop-blur">
      <SidebarHeader>
        <WorkspaceScopeSwitcher
          className="w-full"
          workspace={props.workspace}
          personalName={props.workspace.user?.name ?? null}
          personalImage={props.workspace.user?.image ?? null}
        />
      </SidebarHeader>

      <SidebarContent>
        <SidebarMenu>
          {props.navItems.map((item) => {
            const isActive = navActive(props.pathname, item.href);
            const Icon = navIconForHref(item.href);
            return (
              <SidebarMenuItem key={item.href}>
                <Link href={item.href} className="block">
                  <SidebarMenuButton
                    isActive={isActive}
                    className={cn(
                      "rounded-md",
                      !open && "justify-center",
                    )}
                  >
                    <Icon className="size-4 shrink-0 text-zinc-500 dark:text-zinc-400" />
                    {open ? (
                      <span className="text-[13px] font-medium tracking-tight">
                        {item.label}
                      </span>
                    ) : null}
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>

        {props.showSidebarProjects ? (
          <div className="min-h-0 flex-1 space-y-2">
            {open ? (
              <div className="px-2 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                All projects
              </div>
            ) : null}
            <SidebarMenu className="max-h-[46vh] overflow-auto pr-1">
              {props.sidebarProjects.length === 0 ? (
                <p className="px-2 py-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {open ? "No projects" : "0"}
                </p>
              ) : (
                props.sidebarProjects.map((project) => {
                  const href = props.isWorkspaceShell && props.activeWorkspaceSlug
                    ? `/workspace/${encodeURIComponent(props.activeWorkspaceSlug)}/projects/${project.id}`
                    : `/me/projects/${project.id}`;
                  const active = props.selectedProjectId === project.id;
                  return (
                    <SidebarMenuItem key={project.id}>
                      <Link href={href} className="block">
                        <SidebarMenuButton
                          isActive={active}
                          className={cn(
                            "rounded-xl px-1.5",
                            !open && "justify-center",
                          )}
                        >
                          {open ? (
                            <div className="min-w-0">
                              <div className="flex items-start gap-2">
                                <FolderKanban className="mt-0.5 size-3.5 shrink-0 text-zinc-500 dark:text-zinc-400" />
                                <div className="min-w-0">
                                  <span className="line-clamp-1 block text-[12.5px] font-medium tracking-tight">
                                    {project.title}
                                  </span>
                                  <span className="line-clamp-1 block text-[11px] text-zinc-500 dark:text-zinc-400">
                                    {project.slug}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <FolderKanban className="size-4 shrink-0 text-zinc-500 dark:text-zinc-400" />
                          )}
                        </SidebarMenuButton>
                      </Link>
                    </SidebarMenuItem>
                  );
                })
              )}
            </SidebarMenu>
          </div>
        ) : null}
      </SidebarContent>
    </Sidebar>
  );
}

function AppShellFrame(props: {
  userId: string | null;
  email: string | null;
  fullName: string;
  username: string;
  workspace: WorkspaceContext;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const show = shouldShowAppNav(pathname, props.email);
  const projectsCache = useProjectsShellCache();

  const workspaceMatch = pathname.match(/^\/workspace\/([^/]+)/);
  const activeWorkspaceSlug = workspaceMatch
    ? decodeURIComponent(workspaceMatch[1])
    : undefined;
  const isWorkspaceShell = !!activeWorkspaceSlug;

  const personalNav = [
    { href: "/me", label: "My items" },
    { href: "/me/projects", label: "Projects" },
    { href: "/me/settings", label: "Settings" },
  ] as const;

  const navItems =
    isWorkspaceShell && activeWorkspaceSlug
      ? ([
        {
          href: `/workspace/${encodeURIComponent(activeWorkspaceSlug)}`,
          label: "Items",
        },
        {
          href: `/workspace/${encodeURIComponent(activeWorkspaceSlug)}/projects`,
          label: "Projects",
        },
        {
          href: `/workspace/${encodeURIComponent(activeWorkspaceSlug)}/settings`,
          label: "Settings",
        },
      ] as const)
      : personalNav;

  const selectedProjectId = useMemo(() => {
    const m = pathname.match(/\/projects\/([^/]+)/);
    return m?.[1] ? decodeURIComponent(m[1]) : null;
  }, [pathname]);
  const showSidebarProjects = Boolean(selectedProjectId) && show;
  const sidebarProjects: ProjectListItem[] = projectsCache?.projects ?? [];

  if (!show) return <>{props.children}</>;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.05),transparent_24%),linear-gradient(180deg,#fffdf9_0%,#ffffff_42%,#fbfbfc_100%)] dark:bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.08),transparent_20%),linear-gradient(180deg,#09090b_0%,#09090b_100%)]">
      <div className="flex min-h-screen w-full">
        <AppSidebar
          userId={props.userId}
          workspace={props.workspace}
          navItems={navItems}
          pathname={pathname}
          selectedProjectId={selectedProjectId}
          showSidebarProjects={showSidebarProjects}
          sidebarProjects={sidebarProjects}
          isWorkspaceShell={isWorkspaceShell}
          activeWorkspaceSlug={activeWorkspaceSlug}
        />

        <SidebarInset className="min-w-0">
          <header className="sticky top-0 z-20 border-b border-zinc-200/70 bg-white/72 backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/72">
            <div className="flex w-full items-center justify-between gap-4 px-4 py-3 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <SidebarTrigger className="rounded-xl border-zinc-200 bg-white/90 dark:border-zinc-800 dark:bg-zinc-900/90" />
                <Link
                  href="/?home=1"
                  className="inline-flex items-center gap-2 text-zinc-950 transition-colors hover:text-zinc-700 dark:text-zinc-50 dark:hover:text-zinc-200"
                  aria-label="Cozy Registry"
                >
                  <CozyLogoIcon className="size-5" />
                  <span className="hidden text-sm font-semibold tracking-tight sm:inline">
                    Cozy Registry
                  </span>
                </Link>
              </div>
              <nav className="flex items-center gap-3">
                <Link
                  href="/docs"
                  className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Docs
                </Link>
                <NotificationBell />
                <HomeUserMenu fullName={props.fullName} username={props.username} />
              </nav>
            </div>
          </header>

          <main className="min-w-0 px-4 py-6 sm:px-6 sm:py-8">
            {props.children}
          </main>
        </SidebarInset>
      </div>
    </div>
  );
}
