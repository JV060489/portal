"use client";
import { useSuspenseProjects } from "../hooks/use-projects";
import { EmptyState } from "./empty-state";
import { ProjectItem } from "./project-item";

export const ProjectsList = () => {
  const { data: projects } = useSuspenseProjects();

  if (!projects.length) {
    return <EmptyState />;
  }

  return (
    <div className="w-full flex flex-col gap-2">
      {projects.map((project) => (
        <ProjectItem key={project.id} project={project} />
      ))}
    </div>
  );
};
