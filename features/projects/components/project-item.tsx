"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronRight, Plus, Film } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCreateScene, useRenameProject } from "../hooks/use-projects";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

type Scene = { id: string; name: string };
type Project = { id: string; name: string; scenes: Scene[] };

function InlineRename({
  value,
  onSave,
  isPending,
  className,
}: {
  value: string;
  onSave: (name: string) => void;
  isPending?: boolean;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onSave(trimmed);
    else setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "bg-neutral-800 border border-neutral-600 rounded px-1.5 py-0.5 text-sm text-neutral-100 outline-none focus:border-neutral-400",
          className
        )}
        style={{ width: `calc(${Math.max(draft.length, 4)}ch + 1.5rem)` }}
      />
    );
  }

  if (isPending) {
    return (
      <div
        className="rounded px-1.5 py-0.5 border border-transparent bg-neutral-700 animate-pulse"
        style={{ width: `calc(${Math.max(value.length, 4)}ch + 1.5rem)`, height: "1.5rem" }}
      />
    );
  }

  return (
    <span
      className={cn(
        "text-sm font-medium cursor-text select-none text-neutral-100 border border-transparent px-1.5 py-0.5 rounded",
        className
      )}
      onDoubleClick={(e) => { e.stopPropagation(); setDraft(value); setEditing(true); }}
      title="Double-click to rename"
    >
      {value}
    </span>
  );
}

export const ProjectItem = ({ project }: { project: Project }) => {
  const [open, setOpen] = useState(false);
  const createScene = useCreateScene();
  const renameProject = useRenameProject();
  const router = useRouter();

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="w-full">
      <div className="flex items-center justify-between gap-2 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2">
        <div className="flex items-center gap-2">
          <CollapsibleTrigger asChild>
            <button
              className="flex items-center justify-center rounded p-0.5 text-neutral-400 transition-colors hover:text-neutral-100 shrink-0"
              aria-label="Toggle scenes"
            >
              <ChevronRight
                className={cn("size-4 transition-transform duration-200", open && "rotate-90")}
              />
            </button>
          </CollapsibleTrigger>

          <InlineRename
            value={project.name}
            isPending={renameProject.isPending}
            onSave={(name) => renameProject.mutate({ projectId: project.id, name })}
          />
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs text-neutral-400 hover:text-neutral-100 shrink-0"
          onClick={() => { createScene.mutate({ projectId: project.id }); setOpen(true); }}
          disabled={createScene.isPending}
        >
          <Plus className="size-3.5" />
          Add Scene
        </Button>
      </div>

      <CollapsibleContent className="pl-6 pt-1 flex flex-col gap-1">
        {project.scenes.length === 0 ? (
          <p className="py-2 text-xs text-neutral-500">No scenes yet.</p>
        ) : (
          project.scenes.map((scene) => (
            <div
              key={scene.id}
              onClick={() => router.push(`/projects/${project.id}/${scene.id}`)}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-neutral-300 transition-colors hover:bg-neutral-800 cursor-pointer"
            >
              <Film className="size-3.5 text-neutral-500 shrink-0" />
              <span className="truncate">{scene.name}</span>
            </div>
          ))
        )}
      </CollapsibleContent>
    </Collapsible>
  );
};
