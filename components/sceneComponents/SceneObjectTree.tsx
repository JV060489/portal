"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  useYjsObjects,
  useYjsRenameObject,
  useYjsDeleteObject,
  useYjsDuplicateObject,
  useYjsBatchDelete,
  useYjsParentObject,
  useYjsUnparentObject,
  type SceneObjectInfo,
} from "@/lib/yjs/hooks";
import { SceneObjectRow, type SceneTreeNode } from "./SceneObjectRow";
import { AddObjectDropdown } from "./AddObjectDropdown";

// ---------------------------------------------------------------------------
// Build flat YJS objects into a tree
// ---------------------------------------------------------------------------

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

function isReadyForTree(object: SceneObjectInfo) {
  return (
    object.geometryKind !== "generated" ||
    object.compileStatus === "ready" ||
    object.compileStatus === "error"
  );
}

function getCompiledTreeObjects(objects: SceneObjectInfo[]) {
  const objectMap = new Map(objects.map((object) => [object.id, object]));
  const childIdsByParentId = new Map<string, string[]>();

  for (const object of objects) {
    if (!object.parentId) continue;

    const childIds = childIdsByParentId.get(object.parentId) ?? [];
    childIds.push(object.id);
    childIdsByParentId.set(object.parentId, childIds);
  }

  const includeIds = new Set<string>();

  const includeWithAncestors = (object: SceneObjectInfo) => {
    let current: SceneObjectInfo | undefined = object;
    while (current && !includeIds.has(current.id)) {
      includeIds.add(current.id);
      current = current.parentId ? objectMap.get(current.parentId) : undefined;
    }
  };

  for (const object of objects) {
    if (isReadyForTree(object)) {
      includeWithAncestors(object);
    }
  }

  for (const object of objects) {
    if (
      object.geometryKind === "group" &&
      !childIdsByParentId.get(object.id)?.some((childId) => includeIds.has(childId))
    ) {
      includeIds.delete(object.id);
    }
  }

  return objects.filter((object) => includeIds.has(object.id));
}

// ---------------------------------------------------------------------------
// Recursive tree renderer — no react-arborist dependency
// ---------------------------------------------------------------------------

function TreeNodes({
  nodes,
  depth,
  openIds,
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
  nodes: SceneTreeNode[];
  depth: number;
  openIds: Set<string>;
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
  return (
    <>
      {nodes.map((node) => {
        const isOpen = openIds.has(node.id);
        const hasChildren = (node.children?.length ?? 0) > 0;

        return (
          <div key={node.id}>
            <SceneObjectRow
              node={node}
              depth={depth}
              isOpen={isOpen}
              isSelected={selectedIds.has(node.id)}
              isPrimary={node.id === primaryId}
              selectedIds={selectedIds}
              primaryId={primaryId}
              onSelect={onSelect}
              onToggle={onToggle}
              onRename={onRename}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
              onBatchDelete={onBatchDelete}
              onParent={onParent}
              onUnparent={onUnparent}
            />
            {hasChildren && isOpen && (
              <TreeNodes
                nodes={node.children!}
                depth={depth + 1}
                openIds={openIds}
                selectedIds={selectedIds}
                primaryId={primaryId}
                onSelect={onSelect}
                onToggle={onToggle}
                onRename={onRename}
                onDelete={onDelete}
                onDuplicate={onDuplicate}
                onBatchDelete={onBatchDelete}
                onParent={onParent}
                onUnparent={onUnparent}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// SceneObjectTree — sidebar panel
// ---------------------------------------------------------------------------

export default function SceneObjectTree({
  selectedIds,
  primaryId,
  onSelect,
  onDeselectAll,
  collapsed,
  onCollapse,
}: {
  selectedIds: Set<string>;
  primaryId: string | null;
  onSelect: (id: string, modifiers: { shiftKey: boolean; ctrlKey: boolean }) => void;
  onDeselectAll: () => void;
  collapsed: boolean;
  onCollapse: (v: boolean) => void;
}) {
  // Tracks which nodes are expanded; all nodes open by default
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());

  const objects = useYjsObjects();
  const renameObject = useYjsRenameObject();
  const deleteObject = useYjsDeleteObject();
  const duplicateObject = useYjsDuplicateObject();
  const batchDelete = useYjsBatchDelete();
  const parentObject = useYjsParentObject();
  const unparentObject = useYjsUnparentObject();

  const compiledTreeObjects = useMemo(
    () => getCompiledTreeObjects(objects),
    [objects],
  );
  const treeData = useMemo(
    () => buildTreeData(compiledTreeObjects),
    [compiledTreeObjects],
  );

  // Auto-open parent nodes when new objects are added
  const allParentIds = useMemo(() => {
    const ids = new Set<string>();
    for (const obj of compiledTreeObjects) {
      if (obj.parentId) ids.add(obj.parentId);
    }
    return ids;
  }, [compiledTreeObjects]);

  // Ensure all parent nodes are open by default when they gain children
  const effectiveOpenIds = useMemo(() => {
    const merged = new Set(openIds);
    for (const id of allParentIds) {
      if (!merged.has(id) && !openIds.has(`closed:${id}`)) {
        merged.add(id);
      }
    }
    return merged;
  }, [openIds, allParentIds]);

  const handleToggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (effectiveOpenIds.has(id)) {
        next.delete(id);
        next.add(`closed:${id}`); // mark as explicitly closed
      } else {
        next.add(id);
        next.delete(`closed:${id}`);
      }
      return next;
    });
  };

  return (
    <aside className="h-full w-full bg-card border-r border-border flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        {!collapsed && (
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Scene
          </span>
        )}
        <div className="flex items-center gap-1">
          {!collapsed && <AddObjectDropdown />}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-accent"
            onClick={() => onCollapse(!collapsed)}
          >
            <svg
              className={`w-4 h-4 transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </Button>
        </div>
      </div>

      {/* Tree content */}
      <div
        className={`flex-1 overflow-y-auto py-1 ${collapsed ? "hidden" : ""}`}
        onMouseDown={(e) => {
          const target = e.target as HTMLElement;
          if (
            target.closest("[role='menuitem'], [role='menu'], [data-radix-popper-content-wrapper]")
          )
            return;
          if (target.closest("[data-scene-row]")) return;
          onDeselectAll();
        }}
      >
        <TreeNodes
          nodes={treeData}
          depth={0}
          openIds={effectiveOpenIds}
          selectedIds={selectedIds}
          primaryId={primaryId}
          onSelect={onSelect}
          onToggle={handleToggle}
          onRename={renameObject}
          onDelete={deleteObject}
          onDuplicate={duplicateObject}
          onBatchDelete={batchDelete}
          onParent={parentObject}
          onUnparent={unparentObject}
        />
      </div>

      {/* Collapsed icon */}
      {collapsed && (
        <div className="flex flex-col items-center gap-3 pt-3">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <svg
              className="w-4 h-4 text-primary"
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
