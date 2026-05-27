import { prisma } from "./db";
import { activeModelName, complete } from "./ai";

const CLASSIFY_SYSTEM = `You are the classifier inside Continuum, a living project-brain tool.
Given a free-text capture from a user managing multiple projects, identify:
- which project it belongs to (matching against a list of known project names + slugs)
- a category: "session" | "decision" | "blocker" | "architecture" | "idea" | "progress" | "next_action"
- a short one-line title (max 80 chars)

You MUST respond with ONLY a JSON object, no prose, no code fences:
{ "projectSlug": "<slug or null if no clear match>", "category": "<one of the categories>", "title": "<title>" }`;

const SYNTHESIZE_SYSTEM = `You are the synthesis layer of Continuum, a continuity engine.

Your job is *not* to manage, prioritize, or coach. Your job is to compress the
project's recent operational reality into a faithful snapshot the user can
re-read after weeks away and instantly recognize where things stand.

Voice — non-negotiable:
- **Observational, not prescriptive.** Describe what IS, not what the user
  "should" do. "Twilio integration in progress." NOT "Finish the Twilio
  integration." NOT "Implement Twilio."
- **Present tense, declarative.** "Authentication uses Clerk in cloud mode."
  NOT "Authentication will use Clerk."
- **No imperatives.** Words like "implement", "finalize", "ensure", "complete",
  "deploy" used as commands are banned. Restate them observationally:
  "Stripe integration is partially built; checkout flow open."
- **No coaching.** No "remember to…", no "next, you should…", no advice.
- **No hedging.** No "this document describes…", no "the project appears to…".
- **Compress aggressively.** A returning user re-reads this on a tired
  Sunday. Every extra word is friction.

You will be given the project's name, existing brain (may be empty), recent
updates (newest first), current work threads, and decision history.

You MUST respond with ONLY a JSON object, no prose, no code fences. Schema:
{
  "currentFocus": "<one observational sentence, max 120 chars. What the work has been about. Shown on the dashboard. NOT a directive.>",
  "currentState": "<2-4 sentences. What this project IS right now — purpose, current operational reality, where things stand. NOT an introduction document. Combines 'what is this' and 'how it stands' into one tight summary.>",
  "whatChangedRecently": "<3-6 short bullets of what has moved recently. Past/present tense. 'Stripe checkout wired in.' NOT 'Finished Stripe checkout.'>",
  "currentDirection": "<3-5 short bullets of where work is currently aimed. Descriptive, not prescriptive. 'Heading toward beta launch with three customers in mind.' NOT 'Launch the beta.'>",
  "architectureSnapshot": "<minimal: stack + key load-bearing decisions. Bullets ok. Skip if not enough signal.>",
  "openThreads": "<active conversations, unresolved questions, in-flight work. Short bullets. Observational, not 'TODOs'.>"
}

Empty strings are fine when there is genuinely no signal — never invent. If
the only updates are noise, return mostly-empty fields and a brief currentState.`;

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
  currentState: string;
  whatChangedRecently: string;
  currentDirection: string;
  architectureSnapshot: string;
  openThreads: string;
};

// Brain re-synthesis cost control — see commit message for the math.
// Skip the smart-tier LLM call unless either:
//   - the existing brain is older than this many minutes, OR
//   - this many new updates have landed since the last successful synth.
// The explicit "Re-synthesize" button passes force=true and bypasses both.
const RESYNTHESIZE_STALE_MINUTES = 10;
const RESYNTHESIZE_NEW_UPDATE_THRESHOLD = 5;

export type SynthesizeResult =
  | { synthesized: true }
  | { synthesized: false; reason: "fresh" | "no-updates" };

export async function synthesizeBrain(
  projectId: string,
  opts: { force?: boolean } = {},
): Promise<SynthesizeResult> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      brain: true,
      updates: { orderBy: { createdAt: "desc" }, take: 50 },
      threads: { orderBy: { updatedAt: "desc" }, take: 30 },
      decisions: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!project) return { synthesized: false, reason: "no-updates" };

  // Gate: skip if brain is fresh AND not many new updates since last synth.
  if (!opts.force && project.brain?.lastSynthesizedAt) {
    const ageMs = Date.now() - project.brain.lastSynthesizedAt.getTime();
    const stale = ageMs > RESYNTHESIZE_STALE_MINUTES * 60 * 1000;

    if (!stale) {
      const newSinceSynth = project.updates.filter(
        (u) =>
          u.createdAt.getTime() > project.brain!.lastSynthesizedAt!.getTime(),
      ).length;
      if (newSinceSynth < RESYNTHESIZE_NEW_UPDATE_THRESHOLD) {
        return { synthesized: false, reason: "fresh" };
      }
    }
  }

  if (project.updates.length === 0) {
    return { synthesized: false, reason: "no-updates" };
  }

  const existing = project.brain;
  const existingText = existing
    ? `Existing brain (may be stale — overwrite as needed):

# Current state
${existing.currentState ?? ""}

# What changed recently
${existing.whatChangedRecently ?? ""}

# Current direction
${existing.currentDirection ?? ""}

# Architecture snapshot
${existing.architectureSnapshot ?? ""}

# Open threads
${existing.openThreads ?? ""}`
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
    // model returned unparseable output — fail safe by stashing the raw
    // into currentState so the user at least sees something on the page.
    payload = {
      currentFocus: "",
      currentState: raw.slice(0, 4000),
      whatChangedRecently: "",
      currentDirection: "",
      architectureSnapshot: "",
      openThreads: "",
    };
  }

  // Defensive normalization: even with "respond with strings" in the prompt,
  // models sometimes return arrays. Coerce anything non-string into a
  // bulleted string so the Brain schema's String? columns accept it.
  const normalized: BrainPayload = {
    currentFocus: asString(payload.currentFocus),
    currentState: asString(payload.currentState),
    whatChangedRecently: asString(payload.whatChangedRecently),
    currentDirection: asString(payload.currentDirection),
    architectureSnapshot: asString(payload.architectureSnapshot),
    openThreads: asString(payload.openThreads),
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
  return { synthesized: true };
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
