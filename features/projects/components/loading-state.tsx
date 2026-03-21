import { Skeleton } from "@/components/ui/skeleton";

export const ProjectsLoadingState = () => (
  <div className="w-full flex flex-col gap-2">
    {Array.from({ length: 3 }).map((_, i) => (
      <Skeleton key={i} className="h-12 w-full rounded-md" />
    ))}
  </div>
);
