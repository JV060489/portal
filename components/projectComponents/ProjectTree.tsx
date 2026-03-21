"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { Tree, TreeApi } from "react-arborist";
import { Button } from "@/components/ui/button";
import { TreeNodeRow, type TreeNode } from "./TreeNodeRow";
import { DeleteDialog, type DeleteTarget } from "./DeleteDialog";

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

function toTreeData(
  projects: ProjectData[],
  creatingProject: boolean,
  addingSceneTo: string | null,
  pendingProject: string | null,
  pendingScene: { projectId: string; name: string } | null,
): TreeNode[] {
  const nodes: TreeNode[] = projects.map((p) => {
    const sceneNodes: TreeNode[] = p.scenes.map((s) => ({
      id: s.id,
      name: s.name,
      projectId: p.id,
    }));
    if (addingSceneTo === p.id) {
      sceneNodes.push({
        id: "__new-scene__",
        name: "",
        projectId: p.id,
      });
    }
    if (pendingScene && pendingScene.projectId === p.id) {
      sceneNodes.push({
        id: "__pending-scene__",
        name: pendingScene.name,
        projectId: p.id,
        isPending: true,
      });
    }
    return {
      id: p.id,
      name: p.name,
      isProject: true,
      children: sceneNodes,
    };
  });
  if (creatingProject) {
    nodes.push({
      id: "__new-project__",
      name: "",
      isProject: true,
      children: [],
    });
  }
  if (pendingProject) {
    nodes.push({
      id: "__pending-project__",
      name: pendingProject,
      isProject: true,
      isPending: true,
      children: [],
    });
  }
  return nodes;
}

export type ProjectTreeHandle = {
  startCreatingProject: () => void;
};

export const ProjectTree = forwardRef<ProjectTreeHandle>(
  function ProjectTree(_props, ref) {
    const router = useRouter();
    const pathname = usePathname();
    const pathParts = pathname.split("/");
    const activeSceneId =
      pathParts.length >= 4 && pathParts[1] === "editor" ? pathParts[3] : null;

    const [projects, setProjects] = useState<ProjectData[]>([]);
    const [loading, setLoading] = useState(true);
    const [creatingProject, setCreatingProject] = useState(false);
    const [addingSceneTo, setAddingSceneTo] = useState<string | null>(null);
    const [pendingProject, setPendingProject] = useState<string | null>(null);
    const [pendingScene, setPendingScene] = useState<{ projectId: string; name: string } | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
    const treeRef = useRef<TreeApi<TreeNode>>(null);

    useImperativeHandle(ref, () => ({
      startCreatingProject: () => setCreatingProject(true),
    }));

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
      setPendingProject(trimmed);
      try {
        const res = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        });
        if (res.ok) {
          const project = await res.json();
          setProjects((prev) => [...prev, project]);
        }
      } finally {
        setPendingProject(null);
      }
    }

    async function handleCreateScene(projectId: string, name: string) {
      const trimmed = name.trim();
      setAddingSceneTo(null);
      if (!trimmed) return;
      setPendingScene({ projectId, name: trimmed });
      try {
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
      } finally {
        setPendingScene(null);
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

      let deleted = false;

      const activeProjectId =
        pathParts.length >= 3 && pathParts[1] === "editor"
          ? pathParts[2]
          : null;

      try {
        if (isProject) {
          const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
          if (res.ok) {
            setProjects((prev) => prev.filter((p) => p.id !== id));
            deleted = true;
            if (activeProjectId === id) {
              router.push("/editor");
            }
          }
        } else if (projectId) {
          const res = await fetch(`/api/projects/${projectId}/scenes/${id}`, {
            method: "DELETE",
          });
          if (res.ok) {
            setProjects((prev) =>
              prev.map((p) =>
                p.id === projectId
                  ? { ...p, scenes: p.scenes.filter((s) => s.id !== id) }
                  : p,
              ),
            );
            deleted = true;
            if (activeSceneId === id) {
              router.push("/editor");
            }
          }
        }
      } catch (error) {
        console.error("Failed to delete item:", error);
      }

      if (!deleted) {
        if (typeof window !== "undefined") {
          window.alert("Failed to delete. Please try again.");
        }
        return;
      }
      setDeleteTarget(null);
    }

    const treeData = toTreeData(projects, creatingProject, addingSceneTo, pendingProject, pendingScene);

    if (loading) {
      return (
        <div className="flex items-center justify-center h-32">
          <span className="text-xs text-neutral-500">Loading...</span>
        </div>
      );
    }

    if (projects.length === 0 && !creatingProject) {
      return (
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
      );
    }

    return (
      <>
        <div
          onKeyDownCapture={(e) => {
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

        <DeleteDialog
          target={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      </>
    );
  },
);
