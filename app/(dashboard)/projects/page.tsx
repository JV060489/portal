import ProjectPage from "@/components/projectComponents/ProjectPage";
import { ProjectsList } from "@/features/projects/components/projects";
import { requireAuth } from "@/lib/auth-utils";
import { HydrateClient } from "@/trpc/server";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { prefetchProjects } from "@/features/projects/server/prefetch";

export default async function Page() {
  await requireAuth();
  prefetchProjects();
  return (
    <HydrateClient>
      <ProjectPage>
        <ErrorBoundary fallback={<p className="text-sm text-red-400">Something went wrong.</p>}>
          <Suspense fallback={
            <div className="flex flex-col gap-2 w-full">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-12 w-full rounded-md bg-neutral-800 animate-pulse" />
              ))}
            </div>
          }>
            <ProjectsList />
          </Suspense>
        </ErrorBoundary>
      </ProjectPage>
    </HydrateClient>
  );
}
