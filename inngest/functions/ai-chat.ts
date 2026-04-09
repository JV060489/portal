import { inngest } from "../client";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, tool, jsonSchema, stepCountIs } from "ai";
import type { ModelMessage } from "ai";
import * as Sentry from "@sentry/nextjs";
import type { Prisma } from "@prisma/client";
import {
  computeWorldBoundsMap,
  type WorldBoundsSummary,
} from "@/lib/scene/bounds";
import { prisma } from "@/lib/prisma";
import type { LocalBounds } from "@/lib/yjs/types";

const SYSTEM_PROMPT = `You are a 3D scene editor AI. Respond briefly. When asked to modify the scene, call the appropriate tool.

Rules:
- Y=0 is ground. Objects rest at py=0.5 (unit size).
- Rotations in radians. 90°=1.5708.
- Think carefully before acting, especially for complex objects, multi-object layouts, relative positioning, spacing, symmetry, stacking, and rotations.
- Do the calculation properly before calling tools. Work out positions, offsets, dimensions, and rotation values step by step, then use the final computed numbers in tool calls.
- If the request depends on object relationships or exact placement, inspect the scene first and avoid guessing.
- Call list_objects first if you need IDs or spatial context.
- Use object bounds and anchors for placement instead of guessing offsets.
- Transform position px/py/pz is the object's local origin/pivot, not necessarily the object's visual center.
- Use worldAnchors.center when centering one object on another.
- Use worldAnchors.bottomCenter -> target worldAnchors.topCenter when placing one object on top of another.
- To place an existing object anchor at a target point, move its origin by the same world-space delta from its current anchor to that target.
- Generated OpenSCAD objects are normalized after compile: their local origin is at the footprint's bottom center, local Y is up, and local Y=0 is the object's base.
- For requests like "create X on the table", do not wait for the generated object's bounds. Generate it, then place it by setting px/pz to the target topCenter X/Z and py to the target topCenter Y.
- If exact scale, clearance, stacking on top of the generated object, or alignment to the generated object's side depends on its final bounds, create it first and explain that a follow-up is needed after bounds appear.
- After mutations, confirm in one short sentence.`;

const OPENSCAD_CODE_PROMPT = `You generate only valid OpenSCAD for a single 3D object.

Rules:
- Return only raw OpenSCAD code.
- The model must be a single printable 3D object.
- Use clear top-level parameters for important dimensions.
- Author the model in OpenSCAD's native Z-up coordinate system.
- Make the object stand upright with its base resting on the z=0 plane.
- Keep the footprint centered near the origin in X and Y so preview placement is stable.
- Avoid wrapping the whole model in a final arbitrary rotate() unless the prompt explicitly requires it.
- Prefer sensible, compact dimensions and avoid extremely tiny or extremely huge values.
- For curved, round, cylindrical, spherical, organic, sculptural, vase-like, torus-like, or revolved geometry, make surfaces visually smooth.
- Set a top-level $fn parameter between 160 and 256 whenever the object has curved surfaces, unless the user explicitly asks for low-poly/faceted geometry.
- Pass adequate $fn values to cylinder(), sphere(), circle(), rotate_extrude(), and curved helper modules when local control is needed.
- OpenSCAD has no subdivision-surface modifier. Approximate smooth/subdivision-like forms with high fragment counts, rotate_extrude() from a smooth profile, hull() between overlapping rounded primitives, and careful minkowski()/offset rounding only when complexity stays reasonable.
- Avoid visibly faceted cylinders/spheres/arcs, coarse polyhedron() meshes, and visibly banded/stepped stacks for objects that should have smooth surfaces.
- For vases, bottles, cups, lampshades, bowls, and other lathe-like objects, prefer one rotate_extrude() of a many-point smooth profile over stacking separate cylinders/cones. Use 12+ profile points for complex silhouettes and keep slope changes gradual unless the reference has a real edge.
- Generate manifold, watertight solid geometry only.
- Avoid infinitely thin walls, open surfaces, coplanar overlapping faces, self-intersections, non-positive dimensions, and boolean operations that merely touch at a face/edge/point.
- Give shells, rims, plates, text, raised details, engraved details, connectors, and decorative features explicit positive thickness and real overlap with the main body.
- Do not include colors or rendering notes.
- Do not include markdown fences.
- Prefer clean constructive solid geometry that compiles reliably in OpenSCAD.`;

const OPENSCAD_REFERENCE_IMAGE_RULES = `Reference image rules:
- The attached image is the shape authority. Do not create a generic instance of the named object.
- Match the visible silhouette first: height-to-width ratio, belly/shoulder height, neck length, lip flare, base taper, foot/base details, handles/spouts/cutouts.
- If the reference object has ceramic, glass, molded plastic, rounded, organic, or lathe-turned surfaces, generate smooth high-resolution curves that match the silhouette instead of stepped/faceted approximations.
- Do not approximate a smooth reference image with horizontal bands, stacked frustums, or a visibly segmented body. Use a continuous curved/revolved profile when the source surface is continuous.
- Model decorative surface geometry only when possible as shallow raised/engraved relief; ignore color-only changes that have no physical boundary.
- If the user text and image disagree, follow the user's text for task intent and the image for the object's form.`;

