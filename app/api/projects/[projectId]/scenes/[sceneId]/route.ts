import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth-session";
import { NextResponse, NextRequest } from "next/server";

type Params = { params: Promise<{ projectId: string; sceneId: string }> };

// GET /api/projects/:projectId/scenes/:sceneId — get scene
export async function GET(_req: NextRequest, { params }: Params) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, sceneId } = await params;

  const scene = await prisma.scene.findFirst({
    where: { id: sceneId, projectId, userId: user.id },
  });

  if (!scene) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(scene);
}

// PATCH /api/projects/:projectId/scenes/:sceneId — rename scene
export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, sceneId } = await params;
  const body = await req.json();

  const result = await prisma.scene.updateMany({
    where: { id: sceneId, projectId, userId: user.id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.globalData !== undefined && { globalData: body.globalData }),
    },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/projects/:projectId/scenes/:sceneId — delete scene
export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, sceneId } = await params;

  const result = await prisma.scene.deleteMany({
    where: { id: sceneId, projectId, userId: user.id },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
