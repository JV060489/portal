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
import { buildRelationshipPrompt } from "@/lib/scene/relationship-prompt";
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
- Generated OpenSCAD objects are imported into a meters-based scene: OpenSCAD numeric dimensions are treated as millimeters and converted with 1 OpenSCAD unit = 0.001 scene units. Their local origin is at the footprint's bottom center, local Y is up, and local Y=0 is the object's base.
- For requests like "create X on the table", do not wait for the generated object's bounds. Generate it, then place it by setting px/pz to the target topCenter X/Z and py to the target topCenter Y.
- If exact scale, clearance, stacking on top of the generated object, or alignment to the generated object's side depends on its final bounds, create it first and explain that a follow-up is needed after bounds appear.
- Default to editable parts for OpenSCAD: if the requested object has multiple logical pieces, components, attachments, limbs, panels, handles, wheels, lids, buttons, holes/caps, or separable details, first create a group, then create each logical part as its own OpenSCAD child object with parentId, partRole, transform placement, and relationshipPrompt.
- Use a single generated OpenSCAD object only when the requested shape is truly one continuous part, such as one vase body, one bracket plate, one knob, one gear, or one simple primitive-like solid.
- For requests to select, delete, move, or edit a piece inside an existing monolithic OpenSCAD object, create a replacement group with child OpenSCAD parts, then delete the original monolithic object after the child parts have been created.
- After mutations, confirm in one short sentence.`;

const OPENSCAD_CODE_PROMPT = `You generate only valid OpenSCAD for one standalone 3D object or one standalone child part.

Rules:
- Return only raw OpenSCAD code.
- The model must be a single printable 3D object/part.
- If this generation is for an editable child part, generate only that child part. Do not include the surrounding assembly, neighboring parts, scene transforms, or duplicate connector pieces that belong to other child parts.
- Make the object useful as CAD, not just visually suggestive: include functional dimensions, clearances, thicknesses, hole sizes, spacing, support/contact surfaces, and manufacturable proportions when relevant.
- Initialize and declare clear top-level parameters for important dimensions before modules/geometry. Never create parameters for color.
- Author the model in OpenSCAD's native Z-up coordinate system.
- Make the object stand upright with its base resting on the z=0 plane.
- Keep the footprint centered near the origin in X and Y so preview placement is stable.
- Avoid wrapping the whole model in a final arbitrary rotate() unless the prompt explicitly requires it.
- Prefer sensible, compact dimensions and avoid extremely tiny or extremely huge values.
- Treat numeric dimensions as millimeters unless the user explicitly asks for another unit system.
- For curved, round, cylindrical, spherical, organic, sculptural, vase-like, torus-like, or revolved geometry, make surfaces visually smooth.
- Set a top-level $fn parameter between 160 and 256 whenever the object has curved surfaces, unless the user explicitly asks for low-poly/faceted geometry.
- Pass adequate $fn values to cylinder(), sphere(), circle(), rotate_extrude(), and curved helper modules when local control is needed.
- OpenSCAD has no subdivision-surface modifier. Approximate smooth/subdivision-like forms with high fragment counts, rotate_extrude() from a smooth profile, hull() between overlapping rounded primitives, and careful minkowski()/offset rounding only when complexity stays reasonable.
- Avoid visibly faceted cylinders/spheres/arcs, coarse polyhedron() meshes, and visibly banded/stepped stacks for objects that should have smooth surfaces.
- For vases, bottles, cups, lampshades, bowls, and other lathe-like objects, prefer one rotate_extrude() of a many-point smooth profile over stacking separate cylinders/cones. Use 12+ profile points for complex silhouettes and keep slope changes gradual unless the reference has a real edge.
- Generate manifold, watertight solid geometry only.
- Avoid infinitely thin walls, open surfaces, coplanar overlapping faces, self-intersections, non-positive dimensions, and boolean operations that merely touch at a face/edge/point.
- Keep the output to the requested physical object or child part only. Do not add floating artifacts, loose blobs, stray spikes, accidental side attachments, shadow/reflection shapes, background objects, labels, watermarks, or image noise as geometry.
- Unless the user explicitly asks for separate loose parts, every generated detail must be intentionally connected to the main object with positive overlap and a clear structural or decorative purpose.
- Give shells, rims, plates, text, raised details, engraved details, connectors, and decorative features explicit positive thickness and real overlap with the main body.
- For plates, brackets, mounts, gears, holders, adapters, and mechanical parts, prefer dimensioned CSG: start from a solid body, subtract holes/cutouts with difference(), use named parameters for hole diameter/count/spacing, and add fillets/chamfers/rounded corners where practical.
- For requests with counts, patterns, symmetry, or holes, compute placements from parameters and loops. Do not eyeball or randomly scatter features.
- If editing existing OpenSCAD, preserve useful existing parameters/modules unless the requested edit conflicts with them.
- Do not include colors or rendering notes.
- Do not include markdown fences.
- Prefer clean constructive solid geometry that compiles reliably in OpenSCAD.

Example pattern for a useful bracket:
plate_length = 120;
plate_width = 36;
plate_thickness = 6;
hole_diameter = 5;
hole_count = 8;
corner_radius = 4;
$fn = 96;

