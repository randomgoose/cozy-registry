"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ProjectTrashDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectTitle: string | null;
  deleting: boolean;
  error: string | null;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-md gap-4 px-5 pt-5 pb-5">
        <DialogHeader>
          <DialogTitle>Move project to trash</DialogTitle>
          <DialogDescription>
            Move{" "}
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {props.projectTitle ?? "this project"}
            </span>{" "}
            to trash. It will disappear from active project lists, while its resources and sharing
            setup stay intact for a future restore flow.
          </DialogDescription>
        </DialogHeader>
        {props.error ? (
          <p className="text-sm text-red-600 dark:text-red-400">{props.error}</p>
        ) : null}
        <DialogFooter className="flex flex-row justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => props.onOpenChange(false)}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={props.onConfirm}
            disabled={props.deleting}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50 dark:bg-red-500 dark:hover:bg-red-400"
          >
            {props.deleting ? "Moving..." : "Move to trash"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
