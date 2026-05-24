import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const Body = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/, "lowercase, digits, hyphens only"),
  name: z.string().min(1).max(100),
  identifier: z.string().optional(),
  icon: z.string().optional(),
  description: z.string().optional(),
  cwd: z.string().optional(),
  state: z
    .enum(["active", "near_launch", "paused", "exploring", "archived"])
    .default("active"),
});

export async function GET() {
  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: "desc" },
    include: { brain: { select: { currentFocus: true, lastSynthesizedAt: true } } },
  });
  return NextResponse.json(projects);
}

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "Invalid body", detail: String(e) },
      { status: 400 },
    );
  }
  try {
    const project = await prisma.project.create({ data: parsed });
    return NextResponse.json(project);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
