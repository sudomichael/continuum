// A canned AI provider used when DEMO_MODE=1 or when no API keys are set.
//
// Returns plausible JSON for each of Continuum's three LLM call sites:
//   - classify capture (synthesis.ts)
//   - synthesize brain (synthesis.ts)
//   - summarize Claude Code session (api/ingest/route.ts)
//
// Detection is by sniffing the system prompt. Brittle, but contained here.

export function demoComplete(opts: {
  system: string;
  messages: { role: string; content: string }[];
}): string {
  const sys = opts.system;
  const user = opts.messages.map((m) => m.content).join("\n");

  if (sys.includes("classifier inside Continuum")) {
    return JSON.stringify(classifyResponse(user));
  }
  if (sys.includes("synthesis engine inside Continuum")) {
    return JSON.stringify(brainResponse(user));
  }
  if (sys.includes("Continuum ingestor")) {
    return JSON.stringify(sessionResponse(user));
  }
  return JSON.stringify({ error: "demo provider: unknown prompt" });
}

function pickProjectSlug(userPrompt: string): string | null {
  // The classify prompt embeds the project list as "- <slug> (<name>)".
  const slugMatches = [...userPrompt.matchAll(/^- ([a-z0-9-]+) \(/gm)].map(
    (m) => m[1],
  );
  if (slugMatches.length === 0) return null;
  const lower = userPrompt.toLowerCase();
  // Try to match a slug or name fragment in the capture body.
  for (const slug of slugMatches) {
    const flat = slug.replace(/-/g, "");
    if (lower.includes(slug) || lower.includes(flat)) return slug;
  }
  // Fallback: first known project.
  return slugMatches[0] ?? null;
}

function classifyResponse(userPrompt: string) {
  const slug = pickProjectSlug(userPrompt);
  const lower = userPrompt.toLowerCase();
  let category = "session";
  if (lower.includes("block") || lower.includes("broken") || lower.includes("bug"))
    category = "blocker";
  else if (lower.includes("decid") || lower.includes("we should"))
    category = "decision";
  else if (lower.includes("idea") || lower.includes("explore"))
    category = "idea";
  else if (lower.includes("ship") || lower.includes("done"))
    category = "progress";
  else if (lower.includes("architect") || lower.includes("stack"))
    category = "architecture";

  // Extract a title from the capture body (last quoted block).
  const captureMatch = userPrompt.match(/"""\s*([\s\S]+?)\s*"""/);
  const body = captureMatch ? captureMatch[1].trim() : userPrompt;
  const title = body.split(/[.\n]/)[0].slice(0, 80) || "captured note";
  return { projectSlug: slug, category, title };
}

function brainResponse(userPrompt: string) {
  // Try to lift the project name out of the prompt.
  const nameMatch = userPrompt.match(/Project:\s*(.+?)\s*\(slug:/);
  const name = nameMatch ? nameMatch[1] : "this project";

  return {
    currentFocus: `[demo] Active iteration on ${name} — see recent updates for live state.`,
    whatIsThis: `[demo] ${name} is one of the user's active nodes. This brain was synthesized by the canned demo provider — wire a real Anthropic or OpenAI key in /settings to get genuine synthesis.`,
    productState: `[demo]\n- core flows wired\n- onboarding in flux\n- 1-2 known issues outstanding`,
    architecture: `[demo]\n- Next.js + Postgres\n- key dependencies pinned\n- deploys via Docker compose`,
    strategicDirection: `[demo]\n- ship the smallest end-to-end loop\n- defer multi-user until first paid customer\n- focus on momentum, not surface area`,
    recentProgress: `[demo] Recent sessions touched routing, copy, and a small refactor of the editor. Synthesis is canned in demo mode.`,
    openQuestions: `[demo]\n- pricing model still unsettled\n- which platform first?`,
    nextActions: `[demo]\n1. wire a real API key in /settings\n2. run a Claude Code session in this project\n3. re-synthesize`,
  };
}

function sessionResponse(_userPrompt: string) {
  return {
    title: "[demo] Claude Code session summary",
    summary:
      "[demo] This is a canned session summary generated because no API key is configured. Add a key in /settings to get real session intelligence.",
    decisions: [],
    blockers: [],
    nextActions: ["Configure an Anthropic or OpenAI API key in /settings"],
    architectureNotes: [],
  };
}