difference() {
  linear_extrude(height = plate_thickness)
    offset(r = corner_radius)
      offset(delta = -corner_radius)
        square([plate_length, plate_width], center = true);

  for (i = [0 : hole_count - 1]) {
    translate([
      -plate_length / 2 + 15 + i * ((plate_length - 30) / (hole_count - 1)),
      0,
      -0.5
    ])
      cylinder(h = plate_thickness + 1, d = hole_diameter);
  }
}`;

const OPENSCAD_REPAIR_PROMPT = `You repair OpenSCAD code.

Return only corrected raw OpenSCAD code. Keep the user's requested object and the existing useful parameters. Fix syntax, invalid constructs, non-manifold geometry, zero/negative dimensions, disconnected parts, missing semicolons/braces, and code that is only decorative rather than CAD-useful. Do not include markdown fences or explanations.`;

const OPENSCAD_THINKING_PROMPT = `You are planning an OpenSCAD model before code generation.

Analyze the requested object carefully and produce a concise implementation brief for a later strict OpenSCAD code generator.

Rules:
- Do not output OpenSCAD code.
- Do not include hidden chain-of-thought or private reasoning transcripts.
- If a reference image is attached, inspect it as the concrete visual specification and describe the visible silhouette, proportions, and geometry-relevant details.
- When a reference image is attached, identify the primary requested foreground object and ignore background, support surfaces, shadows, reflections, compression artifacts, watermarks, labels, and stray edge fragments.
- Identify the best OpenSCAD construction strategy: main primitives, rotate_extrude or linear_extrude profiles, hull/minkowski usage, boolean operations, helper modules, and parameter names.
- For functional/mechanical requests, identify concrete dimensions, hole counts, hole spacing, thicknesses, clearances, symmetry, loops, and which features should be subtracted with difference().
- Call out printability constraints, wall thickness, real overlaps between connected parts, manifold geometry, centering, z=0 base placement, and smoothness requirements.
- Keep the brief direct and implementation-focused.`;

const OPENSCAD_REFERENCE_IMAGE_RULES = `Reference image rules:
- The attached image is the shape authority. Do not create a generic instance of the named object.
- Model only the requested primary physical object or explicitly requested child part. Treat the background, support surface, shadows, reflections, glare, cast silhouettes, watermarks, labels, compression noise, and stray edge fragments as non-geometry.
- Match the visible silhouette first: height-to-width ratio, belly/shoulder height, neck length, lip flare, base taper, foot/base details, handles/spouts/cutouts.
- Do not turn ambiguous pixels into physical details. Exclude floating specks, detached islands, accidental protrusions, halos, blobs, or side growths unless the user explicitly identifies them as real parts of the object.
- Any included detail from the image must be physically plausible, intentionally connected to the main object with positive overlap, and useful to the object's form.
- If the reference object has ceramic, glass, molded plastic, rounded, organic, or lathe-turned surfaces, generate smooth high-resolution curves that match the silhouette instead of stepped/faceted approximations.
- Do not approximate a smooth reference image with horizontal bands, stacked frustums, or a visibly segmented body. Use a continuous curved/revolved profile when the source surface is continuous.
- Model decorative surface geometry only when possible as shallow raised/engraved relief; ignore color-only changes that have no physical boundary.
- If the user text and image disagree, follow the user's text for task intent and the image for the object's form.`;

const SCENE_REFERENCE_IMAGE_RULES = `The current user message includes a reference image.
Use it as visual context for generation requests. When you call generate_openscad_object for the referenced object, keep the prompt focused on the user's intent and explicitly mention that the attached reference image must be used for the object's visible form. Do not replace the reference with a generic object.
Ignore background clutter, shadows, reflections, support surfaces, watermarks, labels, compression noise, stray edge fragments, and detached or accidental blobs unless the user explicitly asks to model them.`;

const SELECTION_RULES = `Selection rules:
- The user may have selected scene objects. Selection is focus context, not a hard lock.
- The first selectedObjectId is the primary selected object.
- If objects are selected and the user says "this", "it", "them", "selected", or asks for an ambiguous edit, target the selected objects.
- For transform, rename, delete, duplicate, and color/material edits, use the existing scene edit tools on selected object IDs.
- For selected OpenSCAD parts with parentId/partRole/relationshipPrompt, preserve their relationship context when moving or editing them.
- For shape/form/detail edits to a selected object, call edit_openscad_object instead of generate_openscad_object.
- For multi-selection shape edits, edit the primary selected object unless the user clearly identifies multiple selected targets. Ask a brief question if the target is still ambiguous.
- If the user clearly asks to create/add/generate a new multi-piece object, use create_group plus one generate_openscad_object call per logical piece. You may still use the selection for placement/reference.
- If the user asks to create/add/generate a truly single-piece object, call generate_openscad_object once.`;

