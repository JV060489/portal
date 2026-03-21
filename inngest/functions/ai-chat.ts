import { inngest } from "../client";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, tool } from "ai";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const SYSTEM_PROMPT = `You are a 3D scene editor AI. Respond briefly. When asked to modify the scene, call the appropriate tool.

Rules:
- Y=0 is ground. Objects rest at py=0.5 (unit size).
- Rotations in radians. 90°=1.5708.
- Call list_objects first if you need IDs.
- After mutations, confirm in one short sentence.`;

type SceneObject = { id: string; name: string; geometry: string };

export const aiChatFunction = inngest.createFunction(
  {
    id: "ai-chat",
    retries: 3,
    triggers: [{ event: "ai/chat" }],
  },
  async ({ event, step }) => {
    const { jobId, messages, model, sceneContext, userId } = event.data as {
      jobId: string;
      messages: { role: string; content: string }[];
      model: string;
      sceneContext: SceneObject[];
      userId: string;
    };

    await step.run("generate", async () => {
      try {
        const isGemini = model.startsWith("gemini");
        const provider = isGemini
          ? createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY })
          : createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const result = await generateText({
          model: provider(model),
          system: SYSTEM_PROMPT,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          messages: messages as any,
          maxSteps: 5,
          experimental_telemetry: {
            isEnabled: true,
            functionId: "ai-chat",
            recordInputs: true,
            recordOutputs: true,
          },
          tools: {
            list_objects: tool({
              description: "List all scene objects with their IDs.",
              parameters: z.object({}),
              execute: async () => ({ objects: sceneContext }),
            }),
            add_object: tool({
              description: "Add a mesh to the scene.",
              parameters: z.object({
                geometry: z.enum([
                  "box", "sphere", "cylinder", "cone",
                  "torus", "plane", "circle", "icosahedron",
                ]),
                name: z.string().optional(),
              }),
            }),
            delete_object: tool({
              description: "Delete an object by ID.",
              parameters: z.object({ objectId: z.string() }),
            }),
            rename_object: tool({
              description: "Rename an object.",
              parameters: z.object({ objectId: z.string(), newName: z.string() }),
            }),
            update_transform: tool({
              description: "Move/rotate/scale an object. Omit unchanged fields.",
              parameters: z.object({
                objectId: z.string(),
                px: z.number().optional(),
                py: z.number().optional(),
                pz: z.number().optional(),
                rx: z.number().optional(),
                ry: z.number().optional(),
                rz: z.number().optional(),
                sx: z.number().optional(),
                sy: z.number().optional(),
                sz: z.number().optional(),
              }),
            }),
            change_color: tool({
              description: "Set object material color.",
              parameters: z.object({
                objectId: z.string(),
                color: z.string().describe("hex e.g. #ff4444"),
              }),
            }),
            duplicate_object: tool({
              description: "Duplicate an object and its children.",
              parameters: z.object({ objectId: z.string() }),
            }),
          },
        });

        // Collect write tool calls (those without execute) from all steps
        const writeCalls: { toolName: string; args: unknown }[] = [];
        for (const resultStep of result.steps) {
          for (const tc of resultStep.toolCalls) {
            if (tc.toolName !== "list_objects") {
              writeCalls.push({ toolName: tc.toolName, args: tc.args });
            }
          }
        }

        // Token usage is captured automatically by Sentry vercelAIIntegration via OpenTelemetry spans.
        // Add a breadcrumb for job-level context.
        Sentry.addBreadcrumb({
          message: `AI job complete: ${jobId}`,
          data: { model, userId, toolCalls: writeCalls.length },
        });

        await prisma.aiJobResult.update({
          where: { jobId },
          data: {
            status: "done",
            toolCalls: writeCalls,
            text: result.text,
          },
        });
      } catch (err) {
        Sentry.captureException(err);
        await prisma.aiJobResult.update({
          where: { jobId },
          data: {
            status: "error",
            error: err instanceof Error ? err.message : "Unknown error",
          },
        });
        throw err; // re-throw so Inngest retries
      }
    });
  }
);
