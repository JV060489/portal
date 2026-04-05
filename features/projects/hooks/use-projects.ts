"use client";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";

export const useSuspenseProjects = () => {
  const trpc = useTRPC();
  return useSuspenseQuery(trpc.projects.getMany.queryOptions());
};

export const useCreateProject = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const queryKey = trpc.projects.getMany.queryOptions().queryKey;
  return useMutation(
    trpc.projects.create.mutationOptions({
      onSuccess: (data) => {
        toast.success(`Project "${data.name}" created!`);
        queryClient.invalidateQueries({ queryKey });
      },
    })
  );
};

export const useRenameProject = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const queryKey = trpc.projects.getMany.queryOptions().queryKey;
  return useMutation(
    trpc.projects.renameProject.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey });
      },
      onError: (error) => {
        toast.error(`Failed to rename project: ${error.message}`);
      },
    })
  );
};

export const useRenameScene = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const queryKey = trpc.projects.getMany.queryOptions().queryKey;
  return useMutation(
    trpc.projects.renameScene.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey });
      },
      onError: (error) => {
        toast.error(`Failed to rename scene: ${error.message}`);
      },
    })
  );
};

export const useCreateScene = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const queryKey = trpc.projects.getMany.queryOptions().queryKey;
  return useMutation(
    trpc.projects.createScene.mutationOptions({
      onSuccess: (data) => {
        toast.success(`Scene "${data.name}" created!`);
        queryClient.invalidateQueries({ queryKey });
      },
      onError: () => {
        toast.error("Failed to create scene.");
      },
    })
  );
};

export const useDeleteProject = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const queryKey = trpc.projects.getMany.queryOptions().queryKey;

  return useMutation({
    mutationFn: async ({
      projectId,
      projectName,
    }: {
      projectId: string;
      projectName: string;
    }) => {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to delete project.");
      }

      return { projectId, projectName };
    },
    onSuccess: ({ projectName }) => {
      toast.success(`Project "${projectName}" deleted.`);
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete project.");
    },
  });
};

export const useDeleteScene = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const queryKey = trpc.projects.getMany.queryOptions().queryKey;

  return useMutation({
    mutationFn: async ({
      projectId,
      sceneId,
      sceneName,
    }: {
      projectId: string;
      sceneId: string;
      sceneName: string;
    }) => {
      const res = await fetch(`/api/projects/${projectId}/scenes/${sceneId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to delete scene.");
      }

      return { sceneId, sceneName };
    },
    onSuccess: ({ sceneName }) => {
      toast.success(`Scene "${sceneName}" deleted.`);
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete scene.");
    },
  });
};
