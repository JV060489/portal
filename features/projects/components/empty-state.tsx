"use client";
import { FolderOpen } from "lucide-react";

export const EmptyState = () => (
  <div className="flex flex-col items-center gap-3 py-16 text-neutral-500">
    <FolderOpen className="size-12 stroke-1" />
    <p className="text-sm">No projects yet. Create one to get started.</p>
  </div>
);