const OPENSCAD_WORKFLOW_RULES = `OpenSCAD workflow:
- Treat generate_openscad_object and edit_openscad_object as planning-phase tools. They queue a later strict OpenSCAD generation phase.
- In prompt/editPrompt, preserve the user's shape intent and include only concise geometry requirements the OpenSCAD generator needs.
- For simple parameter-only changes on an existing OpenSCAD object, use update_openscad_parameters instead of regenerating the model.
- When creating editable multi-part objects, call create_group once for the assembly and generate each part separately with generate_openscad_object using the group ID as parentId. Do not also generate a whole-object OpenSCAD monolith for the same assembly.
- For each child part, set partRole to a short logical role and set px/py/pz/sx/sy/sz so the children are visibly separated and assembled under the group.
- Keep each generated part's OpenSCAD code centered on its own footprint origin; place parts with scene transforms instead of embedding assembly offsets inside the part code.
- Do not mention phases, tools, prompts, or internal implementation details to the user.`;

const OPENSCAD_THINKING_MAX_OUTPUT_TOKENS = 500;
const OPENSCAD_THINKING_MAX_COMPLETION_TOKENS = 1200;
const OPENSCAD_CODE_MAX_OUTPUT_TOKENS = 6000;
const OPENSCAD_CODE_MAX_COMPLETION_TOKENS = 8000;

const OPENSCAD_THINKING_PROVIDER_OPTIONS = {
  openai: {
    reasoningEffort: "medium",
    forceReasoning: true,
    maxCompletionTokens: OPENSCAD_THINKING_MAX_COMPLETION_TOKENS,
    textVerbosity: "medium",
  },
} as const;

const OPENSCAD_CODE_PROVIDER_OPTIONS = {
  openai: {
    reasoningEffort: "low",
    forceReasoning: false,
    maxCompletionTokens: OPENSCAD_CODE_MAX_COMPLETION_TOKENS,
    textVerbosity: "medium",
  },
} as const;

type SceneObject = {
  id: string;
  type?: string;
  name: string;
  geometry: string;
  geometryKind?: "primitive" | "generated" | "group";
  sourceKind?: "openscad";
  parentId?: string;
  partRole?: string;
  relationshipPrompt?: string;
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
  materialColor?: string;
  openscadCode?: string;
  generatedPrompt?: string;
  compileStatus?: "idle" | "compiling" | "ready" | "error";
  compileError?: string;
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

type OpenScadGenerationTask =
  | {
      toolCallId: string;
      toolName: "generate_openscad_object";
      objectId: string;
      name: string;
      prompt: string;
      codePrompt: string;
      generatedPrompt: string;
    }
  | {
      toolCallId: string;
      toolName: "edit_openscad_object";
      objectId: string;
      name: string;
      editPrompt: string;
      codePrompt: string;
      generatedPrompt: string;
    };

type OpenScadThinkingResult = {
  toolCallId: string;
  brief: string;
  usedFallback: boolean;
};

type GeneratedOpenScadCode = {
  toolCallId: string;
  openscadCode: string;
};

type QueuedWriteCall = {
  toolCallId?: string;
  toolName: string;
  args: Record<string, unknown>;
};

type WriteCall = {
  toolName: string;
  args: Record<string, unknown>;
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

function updateRelationshipPromptForObject(
  object: SceneObject,
  liveScene: SceneObject[],
  force = false,
) {
  if (
    !force &&
    !object.parentId &&
    !object.partRole &&
    !object.relationshipPrompt
  ) {
    return;
  }

  const parent = object.parentId
    ? liveScene.find((candidate) => candidate.id === object.parentId)
    : undefined;
  object.relationshipPrompt = buildRelationshipPrompt(object, parent);
}

function getReferenceImageBytes(referenceImage: ReferenceImage): Uint8Array {
  const base64Payload = referenceImage.dataUrl.split(",")[1];
  if (!base64Payload) {
    throw new Error("Reference image data is invalid.");
  }

  return new Uint8Array(Buffer.from(base64Payload, "base64"));
}

function buildSelectedObjects(
  liveScene: SceneObject[],
  selectedObjectIds: string[],
) {
  const sceneById = new Map(liveScene.map((object) => [object.id, object]));
  return selectedObjectIds
    .map((id) => sceneById.get(id))
    .filter((object): object is SceneObject => Boolean(object));
}

function buildSelectionContext(
  selectedObjectIds: string[],
  selectedObjects: SceneObject[],
): string {
  if (selectedObjects.length === 0) {
    return "Selection context: no scene objects are currently selected.";
  }

  return `Selection context:
- selectedObjectIds, primary first: ${JSON.stringify(selectedObjectIds)}
- selectedObjects: ${JSON.stringify(
    selectedObjects.map((object) => ({
      id: object.id,
      name: object.name,
      geometry: object.geometry,
      geometryKind: object.geometryKind,
      sourceKind: object.sourceKind,
      parentId: object.parentId,
      partRole: object.partRole,
      relationshipPrompt: object.relationshipPrompt,
      materialColor: object.materialColor,
      px: object.px,
      py: object.py,
      pz: object.pz,
      sx: object.sx,
      sy: object.sy,
      sz: object.sz,
      worldAnchors: object.worldAnchors,
      generatedPrompt: object.generatedPrompt,
      compileStatus: object.compileStatus,
      compileError: object.compileError,
    })),
  )}`;
}

function buildOpenScadMessages(
  prompt: string,
  referenceImage?: ReferenceImage,
): ModelMessage[] | undefined {
  if (!referenceImage) return undefined;

  return [
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        {
          type: "image",
          image: getReferenceImageBytes(referenceImage),
          mediaType: referenceImage.mediaType,
        },
      ],
    },
  ];
}

