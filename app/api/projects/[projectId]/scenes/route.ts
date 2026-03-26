import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth-session";
import { NextResponse, NextRequest } from "next/server";
import { DEFAULT_SCENE_STATE } from "@/lib/yjs/types";

type Params = { params: Promise<{ projectId: string }> };

// POST /api/projects/:projectId/scenes — create a new scene
export async function POST(req: NextRequest, { params }: Params) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;
  const body = await req.json();
  const name = body.name?.trim() || "Untitled Scene";

  // Verify project belongs to user
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: user.id },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const scene = await prisma.scene.create({
    data: {
      userId: user.id,
      projectId,
      name,
      description: body.description ?? "",
      globalData: body.globalData ?? DEFAULT_SCENE_STATE,
    },
  });

  return NextResponse.json(scene, { status: 201 });
}
