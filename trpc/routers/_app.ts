import { createTRPCRouter } from "../init";
import { projectsRouter } from "@/features/projects/server/routers";

export const appRouter = createTRPCRouter({
  projects: projectsRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
