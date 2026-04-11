"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Building2,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  KeyRound,
  LayoutGrid,
  Palette,
  Settings2,
  ShieldAlert,
  SlidersHorizontal,
  Trash,
  Users,
} from "lucide-react";
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
  if (h === "/me/activities") return path === h;
  if (/^\/workspace\/[^/]+\/activities$/.test(h)) return path === h;
  if (/^\/me\/projects\/[^/]+\/activities$/.test(h)) return path === h;
  if (/^\/workspace\/[^/]+\/projects\/[^/]+\/activities$/.test(h)) return path === h;
  if (h === "/me") return path === "/me";
  // Workspace catalog root: /workspace/{slug} only (not /projects or /settings)
  if (/^\/workspace\/[^/]+$/.test(h)) return path === h;
  // Project overview should only match the exact project route, not project settings.
  if (/^\/me\/projects\/[^/]+$/.test(h) || /^\/workspace\/[^/]+\/projects\/[^/]+$/.test(h)) {
    return path === h;
  }
  // Projects index should not stay active inside project-scoped settings.
  if (h === "/me/projects" || /^\/workspace\/[^/]+\/projects$/.test(h)) {
    if (/\/projects\/[^/]+\/settings$/.test(path)) return false;
    return path === h || /^\/(?:me|workspace\/[^/]+)\/projects\/[^/]+$/.test(path);
  }
  return path === h || path.startsWith(`${h}/`);
}

function projectScopedHref(params: {
  projectId: string;
  isWorkspaceShell: boolean;
  activeWorkspaceSlug?: string;
  section?: "detail" | "settings";
}) {
  const suffix = params.section === "settings" ? "/settings" : "";
  if (params.isWorkspaceShell && params.activeWorkspaceSlug) {
    return `/workspace/${encodeURIComponent(params.activeWorkspaceSlug)}/projects/${params.projectId}${suffix}`;
  }
  return `/me/projects/${params.projectId}${suffix}`;
}

type SidebarSecondaryItem = {
  key: string;
  href: string;
  label: string;
  icon: LucideIcon;
};

type SidebarNavItem = {
  key: string;
  href: string;
  label: string;
  icon: LucideIcon;
  children?: SidebarSecondaryItem[];
};

type SidebarContext = {
  isWorkspaceShell: boolean;
  activeWorkspaceSlug?: string;
  selectedProjectId: string | null;
  overviewHref: string;
  settingsHref: string;
};

function activitiesHref(context: SidebarContext): string {
  if (context.selectedProjectId != null) {
    const base = projectScopedHref({
      projectId: context.selectedProjectId,
      isWorkspaceShell: context.isWorkspaceShell,
      activeWorkspaceSlug: context.activeWorkspaceSlug,
    });
    return `${base}/activities`;
  }
  if (context.isWorkspaceShell && context.activeWorkspaceSlug) {
    return `/workspace/${encodeURIComponent(context.activeWorkspaceSlug)}/activities`;
  }
  return "/me/activities";
}

function trashHref(context: SidebarContext): string {
  if (context.isWorkspaceShell && context.activeWorkspaceSlug) {
    return `/workspace/${encodeURIComponent(context.activeWorkspaceSlug)}/trash`;
  }
  return "/me/trash";
}

function buildSettingsChildren(context: SidebarContext): SidebarSecondaryItem[] {
  if (context.selectedProjectId != null) {
    return [
      {
        key: "general",
        href: `${context.settingsHref}/general`,
        label: "Basic settings",
        icon: SlidersHorizontal,
      },
      {
        key: "themes",
        href: `${context.settingsHref}/themes`,
        label: "Theme defaults",
        icon: Palette,
      },
      {
        key: "danger",
        href: `${context.settingsHref}/danger`,
        label: "Danger zone",
        icon: ShieldAlert,
      },
    ];
  }

  if (context.isWorkspaceShell && context.activeWorkspaceSlug) {
    return [
      {
        key: "organization",
        href: `${context.settingsHref}/organization`,
        label: "Basic settings",
        icon: Building2,
      },
      {
        key: "members",
        href: `${context.settingsHref}/members`,
        label: "Team members",
        icon: Users,
      },
      {
        key: "tokens",
        href: `${context.settingsHref}/tokens`,
        label: "API tokens",
        icon: KeyRound,
      },
    ];
  }

  return [
    {
      key: "tokens",
      href: `${context.settingsHref}/tokens`,
      label: "API tokens",
      icon: KeyRound,
    },
  ];
}

