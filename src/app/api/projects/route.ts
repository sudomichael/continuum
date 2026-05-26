import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCurrentWorkspaceId } from "@/lib/tenant";
import { enforceProjectLimit, TierLimitError } from "@/lib/tier-limits";

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
  const workspaceId = await requireCurrentWorkspaceId();
  const projects = await prisma.project.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: "desc" },
    include: { brain: { select: { currentFocus: true, lastSynthesizedAt: true } } },
  });
  return NextResponse.json(projects);
}

export async function POST(req: Request) {
  const workspaceId = await requireCurrentWorkspaceId();
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
    await enforceProjectLimit(workspaceId);
  } catch (e) {
    if (e instanceof TierLimitError) {
      return NextResponse.json(
        { error: e.message, detail: e.detail },
        { status: e.status },
      );
    }
    throw e;
  }
  try {
    const project = await prisma.project.create({
      data: { ...parsed, workspaceId },
    });
    return NextResponse.json(project);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
