import Link from "next/link";
import { prisma } from "@/lib/db";
import { Icon } from "@/components/icon";
import { StatusPip } from "@/components/status-pip";
import { HealthRing } from "@/components/health-ring";
import { MomentumBars } from "@/components/momentum-bars";
import { timeAgo } from "@/lib/format";
import { OnboardingGate } from "@/components/onboarding-gate";
import { getSettings, tierUsable } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ "skip-onboarding"?: string }>;
}) {
  const { "skip-onboarding": skip } = await searchParams;

  // Setup gate: if no AI provider is configured, show the onboarding screen
  // instead of the empty dashboard. The user can ?skip-onboarding=1 to bypass.
  if (!skip) {
    const settings = await getSettings();
    const aiReady = tierUsable(settings.smart) || tierUsable(settings.cheap);
    if (!aiReady) {
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
              done: false,
              title: "Add an AI provider key",
              description:
                "Continuum needs an Anthropic or OpenAI key (or Ollama / OpenRouter / any OpenAI-compatible endpoint) to actually synthesize your project brain. Without it everything's a canned demo.",
              cta: { label: "Configure AI provider", href: "/settings" },
            },
            {
              done: false,
              title: "Connect Claude Code (optional but the whole point)",
              description:
                "Wires Continuum into your Claude Code sessions so every transcript becomes a brain update. Run this in your terminal from the Continuum repo:",
              code: "npm run connect-claude-code",
            },
          ]}
        />
      );
    }
  }

  const projects = await prisma.project.findMany({
    where: { state: { not: "archived" } },
    include: {
      brain: true,
      updates: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { updates: true } },
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  const blockerCountsByProject = await prisma.update.groupBy({
    by: ["projectId"],
    where: { category: "blocker" },
    _count: { _all: true },
  });
  const blockerMap = new Map(
    blockerCountsByProject.map((r) => [r.projectId, r._count._all]),
  );

  const recentBlockers = await prisma.update.findMany({
    where: { category: "blocker" },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { project: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[32px] leading-[40px] tracking-[-0.02em] text-on-surface">
          Executive Dashboard
        </h1>
        <p className="code-md text-on-surface-variant/70 mt-1">
          Operational state across every active project.
        </p>
      </div>

      {projects.length === 0 ? (
        <div className="border border-outline-variant rounded-lg bg-surface-container-low p-10 text-center">
          <Icon
            name="psychology"
            className="text-primary text-[32px] mx-auto block mb-4"
          />
          <h2 className="font-display text-xl text-on-surface mb-2">
            No projects yet
          </h2>
          <p className="text-on-surface-variant text-sm max-w-md mx-auto mb-4">
            Open Claude Code in a git repo (auto-registers via the SessionStart
            hook), or add one manually.
          </p>
          <Link
            href="/projects"
            className="inline-flex items-center gap-2 bg-primary text-on-primary label-caps py-2 px-4 rounded hover:opacity-90"
          >
            Add a project
            <Icon name="arrow_forward" className="text-[16px]" />
          </Link>
        </div>
      ) : (
        <div className="border border-outline-variant rounded-lg bg-surface-container-lowest overflow-hidden">
          <div className="grid grid-cols-[1.5fr_100px_2fr_80px_80px_120px] bg-surface-container-high border-b border-outline-variant px-4 py-2">
            <div className="label-caps text-on-surface-variant">PROJECT</div>
            <div className="label-caps text-on-surface-variant text-center">STATE</div>
            <div className="label-caps text-on-surface-variant">FOCUS</div>
            <div className="label-caps text-on-surface-variant text-center">BLOCKS</div>
            <div className="label-caps text-on-surface-variant text-center">HEALTH</div>
            <div className="label-caps text-on-surface-variant">MOMENTUM</div>
          </div>
          <div className="divide-y divide-outline-variant/30">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.slug}`}
                className="grid grid-cols-[1.5fr_100px_2fr_80px_80px_120px] px-4 py-2 items-center hover:bg-surface-variant/30 transition-colors"
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
                <div className="text-center code-md font-bold text-tertiary">
                  {blockerMap.get(p.id) ?? 0}
                </div>
                <div className="flex justify-center">
                  <HealthRing value={p.health} />
                </div>
                <div>
                  <MomentumBars value={p.momentum} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {recentBlockers.length > 0 && (
        <section className="border border-outline-variant rounded-lg bg-surface-container-low p-4">
          <h2 className="label-caps text-tertiary mb-4">RECENT_BLOCKERS</h2>
          <ul className="space-y-2">
            {recentBlockers.map((b) => (
              <li
                key={b.id}
                className="flex items-start gap-4 text-[13px]"
              >
                <span className="label-caps text-on-surface-variant/60 shrink-0 mt-1">
                  {timeAgo(b.createdAt)}
                </span>
                <Link
                  href={`/projects/${b.project.slug}`}
                  className="code-sm text-primary shrink-0"
                >
                  {b.project.slug}
                </Link>
                <span className="text-on-surface truncate">
                  {b.title ?? b.body.slice(0, 120)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
