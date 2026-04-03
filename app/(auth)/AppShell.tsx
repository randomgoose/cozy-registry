"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { Check, ChevronDown, FolderKanban, LayoutGrid, Settings2 } from "lucide-react";
import { CozyLogoIcon } from "@/app/components/icons/CozyLogoIcon";
import { HomeUserMenu } from "@/app/components/HomeUserMenu";
import { NotificationBell } from "@/app/components/NotificationBell";
import { WorkspaceScopeSwitcher } from "@/app/components/WorkspaceScopeSwitcher";
import { ProjectsShellCacheProvider, useProjectsShellCache } from "@/app/(auth)/dashboard/ProjectsShellCache";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

function projectHrefForId(params: {
  projectId: string;
  isWorkspaceShell: boolean;
  activeWorkspaceSlug?: string;
}) {
  if (params.isWorkspaceShell && params.activeWorkspaceSlug) {
    return `/workspace/${encodeURIComponent(params.activeWorkspaceSlug)}/projects/${params.projectId}`;
  }
  return `/me/projects/${params.projectId}`;
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
    <Sidebar className="h-screen shrink-0 bg-white/88 backdrop-blur">
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
                        <Link
                          href={href}
                          className="block"
                          onClick={() => props.onNavigateStart(href)}
                        >
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

        <div className="mt-3 border-t border-zinc-200/80 pt-3 dark:border-zinc-800">
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
  const selectedProject = useMemo(
    () => sidebarProjects.find((project) => project.id === selectedProjectId) ?? null,
    [selectedProjectId, sidebarProjects],
  );

  if (!show) return <>{props.children}</>;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.05),transparent_24%),linear-gradient(180deg,#fffdf9_0%,#ffffff_42%,#fbfbfc_100%)] dark:bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.08),transparent_20%),linear-gradient(180deg,#09090b_0%,#09090b_100%)]">
      <div className="flex min-h-screen w-full">
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

        <SidebarInset className="min-w-0">
          <header className="sticky top-0 z-20 border-b border-zinc-200/70 bg-white/72 backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/72">
            <div className="flex w-full items-center justify-between gap-4 px-4 py-3 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                {selectedProject ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <button
                          type="button"
                          className="inline-flex min-w-0 items-center gap-3 rounded-xl py-2 text-left transition hover:bg-zinc-100/80 dark:hover:bg-zinc-900"
                        />
                      }
                    >
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                        <FolderKanban className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                          {selectedProject.title}
                        </div>
                      </div>
                      <ChevronDown className="size-4 shrink-0 text-zinc-500 dark:text-zinc-400" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      sideOffset={10}
                      className="w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-white/60 bg-white/90 p-2 shadow-[0_20px_40px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/90 dark:shadow-[0_24px_44px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.08)]"
                    >
                      {sidebarProjects.map((project) => {
                        const href = projectHrefForId({
                          projectId: project.id,
                          isWorkspaceShell,
                          activeWorkspaceSlug,
                        });
                        const active = project.id === selectedProjectId;
                        return (
                          <DropdownMenuItem
                            key={project.id}
                            className="rounded-xl px-3 py-2.5 text-sm text-zinc-700 focus:bg-black/[0.06] focus:text-zinc-950 dark:text-zinc-300 dark:focus:bg-black/30 dark:focus:text-zinc-50"
                            onClick={() => setOptimisticPathname(href)}
                            render={<Link href={href} />}
                          >
                            <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                              <div className="flex min-w-0 items-start gap-3">
                                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                                  <FolderKanban className="size-4" />
                                </div>
                                <div className="min-w-0">
                                  <div className="truncate font-medium">{project.title}</div>
                                  <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                                    {project.slug}
                                  </div>
                                </div>
                              </div>
                              {active ? <Check className="size-4 shrink-0" /> : null}
                            </div>
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
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
                )}
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

          <main className={cn("min-w-0", isProjectDetailRoute ? "px-0 py-0" : "px-4 py-6 sm:px-6 sm:py-8",)}>
            {props.children}
          </main>
        </SidebarInset>
      </div>
    </div>
  );
}
