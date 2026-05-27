// Project chat — RAG-lite assistant grounded in the project's brain + history.
//
// GET  /api/projects/[slug]/chat       → list recent messages
// POST /api/projects/[slug]/chat       → append user msg, return assistant reply
//
// Context strategy (v1, no embeddings):
//   - Full synthesized brain (currentState + sections)
//   - Last ~30 updates (titles + bodies, capped)
//   - Last 10 decisions
//   - Last ~10 messages of this chat for continuity
//
// Voice: same observational, non-prescriptive tone as the synthesis layer.
// Continuum is a faithful synthesis layer, NOT a manager. The assistant
// answers from the brain + updates; if the answer isn't there, it says so
// honestly instead of guessing.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { complete } from "@/lib/ai";
import { requireCurrentWorkspaceId } from "@/lib/tenant";

const Body = z.object({
  message: z.string().min(1).max(5000),
});

const CHAT_SYSTEM = `You are the chat layer of Continuum, a continuity engine
for a single project. You answer questions from a user who needs to rapidly
re-orient — what happened, why, what's still open.

Voice — same rules as the synthesis layer:
- **Observational, not prescriptive.** Describe what IS. No "you should",
  no "consider doing X". The user knows what to do; they need context.
- **Quote the source when you can.** If the user asks "why did I pick
  scrypt?", find it in the updates and cite the actual session: "Session
  on 2026-05-24 noted: '…'." Provenance beats opinion.
- **If the answer isn't in the context, say so.** "Not surfaced in the
  recent brain or last 30 updates" is a fine answer. Never invent.
- **Compress.** A returning user wants the answer, not a doc.

You are given:
1. The project's name + synthesized brain (current state, recent changes,
   direction, architecture, open threads).
2. The most recent updates (sessions, decisions, blockers, notes).
3. The recent decision log.
4. The current chat conversation.

Reply directly. Markdown is fine for short structure. Stay under ~300 words
unless the user asked for depth.`;

const MAX_HISTORY = 10;
const MAX_UPDATES = 30;
const MAX_DECISIONS = 10;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const workspaceId = await requireCurrentWorkspaceId();
  const project = await prisma.project.findUnique({
    where: { workspaceId_slug: { workspaceId, slug } },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Pull last 50 messages, newest first. The UI reverses for display.
  const messages = await prisma.chatMessage.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, role: true, content: true, createdAt: true },
  });
  return NextResponse.json({ messages: messages.reverse() });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const workspaceId = await requireCurrentWorkspaceId();

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }

  const project = await prisma.project.findUnique({
    where: { workspaceId_slug: { workspaceId, slug } },
    include: {
      brain: true,
      updates: { orderBy: { createdAt: "desc" }, take: MAX_UPDATES },
      decisions: { orderBy: { createdAt: "desc" }, take: MAX_DECISIONS },
      chatMessages: {
        orderBy: { createdAt: "desc" },
        take: MAX_HISTORY,
      },
    },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Persist the user's message immediately, before we call the model. If
  // the LLM call fails partway, we keep the user's input visible.
  await prisma.chatMessage.create({
    data: {
      projectId: project.id,
      role: "user",
      content: parsed.message,
    },
  });

  const brain = project.brain;
  const brainText = brain
    ? [
        brain.currentState && `# Current state\n${brain.currentState}`,
        brain.whatChangedRecently &&
          `# What changed recently\n${brain.whatChangedRecently}`,
        brain.currentDirection &&
          `# Current direction\n${brain.currentDirection}`,
        brain.architectureSnapshot &&
          `# Architecture snapshot\n${brain.architectureSnapshot}`,
        brain.openThreads && `# Open threads\n${brain.openThreads}`,
      ]
        .filter(Boolean)
        .join("\n\n")
    : "(brain not synthesized yet)";

  const updatesText = project.updates.length
    ? project.updates
        .map((u) => {
          const when = u.createdAt.toISOString().slice(0, 10);
          // Cap each update body so a 50k-char session doesn't dominate
          // the context window.
          const body = u.body.length > 2000 ? u.body.slice(0, 2000) + "…" : u.body;
          return `[${when}] (${u.category}) ${u.title ?? ""}\n${body}`;
        })
        .join("\n\n---\n\n")
    : "(no updates yet)";

  const decisionsText = project.decisions.length
    ? project.decisions
        .map((d) => `- ${d.title}${d.rationale ? ` — ${d.rationale}` : ""}`)
        .join("\n")
    : "(no recorded decisions)";

  // chatMessages came back newest-first; reverse to chronological for the
  // model. Most recent N messages give continuity without bloating context.
  const history = project.chatMessages
    .slice()
    .reverse()
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const userPrompt = `# Project context

Project: ${project.name} (slug: ${project.slug})

## Synthesized brain
${brainText}

## Recent updates (newest first)
${updatesText}

## Decisions
${decisionsText}`;

  let reply: string;
  try {
    reply = await complete({
      workspaceId,
      system: CHAT_SYSTEM,
      messages: [
        // Brain + updates as the first user message keeps it in front of
        // the model's recency window without consuming the system slot.
        { role: "user", content: userPrompt },
        // Acknowledge so the conversation reads naturally to the model.
        {
          role: "assistant",
          content:
            "Got the project context. Ready for your question.",
        },
        ...history,
        { role: "user", content: parsed.message },
      ],
      maxTokens: 1024,
      tier: "smart",
    });
  } catch (e) {
    // Persist the failure as an assistant message so the user can see it.
    const errText =
      e instanceof Error ? e.message : "Unknown error from AI provider.";
    await prisma.chatMessage.create({
      data: {
        projectId: project.id,
        role: "assistant",
        content: `_(synthesis error)_ ${errText}`,
      },
    });
    return NextResponse.json(
      { error: "AI call failed", detail: errText },
      { status: 500 },
    );
  }

  const saved = await prisma.chatMessage.create({
    data: {
      projectId: project.id,
      role: "assistant",
      content: reply,
    },
    select: { id: true, role: true, content: true, createdAt: true },
  });

  return NextResponse.json({ message: saved });
}
