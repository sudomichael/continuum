import { prisma } from "./db";
import { activeModelName, complete } from "./ai";

const CLASSIFY_SYSTEM = `You are the classifier inside Continuum, a living project-brain tool.
Given a free-text capture from a user managing multiple projects, identify:
- which project it belongs to (matching against a list of known project names + slugs)
- a category: "session" | "decision" | "blocker" | "architecture" | "idea" | "progress" | "next_action"
- a short one-line title (max 80 chars)

You MUST respond with ONLY a JSON object, no prose, no code fences:
{ "projectSlug": "<slug or null if no clear match>", "category": "<one of the categories>", "title": "<title>" }`;

const SYNTHESIZE_SYSTEM = `You are the synthesis engine inside Continuum.
You maintain a living "Project Brain" for a single project — a high-density operational document
that lets a busy founder reload full context in under 30 seconds after weeks away.

You will be given:
- the project's name and existing brain (may be empty)
- recent updates (Claude sessions, decisions, blockers, ideas, manual notes) — newest first
- current work threads
- decision history

Write a fresh brain. Be terse, technical, founder-grade. No marketing language, no hedging,
no "this document describes...". Speak in declarative present tense. Prefer bullets over prose.
Compress aggressively — if recent updates contradict older ones, the new state wins.

You MUST respond with ONLY a JSON object, no prose, no code fences. Schema:
{
  "currentFocus": "<one sentence, max 120 chars — shown on the dashboard>",
  "whatIsThis": "<2-4 sentences>",
  "productState": "<bullets, what's shipped vs in-progress vs broken>",
  "architecture": "<stack + key design decisions, bullets ok>",
  "strategicDirection": "<goals & priorities, bullets>",
  "recentProgress": "<what's actually moved in the last few updates>",
  "openQuestions": "<unresolved technical/strategic issues, bullets>",
  "nextActions": "<concrete next moves, ordered, bullets>"
}

Fields may be empty strings if there is genuinely no information yet — never invent.`;

export type ClassifyResult = {
  projectSlug: string | null;
  category: string;
  title: string;
};

function parseJson<T>(raw: string): T {
  // Strip code fences if the model added them despite instructions.
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(cleaned) as T;
}

export async function classifyCapture(
  workspaceId: string,
  body: string,
): Promise<ClassifyResult> {
  const projects = await prisma.project.findMany({
    where: { workspaceId },
    select: { slug: true, name: true },
  });
  const list = projects
    .map((p) => `- ${p.slug} (${p.name})`)
    .join("\n");

  const userPrompt = `Known projects:
${list || "(none)"}

Capture:
"""
${body}
"""`;

  const raw = await complete({
    workspaceId,
    system: CLASSIFY_SYSTEM,
    messages: [{ role: "user", content: userPrompt }],
    maxTokens: 256,
    jsonResponse: true,
    tier: "cheap",
  });
  return parseJson<ClassifyResult>(raw);
}

const VALID_CATEGORIES = [
  "session",
  "decision",
  "blocker",
  "architecture",
  "idea",
  "progress",
  "next_action",
] as const;

export type Category = (typeof VALID_CATEGORIES)[number];

export function isValidCategory(c: string): c is Category {
  return (VALID_CATEGORIES as readonly string[]).includes(c);
}

type BrainPayload = {
  currentFocus: string;
  whatIsThis: string;
  productState: string;
  architecture: string;
  strategicDirection: string;
  recentProgress: string;
  openQuestions: string;
  nextActions: string;
};

export async function synthesizeBrain(projectId: string): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      brain: true,
      updates: { orderBy: { createdAt: "desc" }, take: 50 },
      threads: { orderBy: { updatedAt: "desc" }, take: 30 },
      decisions: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!project) return;

  const existing = project.brain;
  const existingText = existing
    ? `Existing brain (may be stale — overwrite as needed):

# What is this?
${existing.whatIsThis ?? ""}

# Product state
${existing.productState ?? ""}

# Architecture
${existing.architecture ?? ""}

# Strategic direction
${existing.strategicDirection ?? ""}

# Recent progress
${existing.recentProgress ?? ""}

# Open questions
${existing.openQuestions ?? ""}

# Next actions
${existing.nextActions ?? ""}`
    : "Existing brain: (none yet)";

  const updatesText = project.updates.length
    ? project.updates
        .map((u) => {
          const when = u.createdAt.toISOString();
          return `[${when}] (${u.source}/${u.category}) ${u.title ?? ""}
${u.body}`;
        })
        .join("\n\n---\n\n")
    : "(no updates yet)";

  const threadsText = project.threads.length
    ? project.threads
        .map(
          (t) =>
            `- [${t.state}] ${t.title}${
              t.blockers ? ` — blockers: ${t.blockers}` : ""
            }`,
        )
        .join("\n")
    : "(no active threads)";

  const decisionsText = project.decisions.length
    ? project.decisions
        .map((d) => `- ${d.title}${d.rationale ? ` — ${d.rationale}` : ""}`)
        .join("\n")
    : "(no recorded decisions)";

  const userPrompt = `Project: ${project.name} (slug: ${project.slug})
${project.description ? `Description: ${project.description}` : ""}

${existingText}

# Recent updates (newest first, up to 50):
${updatesText}

# Work threads:
${threadsText}

# Decision history:
${decisionsText}

Synthesize the current brain. Return the JSON object only.`;

  const raw = await complete({
    workspaceId: project.workspaceId,
    system: SYNTHESIZE_SYSTEM,
    messages: [{ role: "user", content: userPrompt }],
    maxTokens: 4096,
    jsonResponse: true,
  });

  let payload: BrainPayload;
  try {
    payload = parseJson<BrainPayload>(raw);
  } catch {
    // model returned unparseable output — fail safe by storing raw into recentProgress
    payload = {
      currentFocus: "",
      whatIsThis: "",
      productState: "",
      architecture: "",
      strategicDirection: "",
      recentProgress: raw.slice(0, 4000),
      openQuestions: "",
      nextActions: "",
    };
  }

  // Defensive normalization: even with "respond with strings" in the prompt,
  // models (esp. gpt-4o-mini) sometimes return arrays for bullet-y fields
  // like nextActions / openQuestions. Coerce anything not-a-string into a
  // bulleted string so the Brain schema's String? columns accept it.
  const normalized: BrainPayload = {
    currentFocus: asString(payload.currentFocus),
    whatIsThis: asString(payload.whatIsThis),
    productState: asString(payload.productState),
    architecture: asString(payload.architecture),
    strategicDirection: asString(payload.strategicDirection),
    recentProgress: asString(payload.recentProgress),
    openQuestions: asString(payload.openQuestions),
    nextActions: asString(payload.nextActions),
  };

  const model = await activeModelName(project.workspaceId);
  await prisma.brain.upsert({
    where: { projectId: project.id },
    update: {
      ...normalized,
      lastSynthesizedAt: new Date(),
      synthesisModel: model,
    },
    create: {
      projectId: project.id,
      ...normalized,
      lastSynthesizedAt: new Date(),
      synthesisModel: model,
    },
  });
}

// Coerce mixed model outputs into a single string. Strings pass through;
// arrays become "- item\n- item"; objects/numbers/etc get JSON-stringified.
function asString(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  if (Array.isArray(v)) {
    return v
      .map((item) => (typeof item === "string" ? `- ${item}` : `- ${JSON.stringify(item)}`))
      .join("\n");
  }
  return JSON.stringify(v);
}
