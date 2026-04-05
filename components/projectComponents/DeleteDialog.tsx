"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type DeleteTarget = {
  id: string;
  name: string;
  isProject: boolean;
  projectId?: string;
} | null;

export function DeleteDialog({
  target,
  onClose,
  onConfirm,
  isPending = false,
}: {
  target: DeleteTarget;
  onClose: () => void;
  onConfirm: () => void;
  isPending?: boolean;
}) {
  return (
    <AlertDialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="bg-neutral-950 border-neutral-800">
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {target?.isProject ? "project" : "scene"}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete <strong>{target?.name}</strong>
            {target?.isProject && " and all its scenes"}. This action cannot be
            undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={isPending}
            className="bg-neutral-800 border-neutral-700 hover:bg-neutral-700"
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isPending}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {isPending ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
