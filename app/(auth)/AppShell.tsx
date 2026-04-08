"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { FolderKanban, LayoutGrid, Settings2 } from "lucide-react";
import { HomeUserMenu } from "@/app/components/HomeUserMenu";
import { NotificationBell } from "@/app/components/NotificationBell";
import { ProjectSwitcher } from "@/app/components/ProjectSwitcher";
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
  useSidebar,
} from "@/components/ui/sidebar";
import type { ProjectListItem } from "@/lib/project-list";
import type { WorkspaceContext } from "@/lib/workspace-context";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { SearchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

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
  fullName: string;
  username: string;
  workspace: WorkspaceContext;
  navItems: readonly { href: string; label: string }[];
  pathname: string;
  selectedProjectId: string | null;
  showSidebarProjects: boolean;
  sidebarProjects: ProjectListItem[];
  isWorkspaceShell: boolean;
  activeWorkspaceSlug?: string;
  onNavigateStart: (href: string) => void;
}) {
  const { open } = useSidebar();

  return (
    <Sidebar className="h-screen shrink-0">
      <div className="flex h-full flex-col">
        <SidebarHeader>
          <WorkspaceScopeSwitcher
            className="w-full"
            workspace={props.workspace}
            personalName={props.workspace.user?.name ?? null}
            personalImage={props.workspace.user?.image ?? null}
          />
        </SidebarHeader>

        <SidebarContent className="min-h-0 flex-1">
          <Input className="mb-1.5" size={"lg"} leftIcon={<HugeiconsIcon icon={SearchIcon} />} variant={"default"} placeholder="Search" />
          <SidebarMenu>
            {props.navItems.map((item) => {
              const isActive = navActive(props.pathname, item.href);
              const Icon = navIconForHref(item.href);
              return (
                <SidebarMenuItem key={item.href}>
                  <Link
                    href={item.href}
                    className="block"
                    onClick={() => props.onNavigateStart(item.href)}
                  >
                    <SidebarMenuButton
                      isActive={isActive}
                      className={cn(
                        "rounded-md", !open && "justify-center",
                      )}
                    >
                      <Icon className="size-4.5 shrink-0" />
                      {open ? (
                        <span className="font-medium">
                          {item.label}
                        </span>
                      ) : null}
                    </SidebarMenuButton>
                  </Link>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarContent>

        <div className="mt-3 border-t pt-3 dark:border-zinc-800">
          <div className={cn("flex items-center gap-2", !open && "justify-center")}>
            <NotificationBell />
            <HomeUserMenu fullName={props.fullName} username={props.username} />
          </div>
        </div>
      </div>
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
  const [optimisticPathname, setOptimisticPathname] = useState<string | null>(null);
  const show = shouldShowAppNav(pathname, props.email);
  const projectsCache = useProjectsShellCache();
  const effectivePathname =
    optimisticPathname && optimisticPathname !== pathname ? optimisticPathname : pathname;

  const workspaceMatch = effectivePathname.match(/^\/workspace\/([^/]+)/);
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
    const m = effectivePathname.match(/\/projects\/([^/]+)/);
    return m?.[1] ? decodeURIComponent(m[1]) : null;
  }, [effectivePathname]);
  const isProjectDetailRoute = Boolean(selectedProjectId);
  const showSidebarProjects = Boolean(selectedProjectId) && show;
  const sidebarProjects = useMemo<ProjectListItem[]>(
    () => projectsCache?.projects ?? [],
    [projectsCache?.projects],
  );
  const shellMainContentClass = isProjectDetailRoute
    ? "h-full w-full"
    : "mx-auto w-full max-w-[1440px] px-4 py-4 sm:px-6 lg:px-8";
  if (!show) return <>{props.children}</>;

  return (
    <div className="bg-background h-screen overflow-hidden">
      <div className="flex h-full w-full overflow-hidden">
        <AppSidebar
          fullName={props.fullName}
          username={props.username}
          workspace={props.workspace}
          navItems={navItems}
          pathname={effectivePathname}
          selectedProjectId={selectedProjectId}
          showSidebarProjects={showSidebarProjects}
          sidebarProjects={sidebarProjects}
          isWorkspaceShell={isWorkspaceShell}
          activeWorkspaceSlug={activeWorkspaceSlug}
          onNavigateStart={(href) => setOptimisticPathname(href)}
        />

        <SidebarInset className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <header className="sticky top-0 z-20 shrink-0">
            <div className="flex w-full items-center justify-between gap-4 px-3 py-2">
              <div className="flex min-w-0 items-center gap-3">
                <ProjectSwitcher
                  pathname={effectivePathname}
                  projects={sidebarProjects}
                  selectedProjectId={selectedProjectId}
                  isWorkspaceShell={isWorkspaceShell}
                  activeWorkspaceSlug={activeWorkspaceSlug}
                  onNavigateStart={(href) => setOptimisticPathname(href)}
                />
              </div>
              <nav className="flex items-center gap-3">
                {isProjectDetailRoute && isWorkspaceShell ? (
                  <button
                    type="button"
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent("project-share-intent"));
                    }}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-[13px] font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Share
                  </button>
                ) : (
                  <Link
                    href="/docs"
                    className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300"
                  >
                    Docs
                  </Link>
                )}
              </nav>
            </div>
          </header>

          <main
            className={cn(
              "min-w-0 flex-1 bg-white rounded-xl mb-3 mr-3",
              isProjectDetailRoute ? "min-h-0 overflow-hidden" : "overflow-auto",
            )}
          >
            <div className={shellMainContentClass}>{props.children}</div>
          </main>
        </SidebarInset>
      </div>
    </div>
  );
}
