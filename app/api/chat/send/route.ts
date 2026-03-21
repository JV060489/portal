import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/inngest/client";

const ALLOWED_MODELS = ["gpt-5-nano", "gpt-5.4-nano", "gpt-5.4-mini", "gemini-2.5-flash", "gemini-2.5-pro"];

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { messages, model, sceneContext } = await req.json();

  const selectedModel = ALLOWED_MODELS.includes(model) ? model : "gpt-5-nano";
  const jobId = crypto.randomUUID();
  const userId = session.user.id;

  await prisma.aiJobResult.create({
    data: { jobId, userId, status: "pending" },
  });

  await inngest.send({
    name: "ai/chat",
    data: { jobId, messages, model: selectedModel, sceneContext, userId },
  });

  return Response.json({ jobId });
}
