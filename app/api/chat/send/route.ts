import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/inngest/client";
import { buildAiMessageLimitError, getAiMessageLimit } from "@/lib/ai/limits";

const ALLOWED_MODELS = ["gpt-5.4", "gpt-5-nano", "gpt-5.4-nano", "gpt-5.4-mini"];
const ALLOWED_IMAGE_MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_REFERENCE_IMAGE_DATA_URL_BYTES = 3 * 1024 * 1024;

type ReferenceImage = {
  dataUrl: string;
  mediaType: string;
  name?: string;
};

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

  const { messages, model, sceneContext, referenceImage: rawReferenceImage } =
    await req.json();

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

  await inngest.send({
    name: "ai/chat",
    data: {
      jobId,
      messages,
      model: selectedModel,
      sceneContext,
      userId,
      ...(referenceImage && { referenceImage }),
    },
  });

  return Response.json({ jobId });
}