const SCENE_REFERENCE_IMAGE_RULES = `The current user message includes a reference image.
Use it as visual context for generation requests. When you call generate_openscad_object for the referenced object, keep the prompt focused on the user's intent and explicitly mention that the attached reference image must be used for the object's visible form. Do not replace the reference with a generic object.`;

type SceneObject = {
  id: string;
  name: string;
  geometry: string;
  geometryKind?: "primitive" | "generated";
  sourceKind?: "openscad";
  parentId?: string;
  px?: number;
  py?: number;
  pz?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  sx?: number;
  sy?: number;
  sz?: number;
  localBounds?: LocalBounds;
  worldBounds?: LocalBounds;
  worldAnchors?: WorldBoundsSummary["anchors"];
  generatedPrompt?: string;
};

const GENERATED_OBJECT_BOUNDS_ESTIMATE: LocalBounds = {
  min: [-0.5, 0, -0.5],
  max: [0.5, 1, 0.5],
  size: [1, 1, 1],
  center: [0, 0.5, 0],
};

type InputMessage = {
  role: "user" | "assistant";
  content: string;
};

type ReferenceImage = {
  dataUrl: string;
  mediaType: "image/png" | "image/jpeg" | "image/webp";
  name?: string;
};

function refreshSceneBoundsContext(liveScene: SceneObject[]) {
  const summaries = computeWorldBoundsMap(
    liveScene.map((obj) => ({
      id: obj.id,
      parentId: obj.parentId,
      px: obj.px ?? 0,
      py: obj.py ?? 0,
      pz: obj.pz ?? 0,
      rx: obj.rx ?? 0,
      ry: obj.ry ?? 0,
      rz: obj.rz ?? 0,
      sx: obj.sx ?? 1,
      sy: obj.sy ?? 1,
      sz: obj.sz ?? 1,
      localBounds: obj.localBounds,
    })),
  );

  for (const obj of liveScene) {
    const summary = summaries.get(obj.id);
    obj.worldBounds = summary?.bounds;
    obj.worldAnchors = summary?.anchors;
  }
}

function getReferenceImageBytes(referenceImage: ReferenceImage): Uint8Array {
  const base64Payload = referenceImage.dataUrl.split(",")[1];
  if (!base64Payload) {
    throw new Error("Reference image data is invalid.");
  }

  return new Uint8Array(Buffer.from(base64Payload, "base64"));
}

async function generateOpenScadCode(
  model: string,
  provider: ReturnType<typeof createOpenAI>,
  prompt: string,
  referenceImage?: ReferenceImage,
): Promise<string> {
  const result = await generateText({
    model: provider(model),
    system: referenceImage
      ? `${OPENSCAD_CODE_PROMPT}

${OPENSCAD_REFERENCE_IMAGE_RULES}`
      : OPENSCAD_CODE_PROMPT,
    ...(referenceImage
      ? {
          messages: [
            {
              role: "user" as const,
              content: [
                { type: "text" as const, text: prompt },
                {
                  type: "image" as const,
                  image: getReferenceImageBytes(referenceImage),
                  mediaType: referenceImage.mediaType,
                },
              ],
            },
          ],
        }
      : { prompt }),
    temperature: 0.2,
  });

  return result.text
    .replace(/^```(?:openscad)?\s*/i, "")
    .replace(/```$/, "")
    .trim();
}

function buildGeneratedPromptForStorage(
  prompt: string,
  referenceImage?: ReferenceImage,
): string {
  if (!referenceImage) return prompt;

  return `${prompt}

Reference image attached during generation: ${referenceImage.name ?? referenceImage.mediaType}`;
}

function buildOpenScadUserPrompt(
  prompt: string,
  referenceImage?: ReferenceImage,
): string {
  if (!referenceImage) return prompt;

  return `${prompt}

Use the attached reference image as the concrete visual specification for the object's visible form. Match that image; do not create a generic version of the requested noun.`;
}

