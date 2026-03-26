"use client";
import { useCreateProject } from "@/features/projects/hooks/use-projects";
import { Button } from "../ui/button";
import { useRouter } from "next/navigation";

function ProjectPage({ children }: { children: React.ReactNode }) {
  const createProject = useCreateProject();
  const router = useRouter()

  const handleCreate = () => {
    if (createProject.isPending) return;
    createProject.mutate(undefined, {
      onSuccess: (data) => {
        router.push(`/projects/${data.id}/${data.defaultSceneId}`)
      },
      onError: (error) => {
        console.error("Failed to create project:", error);
      }
    })
  }
  return (
    <div className="h-full w-full max-w-3xl mx-auto px-6 flex flex-col">
      <div className="flex items-center justify-between py-10">
        <h1 className="text-3xl font-bold">Projects</h1>
        <Button onClick={handleCreate} disabled={createProject.isPending}>Add Project</Button>
      </div>
      <div className="flex flex-col w-full">
        {children}
      </div>
    </div>
  );
}

export default ProjectPage;
