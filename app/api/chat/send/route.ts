import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/inngest/client";
import { buildAiMessageLimitError, getAiMessageLimit } from "@/lib/ai/limits";
import * as Sentry from "@sentry/nextjs";

export const runtime = "nodejs";

const ALLOWED_MODELS = ["gpt-5.4", "gpt-5-nano", "gpt-5.4-nano", "gpt-5.4-mini"];
const ALLOWED_IMAGE_MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_REFERENCE_IMAGE_DATA_URL_BYTES = 3 * 1024 * 1024;

type ReferenceImage = {
  dataUrl: string;
  mediaType: string;
  name?: string;
};

function getInngestDebugContext() {
  return {
    hasEventKey: Boolean(process.env.INNGEST_EVENT_KEY),
    hasSigningKey: Boolean(process.env.INNGEST_SIGNING_KEY),
    inngestDev: process.env.INNGEST_DEV ? "set" : "unset",
    inngestEnv: process.env.INNGEST_ENV ?? null,
    nodeEnv: process.env.NODE_ENV ?? null,
  };
}

function parseSelectedObjectIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];

  const ids: string[] = [];
  const seen = new Set<string>();

  for (const item of input) {
    if (typeof item !== "string") continue;
    const id = item.trim();
    if (!id || seen.has(id)) continue;

    seen.add(id);
    ids.push(id);
    if (ids.length >= 50) break;
  }

  return ids;
}

function parseReferenceImage(input: unknown): ReferenceImage | undefined {
  if (input === undefined || input === null) return undefined;
  if (typeof input !== "object") {
    throw new Error("Invalid reference image.");
  }

  const image = input as Record<string, unknown>;
  const dataUrl = image.dataUrl;
  const mediaType = image.mediaType;
  const name = image.name;

  if (typeof dataUrl !== "string" || typeof mediaType !== "string") {
    throw new Error("Invalid reference image.");
  }

  if (!ALLOWED_IMAGE_MEDIA_TYPES.includes(mediaType)) {
    throw new Error("Reference image must be a PNG, JPEG, or WebP.");
  }

  if (dataUrl.length > MAX_REFERENCE_IMAGE_DATA_URL_BYTES) {
    throw new Error("Reference image is too large.");
  }

  const expectedPrefix = `data:${mediaType};base64,`;
  if (!dataUrl.startsWith(expectedPrefix)) {
    throw new Error("Reference image must be a base64 data URL.");
  }

  const base64Payload = dataUrl.slice(expectedPrefix.length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64Payload)) {
    throw new Error("Reference image data is invalid.");
  }

  return {
    dataUrl,
    mediaType,
    ...(typeof name === "string" && name.trim()
      ? { name: name.trim().slice(0, 120) }
      : {}),
  };
}

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    messages,
    model,
    sceneContext,
    referenceImage: rawReferenceImage,
    selectedObjectIds: rawSelectedObjectIds,
  } = await req.json();
  const selectedObjectIds = parseSelectedObjectIds(rawSelectedObjectIds);

  let referenceImage: ReferenceImage | undefined;
  try {
    referenceImage = parseReferenceImage(rawReferenceImage);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid reference image.";
    return Response.json({ error: message }, { status: 400 });
  }

  const selectedModel = ALLOWED_MODELS.includes(model) ? model : "gpt-5.4";
  const jobId = crypto.randomUUID();
  const userId = session.user.id;
  const aiMessageLimit = getAiMessageLimit(session.user.email);
  const messageCount = await prisma.aiJobResult.count({
    where: { userId },
  });

  if (messageCount >= aiMessageLimit) {
    return Response.json(
      {
        error: buildAiMessageLimitError(aiMessageLimit),
        limit: aiMessageLimit,
      },
      { status: 429 },
    );
  }

  await prisma.aiJobResult.create({
    data: { jobId, userId, status: "pending" },
  });

  const inngestDebugContext = getInngestDebugContext();

  try {
    const sendResult = await inngest.send({
      name: "ai/chat",
      data: {
        jobId,
        messages,
        model: selectedModel,
        sceneContext,
        userId,
        selectedObjectIds,
        ...(referenceImage && { referenceImage }),
      },
    });

    console.info("[ai-chat] queued Inngest event", {
      jobId,
      eventIds: sendResult.ids,
    });
    Sentry.captureMessage("AI chat Inngest event queued", {
      level: "info",
      tags: { area: "ai-chat", action: "inngest.send" },
      extra: {
        jobId,
        userId,
        eventIds: sendResult.ids,
        inngest: inngestDebugContext,
      },
    });
  } catch (error) {
    console.error("[ai-chat] failed to queue Inngest event", {
      jobId,
      error,
    });
    Sentry.captureException(error, {
      tags: { area: "ai-chat", action: "inngest.send" },
      extra: { jobId, userId, inngest: inngestDebugContext },
    });

    await prisma.aiJobResult.update({
      where: { jobId },
      data: {
        status: "error",
        error: "Failed to queue AI job. Please try again.",
      },
    });

    return Response.json(
      { error: "Failed to queue AI job. Please try again." },
      { status: 502 },
    );
  }

  return Response.json({ jobId });
}
