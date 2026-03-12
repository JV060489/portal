import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth-session";
import { NextResponse } from "next/server";

// GET /api/projects — list all projects with scenes for current user
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projects = await prisma.project.findMany({
    where: { userId: user.id },
    include: { scenes: { orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(projects);
}

// POST /api/projects — create a new project
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const name = body.name?.trim() || "Untitled Project";

  const project = await prisma.project.create({
    data: {
      userId: user.id,
      name,
      description: body.description ?? "",
    },
    include: { scenes: true },
  });

  return NextResponse.json(project, { status: 201 });
}
