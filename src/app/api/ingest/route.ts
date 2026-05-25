import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { complete } from "@/lib/ai";
import { synthesizeBrain } from "@/lib/synthesis";
import { verifyTokenHeader } from "@/lib/cli-auth";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

const Body = z.object({
  cwd: z.string().optional(),
  projectSlug: z.string().optional(),
  source: z.enum(["claude_code", "codex"]).default("claude_code"),
  sessionId: z.string().min(1).max(200).optional(),
  transcript: z.string().min(1).max(2_000_000),
  meta: z.record(z.string(), z.unknown()).optional(),
});

const SESSION_SUMMARIZE_SYSTEM = `You are a Continuum ingestor processing the end of an AI coding session.
Extract a terse, structured session summary. The user is a busy founder; do not pad.

You MUST respond with ONLY a JSON object (no prose, no code fences). Schema:
{
  "title": "<one-line title for this session, max 80 chars>",
  "summary": "<2-5 bullet markdown summary of what happened>",
  "decisions": ["<decision 1>", "<decision 2>"],
  "blockers": ["<blocker 1>"],
  "nextActions": ["<next action 1>"],
  "architectureNotes": ["<note 1>"]
}

Empty arrays are fine. Do not invent items the transcript does not support.`;

type SessionSummary = {
  title: string;
  summary: string;
  decisions: string[];
  blockers: string[];
  nextActions: string[];
  architectureNotes: string[];
};

function tryParse(raw: string): SessionSummary | null {
  try {
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    return JSON.parse(cleaned) as SessionSummary;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  // Auth: accept (a) a valid session cookie (web UI), (b) the legacy shared
  // secret in CONTINUUM_TOKEN, or (c) a per-device CLI token.
  const jar = await cookies();
  const sessionOk = verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!sessionOk) {
    const tokenAuth = await verifyTokenHeader(
      req.headers.get("x-continuum-token"),
    );
    if (!tokenAuth.ok) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "Invalid body", detail: String(e) },
      { status: 400 },
    );
  }

  // Resolve project: explicit slug > cwd lookup.
  let project = null;
  if (parsed.projectSlug) {
    project = await prisma.project.findUnique({
      where: { slug: parsed.projectSlug },
    });
  }
  if (!project && parsed.cwd) {
    project = await prisma.project.findUnique({ where: { cwd: parsed.cwd } });
  }
  if (!project) {
    return NextResponse.json(
      {
        error:
          "No project matched. Register the project in Continuum first, or pass projectSlug.",
        hint: parsed.cwd
          ? `Bind the project's "cwd" to "${parsed.cwd}" in its settings.`
          : undefined,
      },
      { status: 404 },
    );
  }

  // Summarize the session transcript via the cheap-tier LLM.
  // Cap at 60k chars (~15k tokens) — most session intelligence is in the
  // tail anyway, and this keeps cost per session in the cents, not dimes.
  const trimmed = parsed.transcript.slice(-60_000);
  let raw: string;
  try {
    raw = await complete({
      system: SESSION_SUMMARIZE_SYSTEM,
      messages: [{ role: "user", content: trimmed }],
      maxTokens: 2048,
      jsonResponse: true,
      tier: "cheap",
    });
  } catch (e) {
    return NextResponse.json(
      { error: "Summarization failed", detail: String(e) },
      { status: 500 },
    );
  }
  const summary = tryParse(raw);
  const sid = parsed.sessionId ?? null;

  // Idempotency: if this ingest is keyed by sessionId (e.g. Codex Stop hook
  // firing per-turn), drop any prior fanout for the same session before
  // reinserting the latest snapshot. Without a sessionId we always append.
  if (sid) {
    await prisma.update.deleteMany({
      where: { source: parsed.source, sourceSessionId: sid },
    });
    await prisma.decision.deleteMany({
      where: { source: parsed.source, sourceSessionId: sid },
    });
  }

  if (!summary) {
    // Still persist the raw transcript so nothing is lost.
    await prisma.update.create({
      data: {
        projectId: project.id,
        source: parsed.source,
        sourceSessionId: sid,
        category: "session",
        title: "Session (unparsed)",
        body: trimmed.slice(0, 8000),
        raw: JSON.stringify({ transcript: trimmed.slice(0, 50000) }),
      },
    });
    return NextResponse.json(
      { error: "Could not parse summary", project },
      { status: 200 },
    );
  }

  // Persist the session update.
  await prisma.update.create({
    data: {
      projectId: project.id,
      source: parsed.source,
      sourceSessionId: sid,
      category: "session",
      title: summary.title,
      body: summary.summary,
      raw: JSON.stringify(summary),
    },
  });

  // Fan out decisions/blockers/nextActions/architectureNotes as their own updates.
  for (const d of summary.decisions ?? []) {
    await prisma.update.create({
      data: {
        projectId: project.id,
        source: parsed.source,
        sourceSessionId: sid,
        category: "decision",
        title: d.slice(0, 120),
        body: d,
      },
    });
    await prisma.decision.create({
      data: {
        projectId: project.id,
        source: parsed.source,
        sourceSessionId: sid,
        title: d.slice(0, 200),
      },
    });
  }
  for (const b of summary.blockers ?? []) {
    await prisma.update.create({
      data: {
        projectId: project.id,
        source: parsed.source,
        sourceSessionId: sid,
        category: "blocker",
        title: b.slice(0, 120),
        body: b,
      },
    });
  }
  for (const n of summary.nextActions ?? []) {
    await prisma.update.create({
      data: {
        projectId: project.id,
        source: parsed.source,
        sourceSessionId: sid,
        category: "next_action",
        title: n.slice(0, 120),
        body: n,
      },
    });
  }
  for (const a of summary.architectureNotes ?? []) {
    await prisma.update.create({
      data: {
        projectId: project.id,
        source: parsed.source,
        sourceSessionId: sid,
        category: "architecture",
        title: a.slice(0, 120),
        body: a,
      },
    });
  }

  try {
    await synthesizeBrain(project.id);
  } catch (e) {
    return NextResponse.json({ project, summary, warning: String(e) });
  }

  return NextResponse.json({ project, summary });
}
