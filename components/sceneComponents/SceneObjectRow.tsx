"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type SceneTreeNode = {
  id: string;
  name: string;
  geometry: string;
  parentId?: string;
  children?: SceneTreeNode[];
};

// ---------------------------------------------------------------------------
// Geometry icons
// ---------------------------------------------------------------------------

export function GeometryIcon({ geometry, className }: { geometry: string; className?: string }) {
  const cls = cn("w-3.5 h-3.5 shrink-0", className);
  switch (geometry) {
    case "box":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
        </svg>
      );
    case "sphere":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <circle cx="12" cy="12" r="9" />
          <ellipse cx="12" cy="12" rx="9" ry="4" />
          <path d="M12 3v18" />
        </svg>
      );
    case "cylinder":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <ellipse cx="12" cy="5" rx="7" ry="3" />
          <ellipse cx="12" cy="19" rx="7" ry="3" />
          <path d="M5 5v14M19 5v14" />
        </svg>
      );
    case "cone":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path d="M12 3L5 19M12 3l7 16" />
          <ellipse cx="12" cy="19" rx="7" ry="3" />
        </svg>
      );
    case "torus":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <ellipse cx="12" cy="12" rx="10" ry="4" />
          <ellipse cx="12" cy="12" rx="4" ry="1.5" />
        </svg>
      );
    case "plane":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path d="M3 17l6-4 6 4 6-4" />
          <path d="M3 13l6-4 6 4 6-4" />
        </svg>
      );
    case "circle":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
    case "icosahedron":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <polygon points="12,2 22,8.5 22,15.5 12,22 2,15.5 2,8.5" />
          <path d="M12 2l10 13.5M12 2L2 15.5M12 22l10-6.5M12 22L2 15.5M2 8.5h20" />
        </svg>
      );
    default:
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
        </svg>
      );
  }
}

// ---------------------------------------------------------------------------
// RenameInput — inline rename field
// ---------------------------------------------------------------------------

