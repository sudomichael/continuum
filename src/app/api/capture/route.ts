import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { classifyCapture, isValidCategory, synthesizeBrain } from "@/lib/synthesis";
import { requireCurrentWorkspaceId } from "@/lib/tenant";

const Body = z.object({
  body: z.string().min(1).max(20_000),
  projectSlug: z.string().optional(), // override classifier
});

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

  let projectSlug = parsed.projectSlug ?? null;
  let category = "session";
  let title: string | null = null;

  if (!projectSlug) {
    try {
      const cls = await classifyCapture(workspaceId, parsed.body);
      projectSlug = cls.projectSlug;
      category = isValidCategory(cls.category) ? cls.category : "session";
      title = cls.title?.slice(0, 200) ?? null;
    } catch (e) {
      return NextResponse.json(
        { error: "Classification failed", detail: String(e) },
        { status: 500 },
      );
    }
  }

  // No matching project — create an "inbox" project so nothing is lost.
  if (!projectSlug) {
    const inbox = await prisma.project.upsert({
      where: { workspaceId_slug: { workspaceId, slug: "inbox" } },
      update: {},
      create: {
        workspaceId,
        slug: "inbox",
        name: "Inbox",
        icon: "inbox",
        description: "Unclassified captures",
        state: "exploring",
      },
    });
    projectSlug = inbox.slug;
  }

  const project = await prisma.project.findUnique({
    where: { workspaceId_slug: { workspaceId, slug: projectSlug } },
  });
  if (!project) {
    return NextResponse.json(
      { error: `Project ${projectSlug} not found` },
      { status: 404 },
    );
  }

  const update = await prisma.update.create({
    data: {
      projectId: project.id,
      source: "manual",
      category,
      title,
      body: parsed.body,
    },
  });

  // Same bump as ingest — keep "last worked on" honest on the dashboard.
  await prisma.project.update({
    where: { id: project.id },
    data: { updatedAt: new Date() },
  });

  try {
    await synthesizeBrain(project.id);
  } catch (e) {
    return NextResponse.json(
      {
        project,
        update,
        warning: "Captured but synthesis failed",
        detail: String(e),
      },
      { status: 200 },
    );
  }

  return NextResponse.json({ project, update });
}
