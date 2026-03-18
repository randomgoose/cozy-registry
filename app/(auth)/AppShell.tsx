"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

function shouldShowSidebar(pathname: string, email: string | null) {
  if (!email) return false;
  if (pathname.startsWith("/sign-in")) return false;
  if (pathname.startsWith("/sign-up")) return false;
  if (pathname.startsWith("/onboarding")) return false;
  // Only show on these app pages for now.
  return pathname === "/dashboard" || pathname === "/collections" || pathname === "/settings" || pathname === "/docs";
}

export function AppShell(props: { email: string | null; children: React.ReactNode }) {
  const pathname = usePathname();
  const show = shouldShowSidebar(pathname, props.email);

  if (!show) return <>{props.children}</>;

  return (
    <SidebarProvider defaultOpen>
      <AppShellInner pathname={pathname} email={props.email}>
        {props.children}
      </AppShellInner>
    </SidebarProvider>
  );
}

function AppShellInner(props: { pathname: string; email: string | null; children: React.ReactNode }) {
  const { open } = useSidebar();

  return (
    <div className="flex min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Sidebar>
        <SidebarHeader>
          {open && (
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Cozy Registry
            </div>
          )}
          <SidebarTrigger />
        </SidebarHeader>

          <SidebarContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <Link href="/dashboard" className="block">
                  <SidebarMenuButton isActive={props.pathname === "/dashboard"}>
                    我的组件
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <Link href="/collections" className="block">
                  <SidebarMenuButton isActive={props.pathname === "/collections"}>
                    Collections
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <Link href="/settings" className="block">
                  <SidebarMenuButton isActive={props.pathname === "/settings"}>
                    设置
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <Link href="/docs" className="block">
                  <SidebarMenuButton isActive={props.pathname === "/docs"}>
                    文档
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>
      </Sidebar>

      <SidebarInset>
        <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-6 py-4">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <Link
                href="/"
                className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
              >
                ← 返回
              </Link>
            </div>

            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              {props.email}
            </span>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-6 py-10">{props.children}</main>
      </SidebarInset>
    </div>
  );
}
