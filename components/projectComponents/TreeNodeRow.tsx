"use client";

import { useState, useEffect, useRef } from "react";
import { NodeRendererProps } from "react-arborist";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { DeleteTarget } from "./DeleteDialog";

export type TreeNode = {
  id: string;
  name: string;
  isProject?: boolean;
  isPending?: boolean;
  projectId?: string;
  children?: TreeNode[];
};

function RenameInput({
  node,
  suppressInitialBlurSubmit = false,
  onFinalize,
}: {
  node: NodeRendererProps<TreeNode>["node"];
  suppressInitialBlurSubmit?: boolean;
  onFinalize?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hasFocusedRef = useRef(false);
  const userInteractedRef = useRef(false);
  const shouldGuardEarlyBlurRef = useRef(suppressInitialBlurSubmit);

  useEffect(() => {
    shouldGuardEarlyBlurRef.current = suppressInitialBlurSubmit;
  }, [suppressInitialBlurSubmit]);

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
      hasFocusedRef.current = true;
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Input
      ref={inputRef}
      defaultValue={node.data.name}
      className="h-5 text-sm bg-neutral-800 border-none px-1 py-0 text-white focus-visible:ring-0 outline-none shadow-none"
      onFocus={() => {
        hasFocusedRef.current = true;
      }}
      onBlur={(e) => {
        if (!hasFocusedRef.current) return;

        if (shouldGuardEarlyBlurRef.current && !userInteractedRef.current) {
          requestAnimationFrame(() => {
            inputRef.current?.focus();
            inputRef.current?.select();
          });
          return;
        }

        shouldGuardEarlyBlurRef.current = false;
        onFinalize?.();
        node.submit(e.currentTarget.value);
      }}
      onChange={() => {
        userInteractedRef.current = true;
      }}
      onKeyDown={(e) => {
        userInteractedRef.current = true;
        if (e.key === "Enter") {
          onFinalize?.();
          node.submit(e.currentTarget.value);
        }
        if (e.key === "Escape") {
          onFinalize?.();
          node.reset();
        }
      }}
      onClick={(e) => {
        userInteractedRef.current = true;
        e.stopPropagation();
      }}
    />
  );
}

export function TreeNodeRow({
  node,
  style,
  dragHandle,
  setAddingSceneTo,
  setDeleteTarget,
  activeSceneId,
  onSceneClick,
}: NodeRendererProps<TreeNode> & {
  setAddingSceneTo: (id: string | null) => void;
  setDeleteTarget: (target: DeleteTarget) => void;
  activeSceneId: string | null;
  onSceneClick: (projectId: string, sceneId: string) => void;
}) {
  const isProject = node.data.isProject ?? node.isInternal;
  const isSelected = !isProject && node.id === activeSceneId;
  const isEditing = node.isEditing;
  const isPlaceholder =
    node.id === "__new-project__" || node.id === "__new-scene__";
  const isPending = node.data.isPending === true;
  const pendingRenameRef = useRef(false);
  const [renameFromContextMenu, setRenameFromContextMenu] = useState(false);

  const handleContextMenuOpenChange = (open: boolean) => {
    if (!open && pendingRenameRef.current) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          node.edit();
          pendingRenameRef.current = false;
        });
      });
    }
  };

  useEffect(() => {
    if (isPlaceholder && !isEditing) {
      node.edit();
    }
  }, [isPlaceholder, isEditing, node]);

  if (isPlaceholder) {
    return (
      <div
        ref={dragHandle}
        style={style}
        className="flex items-center gap-2 px-3 py-1.5 mx-2 my-0.5"
      >
        {isProject ? (
          <svg
            className="w-3.5 h-3.5 shrink-0 text-neutral-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 5l7 7-7 7"
            />
          </svg>
        ) : (
          <svg
            className="w-3.5 h-3.5 shrink-0 text-blue-400/60"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9"
            />
          </svg>
        )}
        {isEditing ? (
          <RenameInput node={node} />
        ) : (
          <span className="text-sm text-neutral-500">...</span>
        )}
      </div>
    );
  }

  if (isPending) {
    return (
      <div
        ref={dragHandle}
        style={style}
        className="flex items-center gap-2 px-3 py-1.5 mx-2 my-0.5 rounded-lg animate-pulse"
      >
        <div className="w-3.5 h-3.5 shrink-0 rounded bg-neutral-700" />
        <div className="h-3.5 flex-1 rounded bg-neutral-700" />
      </div>
    );
  }

  const rowContent = (
    <div
      ref={dragHandle}
      style={style}
      className={`
        flex items-center gap-2 px-3 py-1.5 mx-2 my-0.5 rounded-lg cursor-pointer select-none
        transition-all duration-150 group outline-none
        ${isSelected ? "bg-blue-500/15 text-blue-400" : "text-neutral-400 hover:bg-white/5 hover:text-neutral-200"}
      `}
      onClick={() => {
        if (node.isInternal) {
          node.toggle();
        } else if (node.data.projectId) {
          onSceneClick(node.data.projectId, node.id);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "F2") {
          e.preventDefault();
          setRenameFromContextMenu(false);
          node.edit();
        }
      }}
      tabIndex={0}
    >
      {isProject ? (
        <svg
          className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${node.isOpen ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 5l7 7-7 7"
          />
        </svg>
      ) : (
        <svg
          className="w-3.5 h-3.5 shrink-0 text-blue-400/60"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9"
          />
        </svg>
      )}

      {isEditing ? (
        <RenameInput
          node={node}
          suppressInitialBlurSubmit={renameFromContextMenu}
          onFinalize={() => {
            setRenameFromContextMenu(false);
          }}
        />
      ) : (
        <>
          <span
            className={`text-sm truncate flex-1 ${isProject ? "font-medium" : "font-normal"}`}
          >
            {node.data.name}
          </span>
          {isProject && (
            <Button
              variant="ghost"
              size="icon"
              className="opacity-0 group-hover:opacity-100 h-5 w-5 text-neutral-500 hover:text-neutral-300"
              onClick={(e) => {
                e.stopPropagation();
                if (!node.isOpen) node.toggle();
                setAddingSceneTo(node.id);
              }}
              title="Add Scene"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4.5v15m7.5-7.5h-15"
                />
              </svg>
            </Button>
          )}
        </>
      )}
    </div>
  );

  return (
    <ContextMenu onOpenChange={handleContextMenuOpenChange}>
      <ContextMenuTrigger>{rowContent}</ContextMenuTrigger>
      <ContextMenuContent
        className="bg-neutral-900 border-neutral-700 min-w-36"
        onCloseAutoFocus={(e) => {
          if (pendingRenameRef.current) {
            e.preventDefault();
          }
        }}
      >
        <ContextMenuItem
          className="text-neutral-300 focus:bg-neutral-800 focus:text-white cursor-pointer"
          onSelect={() => {
            setRenameFromContextMenu(true);
            pendingRenameRef.current = true;
          }}
        >
          <svg
            className="w-3.5 h-3.5 mr-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"
            />
          </svg>
          Rename
        </ContextMenuItem>
        <ContextMenuItem
          className="text-red-400 focus:bg-neutral-800 focus:text-red-500 cursor-pointer"
          onClick={() =>
            setDeleteTarget({
              id: node.id,
              name: node.data.name,
              isProject,
              projectId: node.data.projectId,
            })
          }
        >
          <svg
            className="w-3.5 h-3.5 mr-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
            />
          </svg>
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