function RenameInput({
  name,
  onSubmit,
  onCancel,
}: {
  name: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const committedRef = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const commit = useCallback(
    (value: string) => {
      if (committedRef.current) return;
      committedRef.current = true;
      const trimmed = value.trim();
      if (trimmed) onSubmit(trimmed);
      else onCancel();
    },
    [onSubmit, onCancel]
  );

  return (
    <Input
      ref={inputRef}
      defaultValue={name}
      className="h-5 text-sm bg-input border-none px-1 py-0 text-foreground focus-visible:ring-0 outline-none shadow-none"
      onBlur={(e) => commit(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit(e.currentTarget.value);
        if (e.key === "Escape") {
          committedRef.current = true;
          onCancel();
        }
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

// ---------------------------------------------------------------------------
// SceneObjectRow — a single node in the tree
// ---------------------------------------------------------------------------

export function SceneObjectRow({
  node,
  depth,
  isOpen,
  isSelected,
  isPrimary,
  selectedIds,
  primaryId,
  onSelect,
  onToggle,
  onRename,
  onDelete,
  onDuplicate,
  onBatchDelete,
  onParent,
  onUnparent,
}: {
  node: SceneTreeNode;
  depth: number;
  isOpen: boolean;
  isSelected: boolean;
  isPrimary: boolean;
  selectedIds: Set<string>;
  primaryId: string | null;
  onSelect: (id: string, modifiers: { shiftKey: boolean; ctrlKey: boolean }) => void;
  onToggle: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => string | null;
  onBatchDelete: (ids: string[]) => void;
  onParent: (childIds: string[], parentId: string) => void;
  onUnparent: (ids: string[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const pendingEditRef = useRef(false);
  const hasChildren = (node.children?.length ?? 0) > 0;

  const rowContent = (
    <div
      data-scene-row
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 mx-1 my-0.5 rounded-lg cursor-pointer select-none",
        "transition-all duration-150 group outline-none",
        isPrimary
          ? "bg-primary/20 text-primary"
          : isSelected
          ? "bg-primary/10 text-accent-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
      style={{ paddingLeft: `${12 + depth * 16}px` }}
      onClick={(e) => {
        if (!editing) onSelect(node.id, { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey || e.metaKey });
      }}
      onKeyDown={(e) => {
        if (e.key === "F2") {
          e.preventDefault();
          setEditing(true);
        }
      }}
      tabIndex={0}
    >
      {/* Collapse toggle */}
      {hasChildren ? (
        <button
          className="w-3.5 h-3.5 shrink-0 flex items-center justify-center text-neutral-500 hover:text-neutral-300"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(node.id);
          }}
        >
          <ChevronRight
            className={cn("w-3 h-3 transition-transform duration-150", isOpen && "rotate-90")}
          />
        </button>
      ) : (
        <span className="w-3.5 h-3.5 shrink-0" />
      )}

      <GeometryIcon geometry={node.geometry} className="w-3.5 h-3.5 shrink-0 text-primary/60" />

      {editing ? (
        <RenameInput
          name={node.name}
          onSubmit={(v) => {
            onRename(node.id, v);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <span className="text-sm truncate flex-1 font-normal">{node.name}</span>
      )}
    </div>
  );

  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (!open && pendingEditRef.current) {
          pendingEditRef.current = false;
          // Wait for menu close + focus-return animation to finish before editing
          requestAnimationFrame(() => requestAnimationFrame(() => setEditing(true)));
        }
      }}
    >
      <ContextMenuTrigger>{rowContent}</ContextMenuTrigger>
      <ContextMenuContent
        className="bg-popover border-border min-w-36 z-100"
        onCloseAutoFocus={(e) => {
          if (pendingEditRef.current) e.preventDefault();
        }}
      >
        {/* Rename — not shown when multiple are selected */}
        {!(isSelected && selectedIds.size > 1) && (
          <ContextMenuItem
            className="text-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer"
            onSelect={() => { pendingEditRef.current = true; }}
          >
            <svg className="w-3.5 h-3.5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
            </svg>
            Rename
          </ContextMenuItem>
        )}

        {/* Duplicate */}
        <ContextMenuItem
          className="text-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer"
          onClick={() => {
            const newId = onDuplicate(node.id);
            if (newId) onSelect(newId, { shiftKey: false, ctrlKey: false });
          }}
        >
          <svg className="w-3.5 h-3.5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m0 0a2.625 2.625 0 113.75 2.375" />
          </svg>
          Duplicate
        </ContextMenuItem>

        {/* Parent */}
        {primaryId && (isPrimary ? selectedIds.size > 1 : true) && (
          <ContextMenuItem
            className="text-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer"
            onClick={() => {
              if (isPrimary && selectedIds.size > 1) {
                onParent([...selectedIds].filter((id) => id !== primaryId), primaryId);
              } else if (isSelected && selectedIds.size > 1) {
                onParent([...selectedIds].filter((id) => id !== primaryId), primaryId);
              } else {
                onParent([node.id], primaryId);
              }
            }}
          >
            <svg className="w-3.5 h-3.5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.07-9.07a4.5 4.5 0 016.364 6.364l-4.5 4.5a4.5 4.5 0 01-7.244-1.242" />
            </svg>
            {isPrimary && selectedIds.size > 1 ? "Parent Selection to This" : "Parent to Last Selected"}
          </ContextMenuItem>
        )}

        {/* Unparent */}
        {node.parentId && (
          <ContextMenuItem
            className="text-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer"
            onClick={() => onUnparent([node.id])}
          >
            <svg className="w-3.5 h-3.5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.181 8.68a4.503 4.503 0 011.903 6.405m-9.768-2.782L3.56 14.06a4.5 4.5 0 006.364 6.365l3.129-3.129m5.614-5.615l1.757-1.757a4.5 4.5 0 00-6.364-6.365l-3.129 3.129m5.614 5.615a4.503 4.503 0 01-1.903-6.405" />
            </svg>
            Unparent
          </ContextMenuItem>
        )}

        {/* Delete */}
        <ContextMenuItem
          className="text-red-400 focus:bg-neutral-800 focus:text-red-500 cursor-pointer"
          onClick={() => {
            if (isSelected && selectedIds.size > 1) onBatchDelete([...selectedIds]);
            else onDelete(node.id);
          }}
        >
          <svg className="w-3.5 h-3.5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
          {isSelected && selectedIds.size > 1 ? `Delete (${selectedIds.size})` : "Delete"}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
