"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronDown, Plus } from "lucide-react";
import { toast } from "sonner";
import type { WorkspaceContext } from "@/lib/workspace-context";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

type WorkspaceScopeSwitcherProps = {
  workspace: WorkspaceContext;
  userId: string | null;
};

function slugifyWorkspaceName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** Preserve items / projects / settings (or org hub) when switching scope via URL. */
function inferNavSection(pathname: string): "items" | "projects" | "settings" | "org_hub" {
  if (pathname === "/workspace") return "org_hub";
  if (pathname.includes("/projects")) return "projects";
  if (pathname.includes("/settings")) return "settings";
  return "items";
}

function personalPathForSection(section: ReturnType<typeof inferNavSection>): string {
  switch (section) {
    case "projects":
      return "/me/projects";
    case "settings":
      return "/me/settings";
    case "org_hub":
      return "/me";
    default:
      return "/me";
  }
}

function workspacePathForSlug(orgSlug: string, section: ReturnType<typeof inferNavSection>): string {
  const enc = encodeURIComponent(orgSlug);
  switch (section) {
    case "projects":
      return `/workspace/${enc}/projects`;
    case "settings":
      return `/workspace/${enc}/settings`;
    case "org_hub":
      return `/workspace/${enc}`;
    default:
      return `/workspace/${enc}`;
  }
}

