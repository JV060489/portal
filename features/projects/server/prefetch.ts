import { prefetch, trpc } from "@/trpc/server";

export const prefetchProjects = () => {
  return prefetch(trpc.projects.getMany.queryOptions());
};
