import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth-session";
import { NextResponse, NextRequest } from "next/server";

type Params = { params: Promise<{ projectId: string }> };

// PATCH /api/projects/:projectId — rename project
export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;
  const body = await req.json();

  const project = await prisma.project.updateMany({
    where: { id: projectId, userId: user.id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
    },
  });

  if (project.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/projects/:projectId — delete project and its scenes
export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;

  // Delete scenes first, then project
  await prisma.scene.deleteMany({ where: { projectId, userId: user.id } });
  const result = await prisma.project.deleteMany({ where: { id: projectId, userId: user.id } });

  if (result.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
