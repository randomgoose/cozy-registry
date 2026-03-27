"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Plus } from "lucide-react";
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

export function WorkspaceScopeSwitcher({
  workspace,
  userId,
}: WorkspaceScopeSwitcherProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [teamName, setTeamName] = useState("");

  const targetOrganization = useMemo(
    () => workspace.activeOrganization ?? workspace.organizations[0] ?? null,
    [workspace.activeOrganization, workspace.organizations],
  );

  const activePrimaryLabel = workspace.activeTeam?.name ?? "Personal";
  const activeSecondaryLabel = workspace.activeTeam
    ? workspace.activeOrganization?.name ?? "Team workspace"
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
        setError(null);
        await postJson("/api/auth/organization/set-active-team", {
          teamId: null,
        });
        router.refresh();
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Failed to switch workspace",
        );
      }
    });
  }

  function switchToTeam(organizationId: string, teamId: string) {
    startTransition(async () => {
      try {
        setError(null);
        await postJson("/api/auth/organization/set-active", {
          organizationId,
        });
        await postJson("/api/auth/organization/set-active-team", {
          teamId,
        });
        router.refresh();
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Failed to switch workspace",
        );
      }
    });
  }

  function createTeam() {
    const nextName = teamName.trim();
    if (!nextName) return;

    startTransition(async () => {
      try {
        setError(null);
        if (!targetOrganization) {
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

          setTeamName("");
          setCreateOpen(false);
          router.refresh();
          return;
        }

        const response = await fetch("/api/auth/organization/create-team", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            name: nextName,
            organizationId: targetOrganization.id,
          }),
        });

        if (!response.ok) {
          const message = await response.text().catch(() => "");
          throw new Error(message || `Request failed (${response.status})`);
        }

        const created = (await response.json()) as { id?: string };
        if (!created?.id) {
          throw new Error("Team created, but no team id was returned.");
        }

        if (userId) {
          await postJson("/api/auth/organization/add-team-member", {
            teamId: created.id,
            userId,
          });
        }

        await postJson("/api/team/ensure-slug", {
          teamId: created.id,
        });

        await postJson("/api/auth/organization/set-active", {
          organizationId: targetOrganization.id,
        });
        await postJson("/api/auth/organization/set-active-team", {
          teamId: created.id,
        });

        setTeamName("");
        setCreateOpen(false);
        router.refresh();
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Failed to create team",
        );
      }
    });
  }

  return (
    <div className="px-2">
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md rounded-[24px] border border-white/65 bg-white/90 p-5 shadow-[0_24px_48px_rgba(15,23,42,0.14),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/92 dark:shadow-[0_28px_52px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.08)]">
          <DialogHeader>
            <DialogTitle>
              {targetOrganization ? "Create team" : "Create workspace"}
            </DialogTitle>
            <DialogDescription>
              {targetOrganization
                ? `Create a new team inside ${targetOrganization.name}.`
                : "Create your first shared workspace. A default team will be created automatically."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                {targetOrganization ? "Team name" : "Workspace name"}
              </label>
              <Input
                value={teamName}
                onChange={(event) => setTeamName(event.target.value)}
                placeholder={targetOrganization ? "Trading" : "Acme Design"}
                className="h-9 rounded-xl border-zinc-200 bg-white/90 px-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/70"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={createTeam}
              disabled={!teamName.trim() || pending}
            >
              {targetOrganization ? "Create team" : "Create workspace"}
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
              {!workspace.activeTeam ? (
                <Check className="size-4 shrink-0" />
              ) : null}
            </div>
          </DropdownMenuItem>

          {workspace.organizations.length > 0 ? (
            <DropdownMenuSeparator className="my-2 bg-zinc-200/80 dark:bg-zinc-800/80" />
          ) : null}

          <div className="max-h-[18rem] overflow-auto">
            {workspace.organizations.map((organization) => (
              <div key={organization.id} className="mb-2 last:mb-0">
                <div className="px-2 pb-1">
                  <div className="truncate text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                    Workspace
                  </div>
                  <div className="truncate pt-1 text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
                    {organization.name}
                  </div>
                  <div className="truncate pt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                    @{organization.slug}
                  </div>
                </div>
                <div className="px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                  Teams
                </div>
                <div className="space-y-1">
                  {organization.teams.map((team) => (
                    <DropdownMenuItem
                      key={team.id}
                      className="rounded-xl px-3 py-2 text-sm text-zinc-700 focus:bg-black/[0.06] focus:text-zinc-950 dark:text-zinc-300 dark:focus:bg-black/30 dark:focus:text-zinc-50"
                      onClick={() => switchToTeam(organization.id, team.id)}
                    >
                      <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-medium">{team.name}</div>
                          <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                            {organization.role === "owner"
                              ? "Owner access"
                              : organization.role === "editor"
                                ? "Editor access"
                                : "Viewer access"}
                          </div>
                        </div>
                        {team.isActive ? (
                          <Check className="size-4 shrink-0" />
                        ) : null}
                      </div>
                    </DropdownMenuItem>
                  ))}
                </div>
              </div>
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
              {targetOrganization ? "Create team" : "Create workspace"}
            </button>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <p
        className={cn(
          "mt-2 text-[11px] text-zinc-500 dark:text-zinc-400",
          error ? "text-amber-600 dark:text-amber-400" : "",
        )}
      >
        {error ??
          (workspace.activeTeam
            ? "You are viewing this team's registry scope."
            : "You are viewing your personal scope.")}
      </p>
    </div>
  );
}