export function WorkspaceScopeSwitcher({
  workspace,
  userId: _userId,
}: WorkspaceScopeSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [orgName, setOrgName] = useState("");

  const activePrimaryLabel = workspace.activeOrganization?.name ?? "Personal";
  const activeSecondaryLabel = workspace.activeOrganization
    ? `@${workspace.activeOrganization.slug}`
    : "Your own registry";

  async function postJson(path: string, body: Record<string, string | null>) {
    const response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const message = await response.text().catch(() => "");
      throw new Error(message || `Request failed (${response.status})`);
    }
  }

  function switchToPersonal() {
    startTransition(async () => {
      try {
        setSwitchError(null);
        await postJson("/api/auth/organization/set-active", {
          organizationId: null,
        });
        router.push(personalPathForSection(inferNavSection(pathname)));
        router.refresh();
      } catch (nextError) {
        const message =
          nextError instanceof Error
            ? nextError.message
            : "Failed to switch workspace";
        setSwitchError(message);
        toast.error(message);
      }
    });
  }

  function switchToOrganization(organizationId: string) {
    const org = workspace.organizations.find((o) => o.id === organizationId);
    const slug = org?.slug;
    startTransition(async () => {
      try {
        setSwitchError(null);
        await postJson("/api/auth/organization/set-active", {
          organizationId,
        });
        if (slug) {
          router.push(workspacePathForSlug(slug, inferNavSection(pathname)));
        }
        router.refresh();
      } catch (nextError) {
        const message =
          nextError instanceof Error
            ? nextError.message
            : "Failed to switch workspace";
        setSwitchError(message);
        toast.error(message);
      }
    });
  }

  function createOrganization() {
    const nextName = orgName.trim();
    if (!nextName) return;

    startTransition(async () => {
      try {
        setCreateError(null);
        const slug = slugifyWorkspaceName(nextName);
        if (!slug) {
          throw new Error("Please enter a valid workspace name.");
        }

        const response = await fetch("/api/auth/organization/create", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            name: nextName,
            slug,
          }),
        });

        if (!response.ok) {
          const message = await response.text().catch(() => "");
          throw new Error(message || `Request failed (${response.status})`);
        }

        setOrgName("");
        setCreateOpen(false);
        router.push(workspacePathForSlug(slug, inferNavSection(pathname)));
        router.refresh();
      } catch (nextError) {
        const message =
          nextError instanceof Error
            ? nextError.message
            : "Failed to create workspace";
        setCreateError(message);
        toast.error(message);
      }
    });
  }

  return (
    <div className="px-2">
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            setCreateError(null);
          }
        }}
      >
        <DialogContent className="max-w-md rounded-[24px] border border-white/65 bg-white/90 p-5 shadow-[0_24px_48px_rgba(15,23,42,0.14),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/92 dark:shadow-[0_28px_52px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.08)]">
          <DialogHeader>
            <DialogTitle>Create organization</DialogTitle>
            <DialogDescription>
              Create a shared organization workspace. You can add projects and invite members from the
              workspace settings page.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                Organization name
              </label>
              <Input
                value={orgName}
                onChange={(event) => setOrgName(event.target.value)}
                placeholder="Acme Design"
                className="h-9 rounded-xl border-zinc-200 bg-white/90 px-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/70"
                autoFocus
              />
            </div>
            {createError ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
                {createError}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={createOrganization} disabled={!orgName.trim() || pending}>
              Create organization
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              disabled={pending}
              className="inline-flex w-full items-center justify-between rounded-2xl border border-zinc-200/80 bg-zinc-100/88 px-3 py-2.5 text-left shadow-[0_10px_24px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.55)] transition-colors hover:bg-zinc-100 disabled:cursor-wait disabled:opacity-70 dark:border-white/12 dark:bg-white/[0.08] dark:shadow-[0_12px_28px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.08)] dark:hover:bg-white/[0.1]"
            />
          }
        >
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-zinc-950 dark:text-zinc-50">
              {activePrimaryLabel}
            </div>
            <div className="truncate pt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              {activeSecondaryLabel}
            </div>
          </div>
          <ChevronDown className="ml-2 size-4 shrink-0 opacity-70" />
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="start"
          sideOffset={10}
          className="w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/60 bg-white/88 p-2 shadow-[0_20px_40px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/90 dark:shadow-[0_24px_44px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.08)]"
        >
          <div className="px-2 pb-1 pt-0 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
            Current scope
          </div>
          <DropdownMenuItem
            className="rounded-xl px-3 py-2 text-sm text-zinc-700 focus:bg-black/[0.06] focus:text-zinc-950 dark:text-zinc-300 dark:focus:bg-black/30 dark:focus:text-zinc-50"
            onClick={switchToPersonal}
          >
            <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-medium">Personal</div>
                <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  Your own registry assets
                </div>
              </div>
              {!workspace.activeOrganization ? <Check className="size-4 shrink-0" /> : null}
            </div>
          </DropdownMenuItem>

          {workspace.organizations.length > 0 ? (
            <DropdownMenuSeparator className="my-2 bg-zinc-200/80 dark:bg-zinc-800/80" />
          ) : null}

          <div className="max-h-[18rem] overflow-auto">
            {workspace.organizations.map((organization) => (
              <DropdownMenuItem
                key={organization.id}
                className="rounded-xl px-3 py-2 text-sm text-zinc-700 focus:bg-black/[0.06] focus:text-zinc-950 dark:text-zinc-300 dark:focus:bg-black/30 dark:focus:text-zinc-50"
                onClick={() => switchToOrganization(organization.id)}
              >
                <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{organization.name}</div>
                    <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                      @{organization.slug} ·{" "}
                      {organization.role === "owner"
                        ? "Owner"
                        : organization.role === "editor"
                          ? "Editor"
                          : "Viewer"}
                    </div>
                  </div>
                  {organization.isActive ? <Check className="size-4 shrink-0" /> : null}
                </div>
              </DropdownMenuItem>
            ))}
          </div>

          <DropdownMenuSeparator className="my-2 bg-zinc-200/80 dark:bg-zinc-800/80" />
          <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
            Actions
          </div>
          <div className="px-1">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-black/[0.04] hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-black/30 dark:hover:text-zinc-50"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="size-4" />
              Create organization
            </button>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <p
        className={cn(
          "mt-2 text-[11px] text-zinc-500 dark:text-zinc-400",
          switchError ? "text-amber-600 dark:text-amber-400" : "",
        )}
      >
        {switchError ??
          (workspace.activeOrganization
            ? "You are viewing this organization’s registry scope."
            : "You are viewing your personal scope.")}
      </p>
    </div>
  );
}
