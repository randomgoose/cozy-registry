"use client";

import { Button } from "@/components/ui/button";
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
          <Button
            variant={"outline"}
            onClick={() => props.onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            variant={"destructive"}
            onClick={props.onConfirm}
            disabled={props.deleting}
          >
            {props.deleting ? "Moving..." : "Move to trash"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