function buildSidebarNavItems(context: SidebarContext): readonly SidebarNavItem[] {
  const settingsChildren = buildSettingsChildren(context);
  const activityHref = activitiesHref(context);
  const trashPageHref = trashHref(context);

  if (context.isWorkspaceShell && context.activeWorkspaceSlug) {
    return [
      {
        key: "items",
        href: `/workspace/${encodeURIComponent(context.activeWorkspaceSlug)}`,
        label: "Items",
        icon: LayoutGrid,
      },
      {
        key: "overview",
        href: context.overviewHref,
        label: "Overview",
        icon: FolderKanban,
      },
      {
        key: "activities",
        href: activityHref,
        label: "Activities",
        icon: Activity,
      },
      {
        key: "settings",
        href: context.settingsHref,
        label: "Settings",
        icon: Settings2,
        children: settingsChildren,
      },
      {
        key: "trash",
        href: trashPageHref,
        label: "Trash",
        icon: Trash,
      }
    ] as const;
  }

  return [
    {
      key: "items",
      href: "/me",
      label: "My items",
      icon: LayoutGrid,
    },
    {
      key: "overview",
      href: context.overviewHref,
      label: "Overview",
      icon: FolderKanban,
    },
    {
      key: "activities",
      href: activityHref,
      label: "Activities",
      icon: Activity,
    },
    {
      key: "settings",
      href: context.settingsHref,
      label: "Settings",
      icon: Settings2,
      children: settingsChildren,
    },
    {
      key: "trash",
      href: trashPageHref,
      label: "Trash",
      icon: Trash,
    }
  ] as const;
}

