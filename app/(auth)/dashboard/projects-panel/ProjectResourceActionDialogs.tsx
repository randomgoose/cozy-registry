"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Project } from "./types";

export function ProjectResourceActionDialogs(props: {
  selectedItemTitle: string | null;
  moveOpen: boolean;
  onMoveOpenChange: (open: boolean) => void;
  removeOpen: boolean;
  onRemoveOpenChange: (open: boolean) => void;
  moveTargetProjects: Project[];
  moveTargetProjectId: string;
  onMoveTargetProjectIdChange: (value: string) => void;
  itemActionError: string | null;
  itemActionPending: "remove" | "move" | "set-default-theme-ref" | null;
  onMoveConfirm: () => void;
  onRemoveConfirm: () => void;
}) {
  return (
    <>
      <Dialog open={props.moveOpen} onOpenChange={props.onMoveOpenChange}>
        <DialogContent className="max-w-md gap-4 px-5 pt-5 pb-5">
          <DialogHeader>
            <DialogTitle>Move resource</DialogTitle>
            <DialogDescription>
              Move{" "}
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                {props.selectedItemTitle ?? "this resource"}
              </span>{" "}
              to another project in this scope.
            </DialogDescription>
          </DialogHeader>
          {props.moveTargetProjects.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Create another project first, then you can move this resource there.
            </p>
          ) : (
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Target project
              </label>
              <select
                value={props.moveTargetProjectId}
                onChange={(event) => props.onMoveTargetProjectIdChange(event.target.value)}
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {props.moveTargetProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.title} ({project.slug})
                  </option>
                ))}
              </select>
            </div>
          )}
          {props.itemActionError ? (
            <p className="text-sm text-red-600 dark:text-red-400">{props.itemActionError}</p>
          ) : null}
          <DialogFooter className="flex flex-row justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => props.onMoveOpenChange(false)}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={props.onMoveConfirm}
              disabled={
                props.itemActionPending === "move" ||
                !props.moveTargetProjectId ||
                props.moveTargetProjects.length === 0
              }
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {props.itemActionPending === "move" ? "Moving..." : "Move resource"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={props.removeOpen} onOpenChange={props.onRemoveOpenChange}>
        <DialogContent className="max-w-md gap-4 px-5 pt-5 pb-5">
          <DialogHeader>
            <DialogTitle>Delete resource</DialogTitle>
            <DialogDescription>
              Archive{" "}
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                {props.selectedItemTitle ?? "this resource"}
              </span>{" "}
              from this project. The resource will stop appearing in project listings, but can still
              be permanently deleted later if needed.
            </DialogDescription>
          </DialogHeader>
          {props.itemActionError ? (
            <p className="text-sm text-red-600 dark:text-red-400">{props.itemActionError}</p>
          ) : null}
          <DialogFooter className="flex flex-row justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => props.onRemoveOpenChange(false)}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={props.onRemoveConfirm}
              disabled={props.itemActionPending === "remove"}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50 dark:bg-red-500 dark:hover:bg-red-400"
            >
              {props.itemActionPending === "remove" ? "Deleting..." : "Delete resource"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
