"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Tree, NodeRendererProps, TreeApi } from "react-arborist";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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

type SceneData = {
  id: string;
  name: string;
  projectId: string;
};

type ProjectData = {
  id: string;
  name: string;
  scenes: SceneData[];
};

type TreeNode = {
  id: string;
  name: string;
  isProject?: boolean;
  projectId?: string;
  children?: TreeNode[];
};

function toTreeData(
  projects: ProjectData[],
  creatingProject: boolean,
  addingSceneTo: string | null,
): TreeNode[] {
  const nodes: TreeNode[] = projects.map((p) => {
    const sceneNodes: TreeNode[] = p.scenes.map((s) => ({
      id: s.id,
      name: s.name,
      projectId: p.id,
    }));
    // Insert a placeholder scene node when adding a scene to this project
    if (addingSceneTo === p.id) {
      sceneNodes.push({
        id: "__new-scene__",
        name: "",
        projectId: p.id,
      });
    }
    return {
      id: p.id,
      name: p.name,
      isProject: true,
      children: sceneNodes,
    };
  });
  // Insert a placeholder project node when creating a new project
  if (creatingProject) {
    nodes.push({
      id: "__new-project__",
      name: "",
      isProject: true,
      children: [],
    });
  }
  return nodes;
}

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
  const focusedAtRef = useRef(0);
  const shouldGuardEarlyBlurRef = useRef(suppressInitialBlurSubmit);

  useEffect(() => {
    shouldGuardEarlyBlurRef.current = suppressInitialBlurSubmit;
  }, [suppressInitialBlurSubmit]);

  useEffect(() => {
    // Delay focus to avoid race with context menu closing
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
      className="h-5 text-sm bg-neutral-800 border-neutral-600 px-1 py-0 text-white focus-visible:ring-0 focus-visible:border-neutral-600"
      onFocus={() => {
        focusedAtRef.current = Date.now();
      }}
      onBlur={(e) => {
        // Ignore blur if the input was never properly focused (context menu race)
        if (!hasFocusedRef.current) return;

        const elapsedSinceFocus = Date.now() - focusedAtRef.current;
        const shouldIgnoreEarlyBlur =
          shouldGuardEarlyBlurRef.current &&
          !userInteractedRef.current &&
          elapsedSinceFocus < 150;

        if (shouldIgnoreEarlyBlur) {
          shouldGuardEarlyBlurRef.current = false;
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

type DeleteTarget = {
  id: string;
  name: string;
  isProject: boolean;
  projectId?: string;
} | null;

export default function Projects() {
  const router = useRouter();
  const pathname = usePathname();
  // Extract sceneId from /editor/[projectId]/[sceneId]
  const pathParts = pathname.split("/");
  const activeSceneId =
    pathParts.length >= 4 && pathParts[1] === "editor" ? pathParts[3] : null;
  const [collapsed, setCollapsed] = useState(false);
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingProject, setCreatingProject] = useState(false);
  const [addingSceneTo, setAddingSceneTo] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const treeRef = useRef<TreeApi<TreeNode>>(null);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  async function handleCreateProject(name: string) {
    const trimmed = name.trim();
    setCreatingProject(false);
    if (!trimmed) return;
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    if (res.ok) {
      const project = await res.json();
      setProjects((prev) => [...prev, project]);
    }
  }

  async function handleCreateScene(projectId: string, name: string) {
    const trimmed = name.trim();
    setAddingSceneTo(null);
    if (!trimmed) return;
    const res = await fetch(`/api/projects/${projectId}/scenes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    if (res.ok) {
      const scene = await res.json();
      setProjects((prev) =>
        prev.map((p) =>
          p.id === projectId ? { ...p, scenes: [...p.scenes, scene] } : p,
        ),
      );
    }
  }

  async function handleRename(
    id: string,
    newName: string,
    isProject: boolean,
    projectId?: string,
  ) {
    const trimmed = newName.trim();
    if (!trimmed) return;

    if (isProject) {
      const previousName = projects.find((p) => p.id === id)?.name;
      if (!previousName || previousName === trimmed) return;

      setProjects((prev) =>
        prev.map((p) => (p.id === id ? { ...p, name: trimmed } : p)),
      );

      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });

      if (!res.ok) {
        setProjects((prev) =>
          prev.map((p) => (p.id === id ? { ...p, name: previousName } : p)),
        );
      }
    } else if (projectId) {
      const previousName = projects
        .find((p) => p.id === projectId)
        ?.scenes.find((s) => s.id === id)?.name;
      if (!previousName || previousName === trimmed) return;

      setProjects((prev) =>
        prev.map((p) =>
          p.id === projectId
            ? {
                ...p,
                scenes: p.scenes.map((s) =>
                  s.id === id ? { ...s, name: trimmed } : s,
                ),
              }
            : p,
        ),
      );

      const res = await fetch(`/api/projects/${projectId}/scenes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });

      if (!res.ok) {
        setProjects((prev) =>
          prev.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  scenes: p.scenes.map((s) =>
                    s.id === id ? { ...s, name: previousName } : s,
                  ),
                }
              : p,
          ),
        );
      }
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const { id, isProject, projectId } = deleteTarget;

    if (isProject) {
      await fetch(`/api/projects/${id}`, { method: "DELETE" });
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } else if (projectId) {
      await fetch(`/api/projects/${projectId}/scenes/${id}`, {
        method: "DELETE",
      });
      setProjects((prev) =>
        prev.map((p) =>
          p.id === projectId
            ? { ...p, scenes: p.scenes.filter((s) => s.id !== id) }
            : p,
        ),
      );
    }
    setDeleteTarget(null);
  }

  const treeData = toTreeData(projects, creatingProject, addingSceneTo);

  return (
    <aside
      className={`
        h-full bg-neutral-950 border-r border-white/5 flex flex-col shrink-0
        transition-all duration-300 ease-in-out overflow-hidden scrollbar-hide relative z-10
        ${collapsed ? "w-12" : "w-64"}
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-white/5 scrollbar-hide">
        {!collapsed && (
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Projects
          </h2>
        )}
        <div className="flex items-center gap-1">
          {!collapsed && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-neutral-500 hover:text-neutral-300 hover:bg-white/5"
              onClick={() => setCreatingProject(true)}
              title="New Project"
            >
              <svg
                className="w-4 h-4"
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
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-neutral-500 hover:text-neutral-300 hover:bg-white/5"
            onClick={() => setCollapsed(!collapsed)}
          >
            <svg
              className={`w-4 h-4 transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`}
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
      {!collapsed && (
        <div className="flex-1 overflow-auto py-2 scrollbar-hide">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <span className="text-xs text-neutral-500">Loading...</span>
            </div>
          ) : projects.length === 0 && !creatingProject ? (
            <div className="flex flex-col items-center justify-center h-full px-4 gap-3">
              <svg
                className="w-10 h-10 text-neutral-700"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
                />
              </svg>
              <p className="text-xs text-neutral-500 text-center">
                No projects yet
              </p>
              <Button
                variant="link"
                className="text-xs text-blue-400 hover:text-blue-300 h-auto p-0"
                onClick={() => setCreatingProject(true)}
              >
                Create your first project
              </Button>
            </div>
          ) : (
            <div
              onKeyDownCapture={(e) => {
                // Let input elements handle their own Enter/Escape
                if (e.target instanceof HTMLInputElement) return;

                if (e.key === "Enter") {
                  e.stopPropagation();
                  e.preventDefault();
                  const focused = treeRef.current?.focusedNode;
                  if (!focused) return;
                  if (focused.isInternal) {
                    focused.toggle();
                  } else if (focused.data.projectId) {
                    router.push(
                      `/editor/${focused.data.projectId}/${focused.id}`,
                    );
                  }
                }
              }}
            >
              <Tree<TreeNode>
                ref={treeRef}
                data={treeData}
                openByDefault={true}
                width={256}
                indent={20}
                rowHeight={32}
                paddingBottom={16}
                selection={activeSceneId ?? undefined}
                className="focus:outline-none **:outline-none"
                onRename={({ id, name, node }) => {
                  if (id === "__new-project__") {
                    handleCreateProject(name);
                    return;
                  }
                  if (id === "__new-scene__" && node.data.projectId) {
                    handleCreateScene(node.data.projectId, name);
                    return;
                  }
                  const isProject = node.data.isProject ?? node.isInternal;
                  handleRename(id, name, isProject, node.data.projectId);
                }}
              >
                {(props) => (
                  <TreeNodeRow
                    {...props}
                    setAddingSceneTo={setAddingSceneTo}
                    setDeleteTarget={setDeleteTarget}
                    activeSceneId={activeSceneId}
                    onSceneClick={(projectId, sceneId) =>
                      router.push(`/editor/${projectId}/${sceneId}`)
                    }
                  />
                )}
              </Tree>
            </div>
          )}
        </div>
      )}

      {/* Collapsed icons */}
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
                d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
              />
            </svg>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent className="bg-neutral-950 border-neutral-800">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteTarget?.isProject ? "project" : "scene"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.name}</strong>
              {deleteTarget?.isProject && " and all its scenes"}. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-neutral-800 border-neutral-700 hover:bg-neutral-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}

/* Tree node row with context menu */
function TreeNodeRow({
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

  // Auto-enter edit mode for placeholder nodes
  useEffect(() => {
    if (isPlaceholder && !isEditing) {
      node.edit();
    }
  }, [isPlaceholder, isEditing, node]);

  // For placeholder nodes, just show the edit input inline
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

  const rowContent = (
    <div
      ref={dragHandle}
      style={style}
      className={`
        flex items-center gap-2 px-3 py-1.5 mx-2 my-0.5 rounded-lg cursor-pointer select-none
        transition-all duration-150 group
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
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
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
