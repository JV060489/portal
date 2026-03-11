"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Tree, NodeRendererProps, TreeApi } from "react-arborist";

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

function toTreeData(projects: ProjectData[]): TreeNode[] {
  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    isProject: true,
    children: p.scenes.map((s) => ({
      id: s.id,
      name: s.name,
      projectId: p.id,
    })),
  }));
}

function RenameInput({ node }: { node: NodeRendererProps<TreeNode>["node"] }) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <input
      ref={inputRef}
      defaultValue={node.data.name}
      className="text-sm bg-neutral-800 border border-neutral-600 rounded px-1 py-0 outline-none text-white w-full"
      onBlur={(e) => node.submit(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") node.submit(e.currentTarget.value);
        if (e.key === "Escape") node.reset();
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

export default function Projects() {
  const [collapsed, setCollapsed] = useState(false);
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingProject, setCreatingProject] = useState(false);
  const [addingSceneTo, setAddingSceneTo] = useState<string | null>(null);
  const treeRef = useRef<TreeApi<TreeNode>>(null);
  const newProjectInputRef = useRef<HTMLInputElement>(null);
  const newSceneInputRef = useRef<HTMLInputElement>(null);

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
    if (!trimmed) {
      setCreatingProject(false);
      return;
    }
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    if (res.ok) {
      const project = await res.json();
      setProjects((prev) => [...prev, project]);
    }
    setCreatingProject(false);
  }

  async function handleCreateScene(projectId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) {
      setAddingSceneTo(null);
      return;
    }
    const res = await fetch(`/api/projects/${projectId}/scenes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    if (res.ok) {
      const scene = await res.json();
      setProjects((prev) =>
        prev.map((p) =>
          p.id === projectId ? { ...p, scenes: [...p.scenes, scene] } : p
        )
      );
    }
    setAddingSceneTo(null);
  }

  async function handleRename(id: string, newName: string, isProject: boolean, projectId?: string) {
    const trimmed = newName.trim();
    if (!trimmed) return;

    if (isProject) {
      await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      setProjects((prev) =>
        prev.map((p) => (p.id === id ? { ...p, name: trimmed } : p))
      );
    } else if (projectId) {
      await fetch(`/api/projects/${projectId}/scenes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      setProjects((prev) =>
        prev.map((p) =>
          p.id === projectId
            ? {
                ...p,
                scenes: p.scenes.map((s) =>
                  s.id === id ? { ...s, name: trimmed } : s
                ),
              }
            : p
        )
      );
    }
  }

  const treeData = toTreeData(projects);

  return (
    <aside
      className={`
        h-full bg-neutral-950 border-r border-white/5 flex flex-col
        transition-all duration-300 ease-in-out overflow-hidden
        ${collapsed ? "w-12" : "w-64"}
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-white/5">
        {!collapsed && (
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Projects
          </h2>
        )}
        <div className="flex items-center gap-1">
          {!collapsed && (
            <button
              onClick={() => setCreatingProject(true)}
              className="p-1.5 rounded-md text-neutral-500 hover:text-neutral-300 hover:bg-white/5 transition-colors cursor-pointer"
              title="New Project"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-md text-neutral-500 hover:text-neutral-300 hover:bg-white/5 transition-colors cursor-pointer"
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
          </button>
        </div>
      </div>

      {/* Content */}
      {!collapsed && (
        <div className="flex-1 overflow-auto py-2">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <span className="text-xs text-neutral-500">Loading...</span>
            </div>
          ) : projects.length === 0 && !creatingProject ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center h-full px-4 gap-3">
              <svg className="w-10 h-10 text-neutral-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
              </svg>
              <p className="text-xs text-neutral-500 text-center">No projects yet</p>
              <button
                onClick={() => setCreatingProject(true)}
                className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
              >
                Create your first project
              </button>
            </div>
          ) : (
            <>
              <Tree<TreeNode>
                ref={treeRef}
                data={treeData}
                openByDefault={true}
                width={256}
                indent={20}
                rowHeight={32}
                paddingBottom={16}
                onRename={({ id, name, node }) => {
                  const isProject = node.data.isProject ?? node.isInternal;
                  handleRename(id, name, isProject, node.data.projectId);
                }}
              >
                {(props) => <NodeWithAddScene {...props} addingSceneTo={addingSceneTo} setAddingSceneTo={setAddingSceneTo} />}
              </Tree>

              {/* Inline new scene input */}
              {addingSceneTo && (
                <div className="mx-2 ml-10 my-1">
                  <input
                    ref={newSceneInputRef}
                    autoFocus
                    placeholder="Scene name..."
                    className="text-sm bg-neutral-800 border border-neutral-600 rounded px-2 py-1 outline-none text-white w-full"
                    onBlur={(e) => handleCreateScene(addingSceneTo, e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateScene(addingSceneTo, e.currentTarget.value);
                      if (e.key === "Escape") setAddingSceneTo(null);
                    }}
                  />
                </div>
              )}
            </>
          )}

          {/* Inline new project input */}
          {creatingProject && (
            <div className="mx-2 my-1">
              <input
                ref={newProjectInputRef}
                autoFocus
                placeholder="Project name..."
                className="text-sm bg-neutral-800 border border-neutral-600 rounded px-2 py-1 outline-none text-white w-full"
                onBlur={(e) => handleCreateProject(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateProject(e.currentTarget.value);
                  if (e.key === "Escape") setCreatingProject(false);
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Collapsed icons */}
      {collapsed && (
        <div className="flex flex-col items-center gap-3 pt-3">
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
            </svg>
          </div>
        </div>
      )}
    </aside>
  );
}

/* Extended Node that shows + button on project rows */
function NodeWithAddScene({
  node,
  style,
  dragHandle,
  setAddingSceneTo,
}: NodeRendererProps<TreeNode> & {
  addingSceneTo: string | null;
  setAddingSceneTo: (id: string | null) => void;
}) {
  const isProject = node.data.isProject ?? node.isInternal;
  const isSelected = node.isSelected;
  const isEditing = node.isEditing;

  return (
    <div
      ref={dragHandle}
      style={style}
      className={`
        flex items-center gap-2 px-3 py-1.5 mx-2 my-0.5 rounded-lg cursor-pointer select-none
        transition-all duration-150 group
        ${isSelected ? "bg-blue-500/15 text-blue-400" : "text-neutral-400 hover:bg-white/5 hover:text-neutral-200"}
      `}
      onClick={() => {
        if (node.isInternal) node.toggle();
        else node.select();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        node.edit();
      }}
      onKeyDown={(e) => {
        if (e.key === "F2") {
          e.preventDefault();
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
        <svg className="w-3.5 h-3.5 shrink-0 text-blue-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
        </svg>
      )}

      {isEditing ? (
        <RenameInput node={node} />
      ) : (
        <>
          <span className={`text-sm truncate flex-1 ${isProject ? "font-medium" : "font-normal"}`}>
            {node.data.name}
          </span>
          {isProject && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!node.isOpen) node.toggle();
                setAddingSceneTo(node.id);
              }}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-neutral-500 hover:text-neutral-300 transition-opacity cursor-pointer"
              title="Add Scene"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
          )}
        </>
      )}
    </div>
  );
}
