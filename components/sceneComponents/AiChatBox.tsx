"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import * as Y from "yjs";
import * as Sentry from "@sentry/nextjs";
import { Bot, ImagePlus, SendHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useYjs } from "@/lib/yjs/provider";
import {
  useYjsAddObject,
  useYjsAddGeneratedObject,
  useYjsAddGroupObject,
  useYjsDeleteObject,
  useYjsRenameObject,
  useYjsDuplicateObject,
  useYjsObjects,
} from "@/lib/yjs/hooks";
import { SHAPES } from "@/lib/yjs/types";
import { computeWorldBoundsMap } from "@/lib/scene/bounds";
import { buildRelationshipPrompt } from "@/lib/scene/relationship-prompt";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Message = {
  role: "user" | "assistant";
  content: string;
  referenceImageName?: string;
  referenceImagePreview?: string;
};

type ToolCall = {
  toolName: string;
  args: Record<string, unknown>;
};

type ReferenceImage = {
  dataUrl: string;
  mediaType: "image/png" | "image/jpeg" | "image/webp";
  name?: string;
};

const PORTAL_AI_MODEL = "gpt-5.4";

const IMAGE_ONLY_PROMPT =
  "Create an OpenSCAD object from the attached reference image.";

const REFERENCE_IMAGE_MAX_EDGE = 1024;
const REFERENCE_IMAGE_MAX_DATA_URL_BYTES = 3 * 1024 * 1024;
const REFERENCE_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

function isReferenceImageType(
  mediaType: string,
): mediaType is ReferenceImage["mediaType"] {
  return REFERENCE_IMAGE_TYPES.includes(mediaType);
}

function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Failed to read image."));
    };
    reader.onerror = () => reject(new Error("Failed to read image."));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image."));
    image.src = dataUrl;
  });
}

async function resizeReferenceImage(file: File): Promise<ReferenceImage> {
  if (!isReferenceImageType(file.type)) {
    throw new Error("Reference image must be a PNG, JPEG, or WebP.");
  }

  const originalDataUrl = await readImageFileAsDataUrl(file);
  const image = await loadImage(originalDataUrl);
  const scale = Math.min(
    1,
    REFERENCE_IMAGE_MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight),
  );
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Failed to prepare image.");

  context.drawImage(image, 0, 0, width, height);

  const outputType = file.type === "image/png" ? "image/png" : file.type;
  const dataUrl = canvas.toDataURL(outputType, 0.86);
  if (dataUrl.length > REFERENCE_IMAGE_MAX_DATA_URL_BYTES) {
    throw new Error("Reference image is too large. Try a smaller image.");
  }

  return { dataUrl, mediaType: outputType, name: file.name };
}

function readRelationshipObject(objMap: Y.Map<unknown>) {
  return {
    name: objMap.get("name") as string | undefined,
    partRole: objMap.get("partRole") as string | undefined,
    parentId: objMap.get("parentId") as string | undefined,
    px: (objMap.get("px") as number | undefined) ?? 0,
    py: (objMap.get("py") as number | undefined) ?? 0,
    pz: (objMap.get("pz") as number | undefined) ?? 0,
    rx: (objMap.get("rx") as number | undefined) ?? 0,
    ry: (objMap.get("ry") as number | undefined) ?? 0,
    rz: (objMap.get("rz") as number | undefined) ?? 0,
    sx: (objMap.get("sx") as number | undefined) ?? 1,
    sy: (objMap.get("sy") as number | undefined) ?? 1,
    sz: (objMap.get("sz") as number | undefined) ?? 1,
  };
}

function updateRelationshipPrompt(
  objMap: Y.Map<unknown>,
  objectsMap: Y.Map<Y.Map<unknown>>,
) {
  if (
    !objMap.get("parentId") &&
    !objMap.get("partRole") &&
    !objMap.get("relationshipPrompt")
  ) {
    return;
  }

  const object = readRelationshipObject(objMap);
  const parentMap = object.parentId
    ? objectsMap.get(object.parentId)
    : undefined;
  objMap.set(
    "relationshipPrompt",
    buildRelationshipPrompt(
      object,
      parentMap ? readRelationshipObject(parentMap) : undefined,
    ),
  );
}

// ---------------------------------------------------------------------------
// AiChatBox
// ---------------------------------------------------------------------------