function splitHref(href: string) {
  const [pathWithQuery, hash = ""] = href.split("#");
  const [path, query = ""] = pathWithQuery.split("?");
  const search = new URLSearchParams(query);
  return {
    path: normalizePath(path || "/"),
    section: search.get("section"),
    hash: hash ? `#${hash}` : "",
  };
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
  navItems: readonly SidebarNavItem[];
  pathname: string;
  currentSection: string | null;
  selectedProjectId: string | null;
  showSidebarProjects: boolean;
  sidebarProjects: ProjectListItem[];
  isWorkspaceShell: boolean;
  activeWorkspaceSlug?: string;
}) {
  const { open } = useSidebar();
  const [secondaryOverride, setSecondaryOverride] = useState<{
    mode: "open" | "closed";
    key: string;
    pathname: string;
  } | null>(null);

  const autoSecondaryKey = useMemo(() => {
    return (
      props.navItems.find((item) => {
        if (!item.children?.length) return false;
        return navActive(props.pathname, item.href);
      })?.key ?? null
    );
  }, [props.navItems, props.pathname]);

  const activeSecondaryKey =
    secondaryOverride && secondaryOverride.pathname === props.pathname
      ? secondaryOverride.mode === "closed"
        ? null
        : secondaryOverride.key
      : autoSecondaryKey;
  const activeSecondaryNavItem =
    props.navItems.find((item) => item.key === activeSecondaryKey && item.children?.length) ?? null;
  const activeSecondaryItems = activeSecondaryNavItem?.children ?? [];
  const primaryPaneClass = cn(
    "absolute inset-0 transition-all duration-220 ease-out",
    activeSecondaryNavItem
      ? "-translate-x-4 opacity-0 pointer-events-none"
      : "translate-x-0 opacity-100",
  );
  const secondaryPaneClass = cn(
    "absolute inset-0 transition-all duration-220 ease-out",
    activeSecondaryNavItem
      ? "translate-x-0 opacity-100"
      : "translate-x-4 opacity-0 pointer-events-none",
  );

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

        <SidebarContent className="flex min-h-0 flex-1 flex-col">
          <Input className="mb-1.5" size={"lg"} leftIcon={<HugeiconsIcon icon={SearchIcon} />} variant={"default"} placeholder="Search" />
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <div className={primaryPaneClass} aria-hidden={!!activeSecondaryNavItem}>
              <SidebarMenu>
                {props.navItems.map((item) => {
                  const isActive = navActive(props.pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.key}>
                      {item.children?.length ? (
                        <button
                          type="button"
                          className="block w-full"
                          onClick={() =>
                            setSecondaryOverride({
                              mode: "open",
                              key: item.key,
                              pathname: props.pathname,
                            })
                          }
                        >
                          <SidebarMenuButton
                            isActive={isActive}
                            className={cn(
                              "w-full rounded-md transition-colors",
                              !open && "justify-center",
                            )}
                          >
                            <Icon className="size-4.5 shrink-0" />
                            {open ? (
                              <>
                                <span className="min-w-0 flex-1 truncate font-medium text-left">
                                  {item.label}
                                </span>
                                <ChevronRight className="size-4 shrink-0 text-zinc-400" />
                              </>
                            ) : null}
                          </SidebarMenuButton>
                        </button>
                      ) : (
                        <Link
                          href={item.href}
                          className="block"
                          onClick={() =>
                            setSecondaryOverride({
                              mode: "closed",
                              key: "",
                              pathname: props.pathname,
                            })
                          }
                        >
                          <SidebarMenuButton
                            isActive={isActive}
                            className={cn(
                              "rounded-md transition-colors",
                              !open && "justify-center",
                            )}
                          >
                            <Icon className="size-4.5 shrink-0" />
                            {open ? <span className="font-medium">{item.label}</span> : null}
                          </SidebarMenuButton>
                        </Link>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </div>

            <div className={secondaryPaneClass} aria-hidden={!activeSecondaryNavItem}>
              {activeSecondaryNavItem ? (
                <div className="flex h-full min-h-0 flex-col">
                  <button
                    type="button"
                    onClick={() =>
                      setSecondaryOverride({
                        mode: "closed",
                        key: activeSecondaryNavItem.key,
                        pathname: props.pathname,
                      })
                    }
                    className="mb-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-zinc-100/80 dark:hover:bg-zinc-900"
                    aria-label={`Back to ${activeSecondaryNavItem.label}`}
                  >
                    <ChevronLeft className="size-4 shrink-0 text-zinc-500 dark:text-zinc-400" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {activeSecondaryNavItem.label}
                      </div>
                    </div>
                  </button>

                  <SidebarMenu className="min-h-0 flex-1 overflow-auto">
                    {activeSecondaryItems.map((child) => {
                      const childTarget = splitHref(child.href);
                      const currentPath = normalizePath(props.pathname);
                      const Icon = child.icon;
                      const childActive =
                        currentPath === childTarget.path &&
                        (childTarget.section ? props.currentSection === childTarget.section : true);
                      return (
                        <SidebarMenuItem key={child.href}>
                          <Link
                            href={child.href}
                            className="block"
                          >
                            <SidebarMenuButton
                              isActive={childActive}
                              className={cn(
                                "rounded-md transition-colors",
                                !open && "justify-center",
                              )}
                            >
                              <Icon className="size-4.5 shrink-0" />
                              {open ? (
                                <span className="min-w-0 flex-1 text-left font-medium">
                                  {child.label}
                                </span>
                              ) : null}
                            </SidebarMenuButton>
                          </Link>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </div>
              ) : null}
            </div>
          </div>
        </SidebarContent>

        <div className="mt-3 border-t pt-3 dark:border-zinc-800">
          <div className={cn("flex items-center gap-2", !open && "justify-center")}>
            <NotificationBell />
            <HomeUserMenu fullName={props.fullName} username={props.username} avatarUrl={props.workspace.user?.image ?? ""} />
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
  const searchParams = useSearchParams();
  const show = shouldShowAppNav(pathname, props.email);
  const projectsCache = useProjectsShellCache();
  const effectivePathname = pathname;
  const currentSection = searchParams.get("section");

  const workspaceMatch = effectivePathname.match(/^\/workspace\/([^/]+)/);
  const activeWorkspaceSlug = workspaceMatch
    ? decodeURIComponent(workspaceMatch[1])
    : undefined;
  const isWorkspaceShell = !!activeWorkspaceSlug;
  const selectedProjectId = useMemo(() => {
    const m = effectivePathname.match(/\/projects\/([^/]+)/);
    return m?.[1] ? decodeURIComponent(m[1]) : null;
  }, [effectivePathname]);
  const projectSettingsSectionMatch = effectivePathname.match(
    /\/projects\/[^/]+\/settings\/([^/]+)$/,
  );
  const projectSettingsSection = projectSettingsSectionMatch?.[1]
    ? decodeURIComponent(projectSettingsSectionMatch[1])
    : null;
  const inProjectSettings =
    /\/projects\/[^/]+\/settings$/.test(effectivePathname) ||
    projectSettingsSection != null;
  const overviewHref =
    selectedProjectId != null
      ? projectScopedHref({
        projectId: selectedProjectId,
        isWorkspaceShell,
        activeWorkspaceSlug,
      })
      : isWorkspaceShell && activeWorkspaceSlug
        ? `/workspace/${encodeURIComponent(activeWorkspaceSlug)}/projects`
        : "/me/projects";
  const settingsHref =
    selectedProjectId != null
      ? projectScopedHref({
        projectId: selectedProjectId,
        isWorkspaceShell,
        activeWorkspaceSlug,
        section: "settings",
      })
      : isWorkspaceShell && activeWorkspaceSlug
        ? `/workspace/${encodeURIComponent(activeWorkspaceSlug)}/settings`
        : "/me/settings";
  const navItems = buildSidebarNavItems({
    isWorkspaceShell,
    activeWorkspaceSlug,
    selectedProjectId,
    overviewHref,
    settingsHref,
  });
  const isProjectDetailRoute = Boolean(selectedProjectId);
  const showSidebarProjects = Boolean(selectedProjectId) && show;
  const sidebarProjects = useMemo<ProjectListItem[]>(
    () => projectsCache?.projects ?? [],
    [projectsCache?.projects],
  );
  const shellMainContentClass = isProjectDetailRoute
    ? "h-full w-full"
    : "mx-auto w-full max-w-[1440px] px-4 py-9 sm:px-6 lg:px-8";
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
          currentSection={currentSection}
          selectedProjectId={selectedProjectId}
          showSidebarProjects={showSidebarProjects}
          sidebarProjects={sidebarProjects}
          isWorkspaceShell={isWorkspaceShell}
          activeWorkspaceSlug={activeWorkspaceSlug}
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
                  preserveSection={inProjectSettings ? "settings" : "detail"}
                  preserveSettingsSection={projectSettingsSection}
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
