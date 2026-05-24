import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { synthesizeBrain } from "@/lib/synthesis";

const Patch = z.object({
  name: z.string().optional(),
  identifier: z.string().nullable().optional(),
  icon: z.string().optional(),
  description: z.string().nullable().optional(),
  cwd: z.string().nullable().optional(),
  state: z
    .enum(["active", "near_launch", "paused", "exploring", "archived"])
    .optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const project = await prisma.project.findUnique({
    where: { slug },
    include: {
      brain: true,
      threads: { orderBy: { updatedAt: "desc" }, take: 20 },
      decisions: { orderBy: { createdAt: "desc" }, take: 10 },
      updates: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(project);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  let parsed;
  try {
    parsed = Patch.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
  const project = await prisma.project.update({ where: { slug }, data: parsed });
  return NextResponse.json(project);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  await prisma.project.delete({ where: { slug } });
  return NextResponse.json({ ok: true });
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  // POST = re-synthesize the brain on demand.
  const { slug } = await params;
  const project = await prisma.project.findUnique({ where: { slug } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    await synthesizeBrain(project.id);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