export function AiChatBox({
  sceneId,
  collapsed,
  onCollapse,
  selectedIds,
  primaryId,
}: {
  sceneId: string;
  collapsed: boolean;
  onCollapse: (v: boolean) => void;
  selectedIds: Set<string>;
  primaryId: string | null;
}) {
  const { doc, sceneMap, connected } = useYjs();
  const objects = useYjsObjects();
  const addObject = useYjsAddObject();
  const addGeneratedObject = useYjsAddGeneratedObject();
  const addGroupObject = useYjsAddGroupObject();
  const deleteObject = useYjsDeleteObject();
  const renameObject = useYjsRenameObject();
  const duplicateObject = useYjsDuplicateObject();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [referenceImage, setReferenceImage] = useState<ReferenceImage | null>(
    null,
  );
  const [isPreparingImage, setIsPreparingImage] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const activePollRequestRef = useRef(false);
  const completedJobIdsRef = useRef<Set<string>>(new Set());

  const selectedObjectIds = useMemo(() => {
    const ids = [...selectedIds];
    if (!primaryId || !selectedIds.has(primaryId)) return ids;

    return [primaryId, ...ids.filter((id) => id !== primaryId)];
  }, [primaryId, selectedIds]);

  const selectedObjects = useMemo(() => {
    const objectMap = new Map(objects.map((object) => [object.id, object]));
    return selectedObjectIds
      .map((id) => objectMap.get(id))
      .filter((object) => object !== undefined);
  }, [objects, selectedObjectIds]);

  const resizeTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    resizeTextarea();
  }, [input, resizeTextarea]);

  useEffect(() => {
    setMessages([]);
    setInput("");
    setReferenceImage(null);
    setJobId(null);
    setIsLoading(false);
    setError(null);
    completedJobIdsRef.current.clear();
    activePollRequestRef.current = false;
  }, [sceneId]);

  // ---------------------------------------------------------------------------
  // Execute a tool call against YJS
  // ---------------------------------------------------------------------------

  const executeToolCall = useCallback(
    (tc: ToolCall) => {
      const { toolName, args } = tc;

      switch (toolName) {
        case "add_object": {
          const geometry = args.geometry as string;
          const name =
            (args.name as string | undefined) ??
            SHAPES.find((s) => s.geometry === geometry)?.defaultName ??
            "Object";
          const presetId = args.id as string | undefined;
          addObject(geometry, name, presetId);
          break;
        }
        case "generate_openscad_object": {
          const name = (args.name as string | undefined) ?? "Generated Object";
          const presetId = args.id as string | undefined;
          const openscadCode = args.openscadCode as string;
          const generatedPrompt =
            (args.generatedPrompt as string | undefined) ?? name;
          addGeneratedObject(name, openscadCode, generatedPrompt, presetId, {
            parentId: args.parentId as string | undefined,
            partRole: args.partRole as string | undefined,
            relationshipPrompt: args.relationshipPrompt as string | undefined,
            px: args.px as number | undefined,
            py: args.py as number | undefined,
            pz: args.pz as number | undefined,
            rx: args.rx as number | undefined,
            ry: args.ry as number | undefined,
            rz: args.rz as number | undefined,
            sx: args.sx as number | undefined,
            sy: args.sy as number | undefined,
            sz: args.sz as number | undefined,
          });
          break;
        }
        case "create_group": {
          const name = (args.name as string | undefined) ?? "Group";
          const presetId = args.id as string | undefined;
          addGroupObject(name, presetId, {
            parentId: args.parentId as string | undefined,
            partRole: args.partRole as string | undefined,
            relationshipPrompt: args.relationshipPrompt as string | undefined,
            px: args.px as number | undefined,
            py: args.py as number | undefined,
            pz: args.pz as number | undefined,
            rx: args.rx as number | undefined,
            ry: args.ry as number | undefined,
            rz: args.rz as number | undefined,
            sx: args.sx as number | undefined,
            sy: args.sy as number | undefined,
            sz: args.sz as number | undefined,
          });
          break;
        }
        case "edit_openscad_object":
        case "update_openscad_parameters": {
          if (!connected) break;
          const objectsMap = sceneMap.get("objects") as
            | Y.Map<Y.Map<unknown>>
            | undefined;
          const objMap = objectsMap?.get(args.objectId as string);
          const openscadCode = args.openscadCode as string | undefined;
          if (!objMap || !openscadCode) break;

          const currentGeometryRevision =
            (objMap.get("geometryRevision") as number | undefined) ?? 1;
          const currentBoundsVersion =
            (objMap.get("boundsVersion") as number | undefined) ?? 1;
          const generatedPrompt =
            (args.generatedPrompt as string | undefined) ??
            (args.editPrompt as string | undefined) ??
            (objMap.get("generatedPrompt") as string | undefined) ??
            (objMap.get("name") as string | undefined) ??
            "Edited object";

          doc.transact(() => {
            objMap.set("geometry", "generated");
            objMap.set("geometryKind", "generated");
            objMap.set("sourceKind", "openscad");
            objMap.set("openscadCode", openscadCode);
            objMap.set("generatedPrompt", generatedPrompt);
            if (typeof args.partRole === "string" && args.partRole.trim()) {
              objMap.set("partRole", args.partRole.trim());
            }
            if (
              typeof args.relationshipPrompt === "string" &&
              args.relationshipPrompt.trim()
            ) {
              objMap.set("relationshipPrompt", args.relationshipPrompt.trim());
            }
            objMap.set("geometryRevision", currentGeometryRevision + 1);
            objMap.set("boundsVersion", currentBoundsVersion + 1);
            objMap.set("compileStatus", "idle");
            objMap.delete("compileError");
            objMap.delete("localBounds");
            if (typeof args.name === "string" && args.name.trim()) {
              objMap.set("name", args.name.trim());
            }
          }, "local-ai");
          break;
        }
        case "delete_object": {
          deleteObject(args.objectId as string);
          break;
        }
        case "rename_object": {
          renameObject(args.objectId as string, args.newName as string);
          break;
        }
        case "update_transform": {
          if (!connected) break;
          const objectsMap = sceneMap.get("objects") as
            | Y.Map<Y.Map<unknown>>
            | undefined;
          const objMap = objectsMap?.get(args.objectId as string);
          if (!objMap) break;
          doc.transact(() => {
            const fields = [
              "px",
              "py",
              "pz",
              "rx",
              "ry",
              "rz",
              "sx",
              "sy",
              "sz",
            ] as const;
            for (const key of fields) {
              if (args[key] !== undefined) objMap.set(key, args[key]);
            }
            if (
              typeof args.relationshipPrompt === "string" &&
              args.relationshipPrompt.trim()
            ) {
              objMap.set("relationshipPrompt", args.relationshipPrompt.trim());
            } else if (objectsMap) {
              updateRelationshipPrompt(objMap, objectsMap);
            }
          }, "local-ai");
          break;
        }
        case "change_color": {
          if (!connected) break;
          const objectsMap = sceneMap.get("objects") as
            | Y.Map<Y.Map<unknown>>
            | undefined;
          const objMap = objectsMap?.get(args.objectId as string);
          if (!objMap) break;
          doc.transact(() => {
            objMap.set("materialColor", args.color as string);
          }, "local-ai");
          break;
        }
        case "duplicate_object": {
          duplicateObject(args.objectId as string);
          break;
        }
        default:
          break;
      }
    },
    [
      doc,
      sceneMap,
      connected,
      addObject,
      addGeneratedObject,
      addGroupObject,
      deleteObject,
      renameObject,
      duplicateObject,
    ],
  );

  // ---------------------------------------------------------------------------
  // Poll for job completion
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!jobId) return;

    activePollRequestRef.current = false;

    const intervalId = setInterval(async () => {
      if (activePollRequestRef.current || completedJobIdsRef.current.has(jobId))
        return;

      activePollRequestRef.current = true;

      try {
        const res = await fetch(`/api/chat/status?jobId=${jobId}`);
        const data = await res.json();

        if (data.status === "done") {
          if (completedJobIdsRef.current.has(jobId)) return;

          completedJobIdsRef.current.add(jobId);
          clearInterval(intervalId);
          const toolCalls = (data.toolCalls ?? []) as ToolCall[];
          for (const tc of toolCalls) {
            executeToolCall(tc);
          }
          const assistantText =
            data.text ||
            (toolCalls.length > 0
              ? toolCalls.map((tc) => `Called ${tc.toolName}`).join(", ") + "."
              : "Done.");
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: assistantText },
          ]);
          setIsLoading(false);
          setJobId(null);
        } else if (data.status === "error") {
          clearInterval(intervalId);
          const msg = data.error ?? "Something went wrong";
          setError(msg);
          setIsLoading(false);
          setJobId(null);
          Sentry.captureMessage(`AI job failed: ${msg}`, "error");
        }
      } catch (err) {
        clearInterval(intervalId);
        setError("Failed to poll job status");
        setIsLoading(false);
        setJobId(null);
        Sentry.captureException(err);
      } finally {
        activePollRequestRef.current = false;
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [jobId, executeToolCall]);

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  async function handleSubmit() {
    const text = input.trim();
    const submittedReferenceImage = referenceImage;
    if ((!text && !submittedReferenceImage) || isLoading || isPreparingImage)
      return;

    const userText = text || IMAGE_ONLY_PROMPT;

    setInput("");
    setReferenceImage(null);
    setError(null);
    setIsLoading(true);

    const newMessages: Message[] = [
      ...messages,
      {
        role: "user",
        content: userText,
        referenceImageName: submittedReferenceImage?.name ?? undefined,
        referenceImagePreview: submittedReferenceImage?.dataUrl ?? undefined,
      },
    ];
    setMessages(newMessages);

    try {
      const worldBoundsMap = computeWorldBoundsMap(objects);
      const res = await fetch("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          model: PORTAL_AI_MODEL,
          ...(submittedReferenceImage && {
            referenceImage: submittedReferenceImage,
          }),
          selectedObjectIds,
          sceneContext: objects.map((o) => {
            const worldSummary = worldBoundsMap.get(o.id);
            return {
              id: o.id,
              name: o.name,
              geometry: o.geometry,
              geometryKind: o.geometryKind,
              sourceKind: o.sourceKind,
              px: o.px,
              py: o.py,
              pz: o.pz,
              rx: o.rx,
              ry: o.ry,
              rz: o.rz,
              sx: o.sx,
              sy: o.sy,
              sz: o.sz,
              parentId: o.parentId,
              partRole: o.partRole,
              relationshipPrompt: o.relationshipPrompt,
              localBounds: o.localBounds,
              worldBounds: worldSummary?.bounds,
              worldAnchors: worldSummary?.anchors,
              materialColor: o.materialColor,
              openscadCode: o.openscadCode,
              generatedPrompt: o.generatedPrompt,
              compileStatus: o.compileStatus,
              compileError: o.compileError,
            };
          }),
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }

      const { jobId: newJobId } = await res.json();
      setJobId(newJobId);
    } catch (err) {
      setMessages(messages);
      setReferenceImage(submittedReferenceImage);
      const message =
        err instanceof Error ? err.message : "Failed to send message";
      setError(message);
      setIsLoading(false);
      Sentry.captureException(err);
    }
  }

  async function handleReferenceImageChange(
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setIsPreparingImage(true);
    setError(null);
    try {
      const resizedImage = await resizeReferenceImage(file);
      setReferenceImage(resizedImage);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to prepare image";
      setError(message);
      Sentry.captureException(err);
    } finally {
      setIsPreparingImage(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="h-full min-h-0 w-full bg-card border-l border-border flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-accent"
            onClick={() => onCollapse(!collapsed)}
          >
            <svg
              className={`w-4 h-4 transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13 5l7 7-7 7M5 5l7 7-7 7"
              />
            </svg>
          </Button>
          {!collapsed && (
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Assistant
            </span>
          )}
        </div>
        {!collapsed && (
          <span className="text-xs bg-neutral-800 border border-white/10 rounded px-2 py-1 text-neutral-300">
            Portal AI
          </span>
        )}
      </div>

      {!collapsed && (
        <>
          {/* Error banner */}
          {error && (
            <div className="mx-3 mt-2 px-3 py-2 rounded-md bg-red-950 border border-red-800 text-red-300 text-xs shrink-0">
              {error}
            </div>
          )}

          {/* Messages — fills remaining space */}
          <div className="scrollbar-subtle flex-1 min-h-0 min-w-0 flex flex-col gap-2 px-3 py-2 overflow-y-auto overscroll-contain">
            {messages.length === 0 && !isLoading && (
              <p className="text-xs text-neutral-600 py-2 text-center">
                Ask me to generate models, move them, rename them, or recolor them.
              </p>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`min-w-0 max-w-[85%] overflow-hidden whitespace-pre-wrap break-words rounded-lg px-3 py-1.5 text-xs leading-relaxed ${
                    msg.role === "user"
                      ? "bg-neutral-700 text-neutral-100"
                      : "bg-neutral-800 text-neutral-200"
                  }`}
                >
                  {msg.content}
                  {msg.referenceImagePreview && (
                    <div
                      aria-label="Attached reference image"
                      role="img"
                      className="mt-2 aspect-[4/3] w-full rounded-md bg-neutral-800 bg-cover bg-center"
                      style={{
                        backgroundImage: `url(${msg.referenceImagePreview})`,
                      }}
                    />
                  )}
                  {(msg.referenceImageName || msg.referenceImagePreview) && (
                    <div className="mt-1 flex items-center gap-1 border-t border-white/10 pt-1 text-[10px] text-neutral-400">
                      <ImagePlus className="h-3 w-3 shrink-0" />
                      <span className="truncate">
                        {msg.referenceImageName ?? "Reference image"}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-neutral-800 rounded-lg px-3 py-1.5 text-xs text-neutral-400 animate-pulse">
                  Thinking...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input row */}
          <div className="px-3 pb-3 pt-2 border-t border-border shrink-0">
            {selectedObjects.length > 0 && (
              <div className="mb-2 rounded-lg border border-white/10 bg-neutral-900 px-2 py-1.5">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">
                    Selected
                  </span>
                  {selectedObjects.length > 1 && (
                    <span className="text-[10px] text-neutral-500">
                      {selectedObjects.length} objects
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {selectedObjects.slice(0, 4).map((object) => (
                    <span
                      key={object.id}
                      title={object.id === primaryId ? "Primary selection" : undefined}
                      className={`max-w-full truncate rounded-md px-2 py-0.5 text-[11px] ${
                        object.id === primaryId
                          ? "bg-neutral-700 text-neutral-100"
                          : "bg-neutral-800 text-neutral-300"
                      }`}
                    >
                      {object.name}
                    </span>
                  ))}
                  {selectedObjects.length > 4 && (
                    <span className="rounded-md bg-neutral-800 px-2 py-0.5 text-[11px] text-neutral-400">
                      +{selectedObjects.length - 4} more
                    </span>
                  )}
                </div>
              </div>
            )}

            {referenceImage && (
              <div className="mb-2 flex items-center gap-2 rounded-lg border border-white/10 bg-neutral-900 p-2">
                <div
                  aria-label="Reference image"
                  role="img"
                  className="h-10 w-10 shrink-0 rounded-md bg-neutral-800 bg-cover bg-center"
                  style={{ backgroundImage: `url(${referenceImage.dataUrl})` }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-neutral-200">
                    {referenceImage.name ?? "Reference image"}
                  </p>
                  <p className="text-[10px] text-neutral-500">
                    OpenSCAD reference
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReferenceImage(null)}
                  disabled={isLoading}
                  className="rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-40"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            <div className="flex items-end gap-2">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleReferenceImageChange}
                disabled={isLoading || isPreparingImage}
              />
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={isLoading || isPreparingImage}
                className="shrink-0 p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-neutral-300"
              >
                <ImagePlus className="w-4 h-4" />
              </button>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                rows={1}
                placeholder={
                  isLoading
                    ? "AI is responding..."
                    : referenceImage
                      ? "Describe what to model from the image..."
                      : "Generate or edit CAD models..."
                }
                className="scrollbar-subtle flex-1 resize-none overflow-y-auto overscroll-contain bg-neutral-800 border border-white/10 rounded-lg px-3 py-2 text-xs text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-white/30 disabled:opacity-50 leading-relaxed"
                style={{ minHeight: "2.25rem", maxHeight: "10rem" }}
              />
              <button
                onClick={handleSubmit}
                disabled={
                  isLoading ||
                  isPreparingImage ||
                  (!input.trim() && !referenceImage)
                }
                className="shrink-0 p-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-neutral-200"
              >
                <SendHorizontal className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}

      {/* Collapsed icon */}
      {collapsed && (
        <div className="flex flex-col items-center gap-3 pt-3">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Bot className="w-4 h-4 text-primary" />
          </div>
        </div>
      )}
    </div>
  );
}
