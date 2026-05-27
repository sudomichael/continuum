import Link from "next/link";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { prisma } from "@/lib/db";
import { Icon } from "@/components/icon";
import { StatusPip } from "@/components/status-pip";
import { timeAgo } from "@/lib/format";
import { OnboardingGate } from "@/components/onboarding-gate";
import { OnboardingProviderForm } from "@/components/onboarding-provider-form";
import { getSettings, tierUsable } from "@/lib/settings";
import { requireCurrentWorkspaceId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ "skip-onboarding"?: string }>;
}) {
  const { "skip-onboarding": skip } = await searchParams;
  const workspaceId = await requireCurrentWorkspaceId();

  // Setup gate: persists until an AI provider is configured AND at least
  // one coding-agent hook is installed on this host. Bypass with
  // ?skip-onboarding=1.
  if (!skip) {
    const settings = await getSettings(workspaceId);
    const aiReady = tierUsable(settings.smart) || tierUsable(settings.cheap);

    // Per-tool detection. Either being present is enough to advance the gate.
    // The CLI (`continuum connect`) is what writes these; same paths as the
    // legacy `npm run connect-*` flow so detection works either way.
    const claudeInstalled = existsSync(
      resolve(homedir(), ".claude", "continuum-hook.sh"),
    );
    const codexInstalled = existsSync(
      resolve(homedir(), ".codex", "continuum-codex-hook.sh"),
    );
    const anyAgentInstalled = claudeInstalled || codexInstalled;

    if (!aiReady || !anyAgentInstalled) {
      return (
        <OnboardingGate
          steps={[
            {
              done: true,
              title: "Database connected",
              description:
                "Your Postgres connection is working — schema is up to date.",
            },
            {
              done: aiReady,
              title: aiReady
                ? "AI provider configured"
                : "Pick an AI provider",
              description: aiReady
                ? "Tweak provider, model, or split SMART/CHEAP tiers in /settings anytime."
                : "Continuum uses an AI provider to synthesize your project brain. Pick one and paste a key — we'll auto-pick sensible default models. You can split or tweak things later in /settings.",
              inlineForm: aiReady ? undefined : <OnboardingProviderForm />,
            },
            {
              done: anyAgentInstalled,
              title: anyAgentInstalled
                ? `Coding agent connected${
                    claudeInstalled && codexInstalled
                      ? " (Claude Code + Codex)"
                      : claudeInstalled
                        ? " (Claude Code)"
                        : " (Codex)"
                  }`
                : "Install the Continuum CLI",
              description: anyAgentInstalled
                ? "Sessions in any git repo become brain updates automatically. You can install the other agent's hook anytime."
                : "One command installs the CLI, browser-pairs this machine, and wires up hooks for every coding agent it finds on your machine.",
              code: anyAgentInstalled
                ? undefined
                : `curl -fsSL https://get.getcontinuum.dev/install.sh | sh
continuum connect`,
              footnote: anyAgentInstalled
                ? undefined
                : "Using something else (Cursor, Aider, Cline, Gemini CLI, …)? Any tool that can run a shell command on session end can POST transcripts to /api/ingest — see the README.",
            },
          ]}
        />
      );
    }
  }

  const projects = await prisma.project.findMany({
    where: { workspaceId, state: { not: "archived" } },
    include: {
      brain: true,
      updates: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { updates: true } },
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  // A small "recently noted" feed — observational, not an alert queue.
  // We pull whatever the latest synthesized updates *across all projects*
  // are, regardless of category, so it reads as ambient situational
  // awareness instead of a blocker triage list.
  const recentlyNoted = await prisma.update.findMany({
    where: {
      project: { workspaceId },
      // skip raw session bodies — they're noise at the dashboard level.
      // Only show things the synthesizer fanned out into categories.
      category: { in: ["decision", "blocker", "next_action", "architecture"] },
    },
    orderBy: { createdAt: "desc" },
    take: 6,
    include: { project: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[32px] leading-[40px] tracking-[-0.02em] text-on-surface">
          Current operational landscape
        </h1>
        <p className="code-md text-on-surface-variant/70 mt-1">
          Where each project stands right now.
        </p>
      </div>

      {projects.length === 0 ? (
        <div className="border border-outline-variant rounded-lg bg-surface-container-low p-10 text-center">
          <Icon
            name="auto_awesome"
            className="text-primary text-[32px] mx-auto block mb-4"
          />
          <h2 className="font-display text-xl text-on-surface mb-2">
            Open Claude Code in a git repo
          </h2>
          <p className="text-on-surface-variant text-sm max-w-md mx-auto mb-4">
            The SessionStart hook auto-registers any repo here. SessionEnd
            ingests the transcript and synthesizes the brain. No forms.
          </p>
          <p className="text-on-surface-variant/60 text-xs max-w-md mx-auto">
            Haven&apos;t installed the hook yet? Run this in the Continuum
            repo:
          </p>
          <pre className="inline-block mt-2 bg-surface-container-lowest border border-outline-variant rounded px-3 py-2 font-mono text-[12px]">
            npm run connect-claude-code
          </pre>
        </div>
      ) : (
        <div className="border border-outline-variant rounded-lg bg-surface-container-lowest overflow-hidden">
          {/* Three columns: project, state, current focus. No health bars,
              no momentum, no blocker counts — those framed the dashboard as
              a management surface. This is an observational map. */}
          <div className="grid grid-cols-[1.5fr_120px_3fr] bg-surface-container-high border-b border-outline-variant px-4 py-2">
            <div className="label-caps text-on-surface-variant">Project</div>
            <div className="label-caps text-on-surface-variant text-center">State</div>
            <div className="label-caps text-on-surface-variant">Current focus</div>
          </div>
          <div className="divide-y divide-outline-variant/30">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.slug}`}
                className="grid grid-cols-[1.5fr_120px_3fr] px-4 py-3 items-center hover:bg-surface-variant/30 transition-colors"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-8 h-8 bg-surface-container-highest border border-outline-variant flex items-center justify-center rounded shrink-0">
                    <Icon
                      name={p.icon || "psychology"}
                      className="text-primary text-[16px]"
                    />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="code-md text-on-surface font-bold truncate">
                      {p.name}
                    </span>
                    <span className="code-sm text-[10px] text-on-surface-variant/50 truncate">
                      {p._count.updates} updates · {timeAgo(p.updatedAt)}
                    </span>
                  </div>
                </div>
                <div className="flex justify-center">
                  <StatusPip state={p.state} />
                </div>
                <div className="code-sm text-on-surface-variant/80 truncate">
                  {p.brain?.currentFocus ?? "—"}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {recentlyNoted.length > 0 && (
        <section className="border border-outline-variant rounded-lg bg-surface-container-low p-4">
          {/* Renamed from "RECENT_BLOCKERS" to "Recently noted". Same data,
              entirely different emotional read — observation, not an alert. */}
          <h2 className="label-caps text-on-surface-variant mb-3">
            Recently noted across projects
          </h2>
          <ul className="space-y-2">
            {recentlyNoted.map((u) => (
              <li
                key={u.id}
                className="flex items-start gap-4 text-[13px]"
              >
                <span className="label-caps text-[9px] text-on-surface-variant/60 shrink-0 mt-1 w-12">
                  {timeAgo(u.createdAt)}
                </span>
                <Link
                  href={`/projects/${u.project.slug}`}
                  className="code-sm text-primary shrink-0 w-32 truncate"
                >
                  {u.project.slug}
                </Link>
                <span className="text-on-surface truncate">
                  {u.title ?? u.body.slice(0, 120)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
