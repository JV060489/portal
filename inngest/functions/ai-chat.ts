import { inngest } from "../client";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, tool, jsonSchema, stepCountIs } from "ai";
import * as Sentry from "@sentry/nextjs";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const SYSTEM_PROMPT = `You are a 3D scene editor AI. Respond briefly. When asked to modify the scene, call the appropriate tool.

Rules:
- Y=0 is ground. Objects rest at py=0.5 (unit size).
- Rotations in radians. 90°=1.5708.
- Think carefully before acting, especially for complex objects, multi-object layouts, relative positioning, spacing, symmetry, stacking, and rotations.
- Do the calculation properly before calling tools. Work out positions, offsets, dimensions, and rotation values step by step, then use the final computed numbers in tool calls.
- If the request depends on object relationships or exact placement, inspect the scene first and avoid guessing.
- Call list_objects first if you need IDs.
- After mutations, confirm in one short sentence.`;

type SceneObject = { id: string; name: string; geometry: string };

export const aiChatFunction = inngest.createFunction(
  {
    id: "ai-chat",
    retries: 3,
    triggers: [{ event: "ai/chat" }],
    onFailure: async ({ event, error }) => {
      const { jobId } = event.data.event.data as { jobId: string };
      Sentry.captureException(error);
      await prisma.aiJobResult.update({
        where: { jobId },
        data: {
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });
    },
  },
  async ({ event, step, logger }) => {
    const { jobId, messages, model, sceneContext, userId } = event.data as {
      jobId: string;
      messages: { role: string; content: string }[];
      model: string;
      sceneContext: SceneObject[];
      userId: string;
    };

    const result = await step.run("generate", async () => {
      const isGemini = model.startsWith("gemini");
      const provider = isGemini
        ? createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY })
        : createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

      // Mutable scene state so list_objects reflects additions/deletions mid-conversation
      const liveScene: SceneObject[] = sceneContext.map((o) => ({ ...o }));

      const aiResult = await generateText({
        model: provider(model),
        system: SYSTEM_PROMPT,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        messages: messages as any,
        stopWhen: stepCountIs(10),
        experimental_telemetry: {
          isEnabled: true,
          functionId: "ai-chat",
          recordInputs: true,
          recordOutputs: true,
        },
        tools: {
          list_objects: tool({
            description: "List all scene objects with their IDs.",
            inputSchema: jsonSchema({
              type: "object" as const,
              properties: {},
              additionalProperties: false,
            }),
            execute: async () => ({ objects: liveScene }),
          }),
          add_object: tool({
            description: "Add a mesh to the scene.",
            inputSchema: jsonSchema({
              type: "object" as const,
              properties: {
                geometry: {
                  type: "string",
                  enum: ["box", "sphere", "cylinder", "cone", "torus", "plane", "circle", "icosahedron"],
                },
                name: { type: "string" },
              },
              required: ["geometry"],
            }),
            execute: async (input) => {
              const { geometry, name } = input as { geometry: string; name?: string };
              const id = crypto.randomUUID();
              const resolvedName = name ?? geometry;
              liveScene.push({ id, geometry, name: resolvedName });
              return { ok: true, id, geometry, name: resolvedName };
            },
          }),
          delete_object: tool({
            description: "Delete an object by ID.",
            inputSchema: jsonSchema({
              type: "object" as const,
              properties: { objectId: { type: "string" } },
              required: ["objectId"],
            }),
            execute: async (input) => {
              const { objectId } = input as { objectId: string };
              const idx = liveScene.findIndex((o) => o.id === objectId);
              if (idx !== -1) liveScene.splice(idx, 1);
              return { ok: true, deleted: objectId };
            },
          }),
          rename_object: tool({
            description: "Rename an object.",
            inputSchema: jsonSchema({
              type: "object" as const,
              properties: {
                objectId: { type: "string" },
                newName: { type: "string" },
              },
              required: ["objectId", "newName"],
            }),
            execute: async (input) => {
              const { objectId, newName } = input as { objectId: string; newName: string };
              const obj = liveScene.find((o) => o.id === objectId);
              if (obj) obj.name = newName;
              return { ok: true, objectId, newName };
            },
          }),
          update_transform: tool({
            description: "Move/rotate/scale an object. Omit unchanged fields.",
            inputSchema: jsonSchema({
              type: "object" as const,
              properties: {
                objectId: { type: "string" },
                px: { type: "number" }, py: { type: "number" }, pz: { type: "number" },
                rx: { type: "number" }, ry: { type: "number" }, rz: { type: "number" },
                sx: { type: "number" }, sy: { type: "number" }, sz: { type: "number" },
              },
              required: ["objectId"],
            }),
            execute: async (input) => {
              return { ok: true, ...(input as object) };
            },
          }),
          change_color: tool({
            description: "Set object material color.",
            inputSchema: jsonSchema({
              type: "object" as const,
              properties: {
                objectId: { type: "string" },
                color: { type: "string", description: "hex e.g. #ff4444" },
              },
              required: ["objectId", "color"],
            }),
            execute: async (input) => {
              const { objectId, color } = input as { objectId: string; color: string };
              return { ok: true, objectId, color };
            },
          }),
          duplicate_object: tool({
            description: "Duplicate an object and its children.",
            inputSchema: jsonSchema({
              type: "object" as const,
              properties: { objectId: { type: "string" } },
              required: ["objectId"],
            }),
            execute: async (input) => {
              const { objectId } = input as { objectId: string };
              const original = liveScene.find((o) => o.id === objectId);
              if (original) {
                const newId = crypto.randomUUID();
                liveScene.push({ id: newId, geometry: original.geometry, name: `${original.name} copy` });
                return { ok: true, originalId: objectId, newId };
              }
              return { ok: false, error: "Object not found" };
            },
          }),
        },
      });

      // Build a per-step trace of everything the AI did
      const stepTrace = aiResult.steps.map((s, i) => {
        const toolCalls = s.toolCalls.map((tc) => {
          const input = (tc as unknown as { input: unknown }).input;
          return { toolName: tc.toolName, input };
        });
        const toolResults = s.toolResults?.map((tr) => ({
          toolName: tr.toolName,
          output: (tr as unknown as { output: unknown }).output,
        })) ?? [];
        return {
          step: i,
          text: s.text,
          finishReason: s.finishReason,
          toolCalls,
          toolResults,
          usage: s.usage,
        };
      });

      const writeCalls: { toolName: string; args: unknown }[] = [];
      for (const s of aiResult.steps) {
        for (const tc of s.toolCalls) {
          if (tc.toolName === "list_objects") continue;
          const input = (tc as unknown as { input: unknown }).input as Record<string, unknown>;
          // For add_object, merge the execute output so the client gets the server-assigned id
          if (tc.toolName === "add_object") {
            const result = s.toolResults?.find((tr) => tr.toolCallId === tc.toolCallId);
            const output = result ? (result as unknown as { output: Record<string, unknown> }).output : {};
            writeCalls.push({ toolName: tc.toolName, args: { ...input, ...output } });
          } else {
            writeCalls.push({ toolName: tc.toolName, args: input });
          }
        }
      }

      return {
        model,
        userId,
        jobId,
        finalText: aiResult.text,
        finishReason: aiResult.finishReason,
        totalSteps: aiResult.steps.length,
        usage: aiResult.usage,
        stepTrace,
        writeCalls,
      };
    });

    await step.run("persist", async () => {
      logger.info("AI generation complete", {
        jobId,
        model,
        userId,
        totalSteps: result.totalSteps,
        writeCallCount: result.writeCalls.length,
        finishReason: result.finishReason,
        usage: result.usage,
      });

      for (const s of result.stepTrace) {
        if (s.toolCalls.length > 0) {
          logger.info(`Step ${s.step} tool calls`, { toolCalls: s.toolCalls });
        }
        if (s.toolResults.length > 0) {
          logger.info(`Step ${s.step} tool results`, { toolResults: s.toolResults });
        }
        if (s.text) {
          logger.info(`Step ${s.step} reasoning`, { text: s.text });
        }
      }

      Sentry.addBreadcrumb({
        message: `AI job complete: ${jobId}`,
        data: { model, userId, toolCalls: result.writeCalls.length },
      });

      await prisma.aiJobResult.update({
        where: { jobId },
        data: {
          status: "done",
          toolCalls: result.writeCalls as unknown as Prisma.InputJsonValue,
          text: result.finalText,
        },
      });
    });
  }
);
