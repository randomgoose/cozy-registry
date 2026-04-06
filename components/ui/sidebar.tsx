"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

type SidebarContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null)

function useSidebar() {
  const ctx = React.useContext(SidebarContext)
  if (!ctx) throw new Error("useSidebar must be used within SidebarProvider")
  return ctx
}

function SidebarProvider({
  defaultOpen = true,
  children,
}: {
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(defaultOpen)
  const value = React.useMemo(
    () => ({ open, setOpen, toggle: () => setOpen((v) => !v) }),
    [open],
  )
  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
}

function SidebarTrigger({ className }: { className?: string }) {
  const { toggle } = useSidebar()
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={cn("shrink-0", className)}
      onClick={toggle}
      aria-label="Toggle sidebar"
    >
      <span className="sr-only">Toggle sidebar</span>
      <div className="grid gap-1">
        <span className="block h-0.5 w-4 bg-current" />
        <span className="block h-0.5 w-4 bg-current" />
        <span className="block h-0.5 w-4 bg-current" />
      </div>
    </Button>
  )
}

function Sidebar({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  const { open } = useSidebar()
  return (
    <aside
      data-state={open ? "open" : "closed"}
      className={cn(
        "transition-[width] duration-200",
        // Keep a clickable rail in collapsed state so it can always be reopened
        open ? "w-64" : "w-16",
        className,
      )}
    >
      <div className={cn("h-full overflow-hidden", open ? "px-3 py-3" : "px-2 py-3")}>
        {children}
      </div>
    </aside>
  )
}

function SidebarInset({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("min-w-0 flex-1", className)}>
      {children}
    </div>
  )
}

function SidebarHeader({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  const { open } = useSidebar()
  return (
    <div
      className={cn(
        "mb-1 flex items-center",
        open ? "justify-between" : "justify-center",
        className,
      )}
    >
      {children}
    </div>
  )
}

function SidebarContent({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return <div className={cn("space-y-1", className)}>{children}</div>
}

function SidebarMenu({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return <div className={cn("space-y-1", className)}>{children}</div>
}

function SidebarMenuItem({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return <div className={cn(className)}>{children}</div>
}

function SidebarMenuButton({
  className,
  isActive,
  children,
}: {
  className?: string
  isActive?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "rounded-md text-sm",
        isActive
          ? "bg-sidebar text-sidebar-primary-foreground hover:bg-sidebar"
          : "text-sidebar-foreground",
        className,
      )}
    >
      <div className="flex items-center gap-2 px-2 py-2">{children}</div>
    </div>
  )
}

export {
  SidebarProvider,
  SidebarTrigger,
  Sidebar,
  SidebarInset,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
}

