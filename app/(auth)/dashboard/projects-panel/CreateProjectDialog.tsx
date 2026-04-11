"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Plus } from "@hugeicons/core-free-icons";

import {
  CreateProjectDetailsForm,
  type CreateProjectDetailsValues,
} from "@/app/(auth)/dashboard/CreateProjectDetailsForm";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { CreatedProject, MemberRow } from "./types";

export function CreateProjectDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creating: boolean;
  createStep: 1 | 2;
  createdProject: CreatedProject | null;
  isOrgScope?: boolean;
  inviteInput: string;
  onInviteInputChange: (value: string) => void;
  inviteRole: "viewer" | "editor" | "admin";
  onInviteRoleChange: (role: "viewer" | "editor" | "admin") => void;
  inviteError: string | null;
  inviting: boolean;
  membersLoading: boolean;
  members: MemberRow[];
  onSubmitStep1: (values: CreateProjectDetailsValues) => Promise<void>;
  onSubmitInvite: (e: React.FormEvent) => Promise<void>;
  onCancel: () => void;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogTrigger render={<Button />}>
        <HugeiconsIcon icon={Plus} />
        Create project
      </DialogTrigger>
      <DialogContent className="max-w-md gap-5 px-5 pt-5 pb-5">
        <DialogHeader>
          <DialogTitle>Create project</DialogTitle>
        </DialogHeader>

        {props.createStep === 1 ? (
          <CreateProjectDetailsForm
            creating={props.creating}
            onSubmit={props.onSubmitStep1}
            onCancel={props.onCancel}
          />
        ) : props.createdProject ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm dark:border-zinc-800 dark:bg-zinc-950/50">
              <div className="font-medium text-zinc-900 dark:text-zinc-100">
                {props.createdProject.title}
              </div>
              <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Slug{" "}
                <code className="rounded bg-zinc-200/80 px-1 dark:bg-zinc-800">
                  {props.createdProject.slug}
                </code>{" "}
                · used in URLs and MCP scopes
              </div>
            </div>

            {props.isOrgScope ? (
              <>
                <form onSubmit={props.onSubmitInvite} className="space-y-2">
                  <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
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
                          props.onInviteRoleChange(
                            e.target.value as "viewer" | "editor" | "admin",
                          )
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
                  <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Members
                  </div>
                  {props.membersLoading ? (
                    <p className="mt-2 text-sm text-zinc-500">Loading…</p>
                  ) : props.members.length === 0 ? (
                    <p className="mt-2 text-sm text-zinc-500">No members yet.</p>
                  ) : (
                    <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-sm">
                      {props.members.map((member) => (
                        <li
                          key={member.userId}
                          className="flex justify-between gap-2 rounded-lg border border-zinc-200 px-2 py-1.5 dark:border-zinc-800"
                        >
                          <span className="truncate text-zinc-800 dark:text-zinc-200">
                            {member.name || member.email}
                          </span>
                          <span className="shrink-0 text-xs text-zinc-500">{member.role}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            ) : null}

            <DialogFooter className="pt-2">
              <button
                type="button"
                onClick={props.onCancel}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Done
              </button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
