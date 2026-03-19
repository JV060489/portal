"use client";

import { useRef, useState, useMemo } from "react";
import { Tree, TreeApi } from "react-arborist";
import { Button } from "@/components/ui/button";
import { useYjsObjects, useYjsRenameObject, useYjsDeleteObject, useYjsDuplicateObject, useYjsBatchDelete, useYjsParentObject, useYjsUnparentObject, type SceneObjectInfo } from "@/lib/yjs/hooks";
import { SceneObjectRow, type SceneTreeNode } from "./SceneObjectRow";
import { AddObjectDropdown } from "./AddObjectDropdown";

function buildTreeData(objects: SceneObjectInfo[]): SceneTreeNode[] {
  const nodeMap = new Map<string, SceneTreeNode>();
  for (const obj of objects) {
    nodeMap.set(obj.id, { id: obj.id, name: obj.name, geometry: obj.geometry, parentId: obj.parentId });
  }
  const roots: SceneTreeNode[] = [];
  for (const obj of objects) {
    const node = nodeMap.get(obj.id)!;
    if (obj.parentId && nodeMap.has(obj.parentId)) {
      const parent = nodeMap.get(obj.parentId)!;
      if (!parent.children) parent.children = [];
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export default function SceneObjectTree({
  selectedIds,
  primaryId,
  onSelect,
  onDeselectAll,
}: {
  selectedIds: Set<string>;
  primaryId: string | null;
  onSelect: (id: string, modifiers: { shiftKey: boolean; ctrlKey: boolean }) => void;
  onDeselectAll: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const objects = useYjsObjects();
  const renameObject = useYjsRenameObject();
  const deleteObject = useYjsDeleteObject();
  const duplicateObject = useYjsDuplicateObject();
  const batchDelete = useYjsBatchDelete();
  const parentObject = useYjsParentObject();
  const unparentObject = useYjsUnparentObject();
  const treeRef = useRef<TreeApi<SceneTreeNode> | null>(null);

  const treeData = useMemo(() => buildTreeData(objects), [objects]);

  return (
    <aside
      className={`
        h-full bg-neutral-950 border-l border-white/5 flex flex-col shrink-0
        transition-all duration-300 ease-in-out overflow-hidden
        ${collapsed ? "w-12" : "w-56"}
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
        {!collapsed && (
          <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
            Scene
          </span>
        )}
        <div className="flex items-center gap-1">
          {!collapsed && <AddObjectDropdown />}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-neutral-500 hover:text-neutral-300 hover:bg-white/5"
            onClick={() => setCollapsed(!collapsed)}
          >
            <svg
              className={`w-4 h-4 transition-transform duration-300 ${collapsed ? "" : "rotate-180"}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
              />
            </svg>
          </Button>
        </div>
      </div>

      {/* Content */}
      <div
        className={`flex-1 overflow-y-auto py-1 ${collapsed ? "hidden" : ""}`}
        onMouseDown={(e) => {
          // Deselect only when clicking truly empty space — not on a tree row,
          // context menu, or any interactive element inside the panel.
          const target = e.target as HTMLElement;
          if (target.closest("[role='menuitem'], [role='menu'], [data-radix-popper-content-wrapper]")) return;
          if (target.closest("[data-scene-row]")) return;
          onDeselectAll();
        }}
      >
          <Tree<SceneTreeNode>
            ref={treeRef}
            data={treeData}
            width="100%"
            indent={16}
            rowHeight={32}
            disableDrag
            disableDrop
            className="focus:outline-none **:outline-none"
            onRename={({ id, name }) => renameObject(id, name)}
          >
            {(props) => (
              <SceneObjectRow
                {...props}
                onDelete={deleteObject}
                onDuplicate={duplicateObject}
                onBatchDelete={batchDelete}
                selectedIds={selectedIds}
                primaryId={primaryId}
                onSelect={onSelect}
                onParent={parentObject}
                onUnparent={unparentObject}
              />
            )}
          </Tree>
        </div>

      {/* Collapsed icon */}
      {collapsed && (
        <div className="flex flex-col items-center gap-3 pt-3">
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <svg
              className="w-4 h-4 text-blue-400"
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
          </div>
        </div>
      )}
    </aside>
  );
}
