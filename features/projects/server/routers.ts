import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { prisma } from "@/server/persistence";
import { generateSlug } from "random-word-slugs";
import { z } from "zod";

export const projectsRouter = createTRPCRouter({
  create: protectedProcedure.mutation(async ({ ctx }) => {
    const project = await prisma.project.create({
      data: {
        name: generateSlug(3),
        userId: ctx.auth.user.id,
      },
    });

    // Create a default scene for every new project
    const scene = await prisma.scene.create({
      data: {
        name: "Scene 1",
        userId: ctx.auth.user.id,
        projectId: project.id,
      },
    });

    return { ...project, defaultSceneId: scene.id };
  }),

  createScene: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Count existing scenes to name the new one
      const count = await prisma.scene.count({
        where: { projectId: input.projectId },
      });

      return prisma.scene.create({
        data: {
          name: `Scene ${count + 1}`,
          userId: ctx.auth.user.id,
          projectId: input.projectId,
        },
      });
    }),

  renameProject: protectedProcedure
    .input(z.object({ projectId: z.string(), name: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      prisma.project.update({
        where: { id: input.projectId, userId: ctx.auth.user.id },
        data: { name: input.name },
      })
    ),

  renameScene: protectedProcedure
    .input(z.object({ sceneId: z.string(), name: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      prisma.scene.update({
        where: { id: input.sceneId, userId: ctx.auth.user.id },
        data: { name: input.name },
      })
    ),

  getMany: protectedProcedure.query(({ ctx }) => {
    return prisma.project.findMany({
      where: { userId: ctx.auth.user.id },
      include: { scenes: true },
      orderBy: { createdAt: "desc" },
    });
  }),
});
