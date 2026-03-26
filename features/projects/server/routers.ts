import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { prisma } from "@/lib/prisma";
import { TRPCError } from "@trpc/server";
import { generateSlug } from "random-word-slugs";
import { z } from "zod";

export const projectsRouter = createTRPCRouter({
  create: protectedProcedure.mutation(async ({ ctx }) => {
    const name = generateSlug(3);
    const userId = ctx.auth.user.id;

    const [project, scene] = await prisma.$transaction(async (tx) => {
      const p = await tx.project.create({ data: { name, userId } });
      const s = await tx.scene.create({
        data: { name: "Scene 1", userId, projectId: p.id },
      });
      return [p, s] as const;
    });

    return { ...project, defaultSceneId: scene.id };
  }),

  createScene: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Verify the authenticated user owns this project
      const project = await prisma.project.findFirst({
        where: { id: input.projectId, userId: ctx.auth.user.id },
        select: { id: true },
      });
      if (!project) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Project not found" });
      }

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