function buildFallbackOpenScadBrief(task: OpenScadGenerationTask): string {
  const taskText =
    task.toolName === "edit_openscad_object"
      ? `Edit request: ${task.editPrompt}`
      : `Generation request: ${task.prompt}`;

  return `${taskText}

Use the user request as the source of truth. Build a compact, parameterized, manifold OpenSCAD object centered on the footprint origin with its base on z=0. Prefer simple reliable CSG, real overlapping connections, positive wall/detail thickness, and smooth high-$fn curves where the requested form has round features. If a reference image is attached, match its visible proportions and silhouette.`;
}

function stripOpenScadFences(code: string): string {
  return code
    .replace(/^```(?:openscad)?\s*/i, "")
    .replace(/```$/, "")
    .trim();
}

function scoreOpenScadCode(code: string): number {
  if (!code || code.length < 20) return 0;

  const patterns = [
    /\b(cube|sphere|cylinder|polyhedron)\s*\(/gi,
    /\b(union|difference|intersection)\s*\(\s*\)/gi,
    /\b(translate|rotate|scale|mirror)\s*\(/gi,
    /\b(linear_extrude|rotate_extrude)\s*\(/gi,
    /\b(module|function)\s+\w+\s*\(/gi,
    /\$fn\s*=/gi,
    /\bfor\s*\(/gi,
    /^\s*[A-Za-z_]\w*\s*=\s*[^;]+;/gm,
    /;\s*$/gm,
  ];

  return patterns.reduce((score, pattern) => {
    const matches = code.match(pattern);
    return score + (matches?.length ?? 0);
  }, 0);
}

function shouldRepairOpenScadCode(code: string): boolean {
  return code === "404" || scoreOpenScadCode(code) < 3;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatOpenScadParameterValue(
  existingValue: string,
  requestedValue: string,
): string {
  const trimmed = requestedValue.trim().replace(/;.*$/s, "");
  const existing = existingValue.trim();

  if (/^["']/.test(existing)) {
    return `"${trimmed.replace(/"/g, '\\"')}"`;
  }

  if (/^(true|false)$/i.test(existing)) {
    return /^(true|1|yes)$/i.test(trimmed) ? "true" : "false";
  }

  if (/^-?\d+(?:\.\d+)?$/.test(existing)) {
    const numericValue = Number(trimmed);
    if (Number.isFinite(numericValue)) return String(numericValue);
  }

  if (/^-?\d+(?:\.\d+)?$/.test(trimmed) || /^(true|false)$/i.test(trimmed)) {
    return trimmed;
  }

  if (/^\[[\d\s,.\-+*/()]+\]$/.test(trimmed)) return trimmed;

  return existing;
}

function applyOpenScadParameterUpdates(
  code: string,
  updates: Array<{ name: string; value: string }>,
): { code: string; applied: string[] } {
  let patchedCode = code;
  const applied: string[] = [];

  for (const update of updates) {
    const name = update.name.trim();
    if (!/^[A-Za-z_]\w*$/.test(name)) continue;

    const declaration = new RegExp(
      `^(\\s*${escapeRegExp(name)}\\s*=\\s*)([^;]+)(;.*)$`,
      "m",
    );

    patchedCode = patchedCode.replace(
      declaration,
      (fullMatch, prefix: string, existingValue: string, suffix: string) => {
        const nextValue = formatOpenScadParameterValue(
          existingValue,
          update.value,
        );
        if (nextValue === existingValue.trim()) return fullMatch;

        applied.push(name);
        return `${prefix}${nextValue}${suffix}`;
      },
    );
  }

  return { code: patchedCode, applied };
}

async function generateOpenScadCode(
  model: string,
  provider: ReturnType<typeof createOpenAI>,
  prompt: string,
  planningBrief: string,
  referenceImage?: ReferenceImage,
): Promise<string> {
  const codePrompt = `${prompt}

OpenSCAD generation brief from the planning pass:
${planningBrief}`;
  const codeMessages = buildOpenScadMessages(codePrompt, referenceImage);
  const result = await generateText({
    model: provider(model),
    system: referenceImage
      ? `${OPENSCAD_CODE_PROMPT}

${OPENSCAD_REFERENCE_IMAGE_RULES}`
      : OPENSCAD_CODE_PROMPT,
    ...(codeMessages ? { messages: codeMessages } : { prompt: codePrompt }),
    maxOutputTokens: OPENSCAD_CODE_MAX_OUTPUT_TOKENS,
    temperature: 0.2,
    providerOptions: OPENSCAD_CODE_PROVIDER_OPTIONS,
  });

  const code = stripOpenScadFences(result.text);
  if (!shouldRepairOpenScadCode(code)) return code;

  return repairOpenScadCode(model, provider, {
    prompt,
    planningBrief,
    code,
    referenceImage,
  });
}

async function repairOpenScadCode(
  model: string,
  provider: ReturnType<typeof createOpenAI>,
  {
    prompt,
    planningBrief,
    code,
    referenceImage,
    error,
  }: {
    prompt: string;
    planningBrief: string;
    code: string;
    referenceImage?: ReferenceImage;
    error?: string;
  },
): Promise<string> {
  const repairPrompt = `${prompt}

Planning brief:
${planningBrief}

${error ? `OpenSCAD error to fix:\n${error}\n\n` : ""}Code to repair:
${code}`;
  const repairMessages = buildOpenScadMessages(repairPrompt, referenceImage);
  const repairResult = await generateText({
    model: provider(model),
    system: referenceImage
      ? `${OPENSCAD_REPAIR_PROMPT}

${OPENSCAD_REFERENCE_IMAGE_RULES}`
      : OPENSCAD_REPAIR_PROMPT,
    ...(repairMessages ? { messages: repairMessages } : { prompt: repairPrompt }),
    maxOutputTokens: OPENSCAD_CODE_MAX_OUTPUT_TOKENS,
    temperature: 0.1,
    providerOptions: OPENSCAD_CODE_PROVIDER_OPTIONS,
  });

  return stripOpenScadFences(repairResult.text);
}

async function thinkThroughOpenScadGeneration(
  model: string,
  provider: ReturnType<typeof createOpenAI>,
  prompt: string,
  referenceImage?: ReferenceImage,
): Promise<string> {
  const thinkingMessages = buildOpenScadMessages(prompt, referenceImage);
  const result = await generateText({
    model: provider(model),
    system: referenceImage
      ? `${OPENSCAD_THINKING_PROMPT}

${OPENSCAD_REFERENCE_IMAGE_RULES}`
      : OPENSCAD_THINKING_PROMPT,
    ...(thinkingMessages ? { messages: thinkingMessages } : { prompt }),
    maxOutputTokens: OPENSCAD_THINKING_MAX_OUTPUT_TOKENS,
    temperature: 0.2,
    providerOptions: OPENSCAD_THINKING_PROVIDER_OPTIONS,
  });

  return result.text.trim();
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

Use the attached reference image as the concrete visual specification for the object's visible form. Match the primary requested object; do not create a generic version of the requested noun.
Ignore background clutter, shadows, reflections, support surfaces, watermarks, labels, compression noise, stray edge fragments, floating specks, detached islands, accidental blobs, halos, and ambiguous side protrusions unless the user explicitly says they are part of the object.`;
}

function buildOpenScadPartPrompt({
  prompt,
  partRole,
  parentId,
}: {
  prompt: string;
  partRole?: string;
  parentId?: string;
}): string {
  if (!partRole && !parentId) return prompt;

  return `Generate only one editable child part for a multi-part scene assembly.

Part role: ${partRole ?? "child part"}
Assembly parent ID: ${parentId ?? "unknown"}

Part requirements:
${prompt}

Return a standalone OpenSCAD model for only this part. Keep it centered on its own footprint origin with its base on z=0. Do not include the whole assembly or neighboring parts; placement in the assembly is handled by the scene transform.`;
}

function buildOpenScadEditPrompt({
  target,
  editPrompt,
  referenceImage,
}: {
  target: SceneObject;
  editPrompt: string;
  referenceImage?: ReferenceImage;
}): string {
  const currentCode = target.openscadCode?.trim();
  const existingModelContext = currentCode
    ? `Current OpenSCAD code:
${currentCode}`
    : `The selected object is currently a ${target.geometry} primitive. Replace it with an OpenSCAD object that satisfies the requested edit while preserving the user's intent.`;
  const compileErrorContext =
    target.compileStatus === "error" && target.compileError
      ? `Current OpenSCAD compile error to fix while applying the edit:
${target.compileError}`
      : "";

  return buildOpenScadUserPrompt(
    `Edit the existing selected scene object in place.

Target object:
${JSON.stringify(
  {
    id: target.id,
    name: target.name,
    geometry: target.geometry,
    geometryKind: target.geometryKind,
    parentId: target.parentId,
    partRole: target.partRole,
    generatedPrompt: target.generatedPrompt,
    relationshipPrompt: target.relationshipPrompt,
    localBounds: target.localBounds,
    worldBounds: target.worldBounds,
    compileStatus: target.compileStatus,
    compileError: target.compileError,
  },
  null,
  2,
)}

Requested edit:
${editPrompt}

${existingModelContext}

${compileErrorContext}

Return a complete replacement OpenSCAD model for this same object. Keep the object upright, standing on z=0, and centered around the footprint origin so the current scene transform still places it correctly.`,
    referenceImage,
  );
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

Attached reference image: use this image as visual context for the requested object. Ignore background clutter, shadows, reflections, labels, noise, and stray fragments.`,
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

function attachGeneratedOpenScadCode(
  writeCalls: QueuedWriteCall[],
  generatedOpenScad: GeneratedOpenScadCode[],
): WriteCall[] {
  const generatedByToolCallId = new Map(
    generatedOpenScad.map((result) => [result.toolCallId, result]),
  );

  return writeCalls.flatMap((call) => {
    if (
      call.toolName !== "generate_openscad_object" &&
      call.toolName !== "edit_openscad_object"
    ) {
      return [{ toolName: call.toolName, args: call.args }];
    }

    const generated = call.toolCallId
      ? generatedByToolCallId.get(call.toolCallId)
      : undefined;

    if (!generated) {
      if (call.args.ok === false) return [];
      throw new Error(`Missing OpenSCAD generation for ${call.toolName}.`);
    }

    return [
      {
        toolName: call.toolName,
        args: {
          ...call.args,
          openscadCode: generated.openscadCode,
        },
      },
    ];
  });
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
    const {
      jobId,
      messages,
      model,
      sceneContext,
      userId,
      referenceImage,
      selectedObjectIds = [],
    } = event.data as {
      jobId: string;
      messages: InputMessage[];
      model: string;
      sceneContext: SceneObject[];
      userId: string;
      referenceImage?: ReferenceImage;
      selectedObjectIds?: string[];
    };

    const thinkingResult = await step.run("think", async () => {
      const provider = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const modelMessages = attachReferenceImageToLatestUserMessage(
        messages,
        referenceImage,
      );

      // Mutable scene state so list_objects reflects additions/deletions mid-conversation
      const liveScene: SceneObject[] = sceneContext.map((o) => ({ ...o }));
      refreshSceneBoundsContext(liveScene);
      const selectedObjects = buildSelectedObjects(
        liveScene,
        selectedObjectIds,
      );
      const selectionContext = buildSelectionContext(
        selectedObjectIds,
        selectedObjects,
      );
      const pendingOpenScadGenerations: OpenScadGenerationTask[] = [];

      const aiResult = await generateText({
        model: provider(model),
        system: `${SYSTEM_PROMPT}

${SELECTION_RULES}

${OPENSCAD_WORKFLOW_RULES}

${selectionContext}${referenceImage ? `

${SCENE_REFERENCE_IMAGE_RULES}` : ""}`,
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
            execute: async () => ({
              selectedObjectIds,
              objects: liveScene,
            }),
          }),
          list_selected_objects: tool({
            description:
              "List the currently selected scene objects. The first selectedObjectId is the primary selection.",
            inputSchema: jsonSchema({
              type: "object" as const,
              properties: {},
              additionalProperties: false,
            }),
            execute: async () => ({
              selectedObjectIds,
              objects: buildSelectedObjects(liveScene, selectedObjectIds),
            }),
          }),
          create_group: tool({
            description:
              "Create a non-rendered scene group/assembly container. Use this before generating separate editable OpenSCAD child parts for one logical multi-part object.",
            inputSchema: jsonSchema({
              type: "object" as const,
              properties: {
                name: { type: "string" },
                parentId: { type: "string" },
                partRole: { type: "string" },
                relationshipPrompt: { type: "string" },
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
              required: ["name"],
            }),
            execute: async (input) => {
              const payload = input as {
                name: string;
                parentId?: string;
                partRole?: string;
                relationshipPrompt?: string;
                px?: number;
                py?: number;
                pz?: number;
                rx?: number;
                ry?: number;
                rz?: number;
                sx?: number;
                sy?: number;
                sz?: number;
              };
              const id = crypto.randomUUID();
              const group: SceneObject = {
                id,
                type: "group",
                geometry: "group",
                geometryKind: "group",
                name: payload.name,
                parentId: payload.parentId,
                partRole: payload.partRole,
                relationshipPrompt: payload.relationshipPrompt,
                px: payload.px ?? 0,
                py: payload.py ?? 0,
                pz: payload.pz ?? 0,
                rx: payload.rx ?? 0,
                ry: payload.ry ?? 0,
                rz: payload.rz ?? 0,
                sx: payload.sx ?? 1,
                sy: payload.sy ?? 1,
                sz: payload.sz ?? 1,
              };
              liveScene.push(group);
              updateRelationshipPromptForObject(group, liveScene);
              refreshSceneBoundsContext(liveScene);
              return {
                ok: true,
                id,
                name: group.name,
                geometry: "group",
                geometryKind: "group",
                parentId: group.parentId,
                partRole: group.partRole,
                relationshipPrompt: group.relationshipPrompt,
                px: group.px,
                py: group.py,
                pz: group.pz,
                rx: group.rx,
                ry: group.ry,
                rz: group.rz,
                sx: group.sx,
                sy: group.sy,
                sz: group.sz,
              };
            },
          }),
          generate_openscad_object: tool({
            description:
              "Generate a new OpenSCAD-backed object for the scene. Use this when the user asks to create a model or an editable child part of a multi-part model.",
            inputSchema: jsonSchema({
              type: "object" as const,
              properties: {
                prompt: { type: "string" },
                name: { type: "string" },
                parentId: { type: "string" },
                partRole: { type: "string" },
                relationshipPrompt: { type: "string" },
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
              required: ["prompt"],
            }),
            execute: async (input, { toolCallId }) => {
              const {
                prompt,
                name,
                parentId,
                partRole,
                relationshipPrompt,
                px,
                py,
                pz,
                rx,
                ry,
                rz,
                sx,
                sy,
                sz,
              } = input as {
                prompt: string;
                name?: string;
                parentId?: string;
                partRole?: string;
                relationshipPrompt?: string;
                px?: number;
                py?: number;
                pz?: number;
                rx?: number;
                ry?: number;
                rz?: number;
                sx?: number;
                sy?: number;
                sz?: number;
              };
              const partScopedPrompt = buildOpenScadPartPrompt({
                prompt,
                partRole,
                parentId,
              });
              const codePrompt = buildOpenScadUserPrompt(
                partScopedPrompt,
                referenceImage,
              );
              const generatedPrompt = buildGeneratedPromptForStorage(
                prompt,
                referenceImage,
              );
              const id = crypto.randomUUID();
              const resolvedName = name ?? "Generated Object";
              pendingOpenScadGenerations.push({
                toolCallId,
                toolName: "generate_openscad_object",
                objectId: id,
                name: resolvedName,
                prompt,
                codePrompt,
                generatedPrompt,
              });
              liveScene.push({
                id,
                geometry: "generated",
                geometryKind: "generated",
                sourceKind: "openscad",
                name: resolvedName,
                parentId,
                partRole,
                relationshipPrompt,
                px: px ?? 0,
                py: py ?? 0,
                pz: pz ?? 0,
                rx: rx ?? 0,
                ry: ry ?? 0,
                rz: rz ?? 0,
                sx: sx ?? 1,
                sy: sy ?? 1,
                sz: sz ?? 1,
                localBounds: GENERATED_OBJECT_BOUNDS_ESTIMATE,
                generatedPrompt,
              });
              const createdObject = liveScene.find((object) => object.id === id);
              if (createdObject) {
                updateRelationshipPromptForObject(createdObject, liveScene);
              }
              refreshSceneBoundsContext(liveScene);
              return {
                ok: true,
                id,
                name: resolvedName,
                geometry: "generated",
                geometryKind: "generated",
                sourceKind: "openscad",
                parentId,
                partRole,
                relationshipPrompt: createdObject?.relationshipPrompt,
                px: px ?? 0,
                py: py ?? 0,
                pz: pz ?? 0,
                rx: rx ?? 0,
                ry: ry ?? 0,
                rz: rz ?? 0,
                sx: sx ?? 1,
                sy: sy ?? 1,
                sz: sz ?? 1,
                generatedPrompt,
              };
            },
          }),
          edit_openscad_object: tool({
            description:
              "Replace an existing scene object's shape with new OpenSCAD code. Use this for shape/form/detail edits to a selected or named object. Keeps the same object ID and scene transform.",
            inputSchema: jsonSchema({
              type: "object" as const,
              properties: {
                objectId: { type: "string" },
                editPrompt: {
                  type: "string",
                  description:
                    "The requested visual/geometry edit. Include all important retained features.",
                },
                name: {
                  type: "string",
                  description: "Optional new object name.",
                },
                partRole: {
                  type: "string",
                  description: "Optional logical part role for editable parts.",
                },
                relationshipPrompt: {
                  type: "string",
                  description:
                    "Optional position relationship context for future edits.",
                },
              },
              required: ["objectId", "editPrompt"],
            }),
            execute: async (input, { toolCallId }) => {
              const { objectId, editPrompt, name, partRole, relationshipPrompt } = input as {
                objectId: string;
                editPrompt: string;
                name?: string;
                partRole?: string;
                relationshipPrompt?: string;
              };
              const target = liveScene.find((object) => object.id === objectId);
              if (!target) {
                return { ok: false, error: "Object not found", objectId };
              }

              const codePrompt = buildOpenScadEditPrompt({
                target,
                editPrompt,
                referenceImage,
              });
              const generatedPrompt = buildGeneratedPromptForStorage(
                `Edit ${target.name}: ${editPrompt}`,
                referenceImage,
              );
              const resolvedName = name ?? target.name;
              pendingOpenScadGenerations.push({
                toolCallId,
                toolName: "edit_openscad_object",
                objectId,
                name: resolvedName,
                editPrompt,
                codePrompt,
                generatedPrompt,
              });

              Object.assign(target, {
                name: resolvedName,
                geometry: "generated",
                geometryKind: "generated" as const,
                sourceKind: "openscad" as const,
                partRole: partRole ?? target.partRole,
                relationshipPrompt:
                  relationshipPrompt ?? target.relationshipPrompt,
                generatedPrompt,
                localBounds: GENERATED_OBJECT_BOUNDS_ESTIMATE,
              });
              updateRelationshipPromptForObject(target, liveScene);
              refreshSceneBoundsContext(liveScene);

              return {
                ok: true,
                objectId,
                name: resolvedName,
                geometry: "generated",
                geometryKind: "generated",
                sourceKind: "openscad",
                partRole: target.partRole,
                relationshipPrompt: target.relationshipPrompt,
                generatedPrompt,
              };
            },
          }),
          update_openscad_parameters: tool({
            description:
              "Patch top-level OpenSCAD parameter assignments on an existing generated object without regenerating its geometry. Use for simple changes like setting height, width, radius, thickness, hole diameter, hole count, or spacing.",
            inputSchema: jsonSchema({
              type: "object" as const,
              properties: {
                objectId: { type: "string" },
                updates: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      value: { type: "string" },
                    },
                    required: ["name", "value"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["objectId", "updates"],
            }),
            execute: async (input) => {
              const { objectId, updates } = input as {
                objectId: string;
                updates: Array<{ name: string; value: string }>;
              };
              const target = liveScene.find((object) => object.id === objectId);
              if (!target?.openscadCode) {
                return {
                  ok: false,
                  error: "Generated OpenSCAD object not found",
                  objectId,
                };
              }

              const patch = applyOpenScadParameterUpdates(
                target.openscadCode,
                updates,
              );

              if (patch.applied.length === 0) {
                return {
                  ok: false,
                  error: "No matching top-level parameters found",
                  objectId,
                };
              }

              target.openscadCode = patch.code;
              target.generatedPrompt = buildGeneratedPromptForStorage(
                `Update ${target.name} parameters: ${patch.applied.join(", ")}`,
                referenceImage,
              );
              target.localBounds = GENERATED_OBJECT_BOUNDS_ESTIMATE;
              target.compileStatus = "idle";
              target.compileError = undefined;
              refreshSceneBoundsContext(liveScene);

              return {
                ok: true,
                objectId,
                name: target.name,
                openscadCode: patch.code,
                generatedPrompt: target.generatedPrompt,
                applied: patch.applied,
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
                relationshipPrompt: {
                  type: "string",
                  description:
                    "Optional detailed logical description of the object's new position relative to its parent/assembly.",
                },
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
                if (typeof payload.relationshipPrompt !== "string") {
                  updateRelationshipPromptForObject(target, liveScene);
                }
              }
              return {
                ok: true,
                ...payload,
                relationshipPrompt: target?.relationshipPrompt,
              };
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

      const writeCalls: QueuedWriteCall[] = [];
      for (const s of aiResult.steps) {
        for (const tc of s.toolCalls) {
          if (
            tc.toolName === "list_objects" ||
            tc.toolName === "list_selected_objects"
          ) {
            continue;
          }
          const input = (tc as unknown as { input: unknown }).input as Record<
            string,
            unknown
          >;
          const result = s.toolResults?.find(
            (tr) => tr.toolCallId === tc.toolCallId,
          );
          const output = result
            ? (result as unknown as { output: Record<string, unknown> }).output
            : {};

          if (
            tc.toolName === "generate_openscad_object" ||
            tc.toolName === "edit_openscad_object" ||
            tc.toolName === "update_openscad_parameters"
          ) {
            writeCalls.push({
              toolCallId: tc.toolCallId,
              toolName: tc.toolName,
              args: { ...input, ...output },
            });
          } else {
            writeCalls.push({ toolName: tc.toolName, args: { ...input, ...output } });
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
        pendingOpenScadGenerations,
      };
    });

    const openScadThinking = await step.run("think-openscad", async () => {
      if (thinkingResult.pendingOpenScadGenerations.length === 0) {
        return [] satisfies OpenScadThinkingResult[];
      }

      const provider = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
      return Promise.all(
        thinkingResult.pendingOpenScadGenerations.map(async (task) => {
          const brief = await thinkThroughOpenScadGeneration(
            model,
            provider,
            task.codePrompt,
            referenceImage,
          );

          return {
            toolCallId: task.toolCallId,
            brief: brief || buildFallbackOpenScadBrief(task),
            usedFallback: !brief,
          };
        }),
      );
    });

    const generatedOpenScad = await step.run("generate-openscad", async () => {
      if (thinkingResult.pendingOpenScadGenerations.length === 0) {
        return [] satisfies GeneratedOpenScadCode[];
      }

      const thinkingByToolCallId = new Map(
        openScadThinking.map((result) => [result.toolCallId, result]),
      );
      const provider = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
      return Promise.all(
        thinkingResult.pendingOpenScadGenerations.map(async (task) => {
          const thinking = thinkingByToolCallId.get(task.toolCallId);
          if (!thinking) {
            throw new Error(`Missing OpenSCAD thinking for ${task.name}.`);
          }

          const openscadCode = await generateOpenScadCode(
            model,
            provider,
            task.codePrompt,
            thinking.brief,
            referenceImage,
          );

          if (!openscadCode) {
            throw new Error(
              `OpenSCAD generation returned empty code for ${task.name}.`,
            );
          }

          return {
            toolCallId: task.toolCallId,
            openscadCode,
          };
        }),
      );
    });

    const result = {
      ...thinkingResult,
      writeCalls: attachGeneratedOpenScadCode(
        thinkingResult.writeCalls,
        generatedOpenScad,
      ),
    };

    await step.run("persist", async () => {
      logger.info("AI generation complete", {
        jobId,
        model,
        userId,
        totalSteps: result.totalSteps,
        writeCallCount: result.writeCalls.length,
        openScadThinkingCount: openScadThinking.length,
        openScadThinkingFallbackCount: openScadThinking.filter(
          (item) => item.usedFallback,
        ).length,
        openScadGenerationCount: generatedOpenScad.length,
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
