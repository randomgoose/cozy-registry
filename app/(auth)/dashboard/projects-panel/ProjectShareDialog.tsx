"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { MemberRow } from "./types";

export function ProjectShareDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inviteInput: string;
  onInviteInputChange: (value: string) => void;
  inviteRole: "viewer" | "editor" | "admin";
  onInviteRoleChange: (role: "viewer" | "editor" | "admin") => void;
  inviteError: string | null;
  inviting: boolean;
  onSubmitInvite: (e: React.FormEvent) => void;
  membersLoading: boolean;
  members: MemberRow[];
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-md gap-5 px-5 pt-5 pb-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite to project</DialogTitle>
          <DialogDescription>
            Invite organization members by email or @handle. They must already belong to this
            organization.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={props.onSubmitInvite} className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
            Invite member
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
            <Input
              value={props.inviteInput}
              onChange={(e) => props.onInviteInputChange(e.target.value)}
              placeholder="email@company.com or @handle"
              className="h-10 min-w-0 flex-1 rounded-xl text-sm md:text-sm"
            />
            <div className="flex shrink-0 gap-2">
              <select
                value={props.inviteRole}
                onChange={(e) =>
                  props.onInviteRoleChange(e.target.value as "viewer" | "editor" | "admin")
                }
                className="rounded-xl border border-zinc-300 bg-white px-2 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                aria-label="Member role"
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
                <option value="admin">Admin</option>
              </select>
              <button
                type="submit"
                disabled={props.inviting || !props.inviteInput.trim()}
                className="rounded-xl bg-zinc-900 px-3 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {props.inviting ? "…" : "Invite"}
              </button>
            </div>
          </div>
          {props.inviteError ? (
            <p className="text-xs text-red-600 dark:text-red-400">{props.inviteError}</p>
          ) : null}
        </form>
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
            Members
          </div>
          {props.membersLoading ? (
            <p className="mt-2 text-sm text-zinc-500">Loading…</p>
          ) : props.members.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">No members yet besides you.</p>
          ) : (
            <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-sm">
              {props.members.map((m) => (
                <li
                  key={m.userId}
                  className="flex justify-between gap-2 rounded-lg border border-zinc-200 px-2 py-1.5 dark:border-zinc-800"
                >
                  <span className="truncate text-zinc-800 dark:text-zinc-200">
                    {m.name || m.email}
                  </span>
                  <span className="shrink-0 text-xs text-zinc-500">{m.role}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
