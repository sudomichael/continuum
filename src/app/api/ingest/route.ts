import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { complete } from "@/lib/ai";
import { synthesizeBrain } from "@/lib/synthesis";
import { verifyTokenHeader } from "@/lib/cli-auth";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import {
  enforceSessionLimit,
  recordSessionIngested,
  TierLimitError,
} from "@/lib/tier-limits";

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
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    // Defensive normalize. Models (esp. gpt-4o-mini) sometimes return
    // `summary` as a bullet array even when the prompt says "string", and
    // sometimes return `decisions`/etc as a single string when they should
    // be arrays. Coerce everything to the shape Prisma expects.
    return {
      title: asString(parsed.title),
      summary: asString(parsed.summary),
      decisions: asStringArray(parsed.decisions),
      blockers: asStringArray(parsed.blockers),
      nextActions: asStringArray(parsed.nextActions),
      architectureNotes: asStringArray(parsed.architectureNotes),
    };
  } catch {
    return null;
  }
}

// Coerce mixed model outputs into a single string. Arrays become a
// bulleted markdown list; everything else gets stringified.
function asString(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  if (Array.isArray(v)) {
    return v
      .map((item) =>
        typeof item === "string" ? `- ${item}` : `- ${JSON.stringify(item)}`,
      )
      .join("\n");
  }
  return JSON.stringify(v);
}

// Coerce mixed model outputs into a string[]. Strings become a single-item
// array; arrays get cleaned to strings; everything else returns [].
function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.flatMap((item) =>
      typeof item === "string"
        ? [item]
        : item == null
          ? []
          : [JSON.stringify(item)],
    );
  }
  if (typeof v === "string" && v.trim()) return [v];
  return [];
}

export async function POST(req: Request) {
  // Auth: accept (a) a valid session cookie (web UI, self-host mode),
  // (b) a per-device CLI token, or (c) the legacy shared CONTINUUM_TOKEN.
  // Each resolves to a workspaceId — cookie/legacy → self-host workspace;
  // CLI token → the workspace it was issued under.
  const jar = await cookies();
  const sessionOk = verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  let workspaceId: string;
  if (sessionOk) {
    const { requireCurrentWorkspaceId } = await import("@/lib/tenant");
    workspaceId = await requireCurrentWorkspaceId();
  } else {
    const tokenAuth = await verifyTokenHeader(
      req.headers.get("x-continuum-token"),
    );
    if (!tokenAuth.ok) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    workspaceId = tokenAuth.workspaceId;
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

  // Enforce free-tier session-per-month cap before doing the AI summary
  // (which is the actual cost driver). Returns 402 if exhausted.
  try {
    await enforceSessionLimit(workspaceId);
  } catch (e) {
    if (e instanceof TierLimitError) {
      return NextResponse.json(
        { error: e.message, detail: e.detail },
        { status: e.status },
      );
    }
    throw e;
  }

  // Resolve project within this workspace: explicit slug > cwd lookup.
  let project = null;
  if (parsed.projectSlug) {
    project = await prisma.project.findUnique({
      where: { workspaceId_slug: { workspaceId, slug: parsed.projectSlug } },
    });
  }
  if (!project && parsed.cwd) {
    project = await prisma.project.findUnique({
      where: { workspaceId_cwd: { workspaceId, cwd: parsed.cwd } },
    });
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
      workspaceId,
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
  // Scope the dedup to this project (and therefore this workspace) so two
  // different workspaces can use overlapping session ids without conflict.
  if (sid) {
    await prisma.update.deleteMany({
      where: { projectId: project.id, source: parsed.source, sourceSessionId: sid },
    });
    await prisma.decision.deleteMany({
      where: { projectId: project.id, source: parsed.source, sourceSessionId: sid },
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

  // Bump the project's updatedAt so the dashboard's "last worked on"
  // sort reflects actual activity. Prisma's @updatedAt only fires when
  // the row itself is written, not when a child row is created — so we
  // touch the project explicitly here. One write per ingest is cheap.
  await prisma.project.update({
    where: { id: project.id },
    data: { updatedAt: new Date() },
  });

  // Best-effort usage record (don't fail the ingest if metering hiccups).
  recordSessionIngested(workspaceId).catch(() => {});

  try {
    await synthesizeBrain(project.id);
  } catch (e) {
    return NextResponse.json({ project, summary, warning: String(e) });
  }

  return NextResponse.json({ project, summary });
}