function attachReferenceImageToLatestUserMessage(
  messages: InputMessage[],
  referenceImage?: ReferenceImage,
): ModelMessage[] {
  const modelMessages: ModelMessage[] = messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));

  if (!referenceImage) return modelMessages;

  const lastUserIndex = modelMessages.findLastIndex(
    (message) => message.role === "user",
  );

  if (lastUserIndex === -1) return modelMessages;

  const lastUserMessage = modelMessages[lastUserIndex];
  if (lastUserMessage.role !== "user") return modelMessages;

  modelMessages[lastUserIndex] = {
    ...lastUserMessage,
    content: [
      {
        type: "text",
        text: `${String(lastUserMessage.content)}

Attached reference image: use this image as visual context for the requested object.`,
      },
      {
        type: "image",
        image: getReferenceImageBytes(referenceImage),
        mediaType: referenceImage.mediaType,
      },
    ],
  };

  return modelMessages;
}

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
    const { jobId, messages, model, sceneContext, userId, referenceImage } =
      event.data as {
      jobId: string;
      messages: InputMessage[];
      model: string;
      sceneContext: SceneObject[];
      userId: string;
      referenceImage?: ReferenceImage;
    };

    const result = await step.run("generate", async () => {
      const provider = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const modelMessages = attachReferenceImageToLatestUserMessage(
        messages,
        referenceImage,
      );

      // Mutable scene state so list_objects reflects additions/deletions mid-conversation
      const liveScene: SceneObject[] = sceneContext.map((o) => ({ ...o }));
      refreshSceneBoundsContext(liveScene);

      const aiResult = await generateText({
        model: provider(model),
        system: referenceImage
          ? `${SYSTEM_PROMPT}

${SCENE_REFERENCE_IMAGE_RULES}`
          : SYSTEM_PROMPT,
        messages: modelMessages,
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
          generate_openscad_object: tool({
            description:
              "Generate a new OpenSCAD-backed object for the scene. Use this when the user asks to create a model or part.",
            inputSchema: jsonSchema({
              type: "object" as const,
              properties: {
                prompt: { type: "string" },
                name: { type: "string" },
              },
              required: ["prompt"],
            }),
            execute: async (input) => {
              const { prompt, name } = input as {
                prompt: string;
                name?: string;
              };
              const codePrompt = buildOpenScadUserPrompt(
                prompt,
                referenceImage,
              );
              const generatedPrompt = buildGeneratedPromptForStorage(
                prompt,
                referenceImage,
              );
              const openscadCode = await generateOpenScadCode(
                model,
                provider,
                codePrompt,
                referenceImage,
              );
              const id = crypto.randomUUID();
              const resolvedName = name ?? "Generated Object";
              liveScene.push({
                id,
                geometry: "generated",
                geometryKind: "generated",
                sourceKind: "openscad",
                name: resolvedName,
                px: 0,
                py: 0,
                pz: 0,
                rx: 0,
                ry: 0,
                rz: 0,
                sx: 1,
                sy: 1,
                sz: 1,
                localBounds: GENERATED_OBJECT_BOUNDS_ESTIMATE,
                generatedPrompt,
              });
              refreshSceneBoundsContext(liveScene);
              return {
                ok: true,
                id,
                name: resolvedName,
                geometry: "generated",
                geometryKind: "generated",
                sourceKind: "openscad",
                generatedPrompt,
                openscadCode,
              };
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
              refreshSceneBoundsContext(liveScene);
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
              const { objectId, newName } = input as {
                objectId: string;
                newName: string;
              };
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
                px: { type: "number" },
                py: { type: "number" },
                pz: { type: "number" },
                rx: { type: "number" },
                ry: { type: "number" },
                rz: { type: "number" },
                sx: { type: "number" },
                sy: { type: "number" },
                sz: { type: "number" },
              },
              required: ["objectId"],
            }),
            execute: async (input) => {
              const payload = input as Record<string, unknown>;
              const objectId = payload.objectId as string;
              const target = liveScene.find((obj) => obj.id === objectId);
              if (target) {
                Object.assign(target, payload);
                refreshSceneBoundsContext(liveScene);
              }
              return { ok: true, ...payload };
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
              const { objectId, color } = input as {
                objectId: string;
                color: string;
              };
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
                liveScene.push({
                  ...original,
                  id: newId,
                  name: `${original.name} copy`,
                });
                refreshSceneBoundsContext(liveScene);
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
        const toolResults =
          s.toolResults?.map((tr) => ({
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
          const input = (tc as unknown as { input: unknown }).input as Record<
            string,
            unknown
          >;
          if (tc.toolName === "generate_openscad_object") {
            const result = s.toolResults?.find(
              (tr) => tr.toolCallId === tc.toolCallId,
            );
            const output = result
              ? (result as unknown as { output: Record<string, unknown> })
                  .output
              : {};
            writeCalls.push({
              toolName: tc.toolName,
              args: { ...input, ...output },
            });
          } else {
            writeCalls.push({ toolName: tc.toolName, args: input });
          }
        }
      }

      return {
        model,
        userId,
        jobId,
        referenceImage: {
          present: Boolean(referenceImage),
          mediaType: referenceImage?.mediaType,
          name: referenceImage?.name,
        },
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
        referenceImagePresent: result.referenceImage.present,
        referenceImageName: result.referenceImage.name,
        finishReason: result.finishReason,
        usage: result.usage,
      });

      for (const s of result.stepTrace) {
        if (s.toolCalls.length > 0) {
          logger.info(`Step ${s.step} tool calls`, { toolCalls: s.toolCalls });
        }
        if (s.toolResults.length > 0) {
          logger.info(`Step ${s.step} tool results`, {
            toolResults: s.toolResults,
          });
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
  },
);
