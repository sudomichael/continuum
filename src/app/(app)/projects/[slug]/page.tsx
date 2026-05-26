import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireCurrentWorkspaceId } from "@/lib/tenant";
import { Icon } from "@/components/icon";
import { StatusPip } from "@/components/status-pip";
import { HealthRing } from "@/components/health-ring";
import { BrainSection } from "@/components/brain-section";
import { timeAgo, categoryColor } from "@/lib/format";
import { ResynthesizeButton } from "./resynth-button";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ slug: string }> };

export default async function ProjectBrainPage({ params }: PageProps) {
  const { slug } = await params;
  const workspaceId = await requireCurrentWorkspaceId();
  const project = await prisma.project.findUnique({
    where: { workspaceId_slug: { workspaceId, slug } },
    include: {
      brain: true,
      threads: { orderBy: { updatedAt: "desc" } },
      decisions: { orderBy: { createdAt: "desc" }, take: 20 },
      updates: { orderBy: { createdAt: "desc" }, take: 30 },
    },
  });
  if (!project) notFound();

  const blockers = project.updates.filter((u) => u.category === "blocker");
  const brain = project.brain;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-4 min-w-0">
          <div className="w-12 h-12 bg-surface-container-highest border border-outline-variant flex items-center justify-center rounded">
            <Icon
              name={project.icon || "psychology"}
              className="text-primary text-[24px]"
              filled
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display text-[32px] leading-[40px] tracking-[-0.02em] text-on-surface">
                {project.name}
              </h1>
              <StatusPip state={project.state} />
            </div>
            {project.identifier && (
              <div className="code-sm text-on-surface-variant/60 mt-1">
                {project.identifier}
              </div>
            )}
            <p className="text-on-surface-variant/80 text-[14px] mt-1 max-w-2xl">
              {brain?.currentFocus ?? project.description ?? "—"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end">
            <span className="label-caps text-[9px] text-on-surface-variant">
              BRAIN_HEALTH
            </span>
            <HealthRing value={project.health} />
          </div>
          <ResynthesizeButton slug={project.slug} />
        </div>
      </div>

      {brain?.lastSynthesizedAt && (
        <div className="code-sm text-[11px] text-on-surface-variant/50 -mt-2">
          last synthesis: {timeAgo(brain.lastSynthesizedAt)} ·{" "}
          {brain.synthesisModel ?? "unknown model"}
        </div>
      )}

      {/* Brain grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BrainSection
          icon="help"
          title="WHAT_IS_THIS"
          content={brain?.whatIsThis}
          empty="No description synthesized yet. Capture your first update."
        />
        <BrainSection
          icon="monitor_heart"
          title="PRODUCT_STATE"
          content={brain?.productState}
        />
        <BrainSection
          icon="schema"
          title="ARCHITECTURE"
          content={brain?.architecture}
        />
        <BrainSection
          icon="flag"
          title="STRATEGIC_DIRECTION"
          content={brain?.strategicDirection}
        />
        <BrainSection
          icon="trending_up"
          title="RECENT_PROGRESS"
          content={brain?.recentProgress}
        />
        <BrainSection
          icon="quiz"
          title="OPEN_QUESTIONS"
          content={brain?.openQuestions}
        />
        <BrainSection
          icon="route"
          title="NEXT_ACTIONS"
          content={brain?.nextActions}
        />
        <section className="bg-surface-container-low border border-outline-variant rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Icon name="warning" filled className="text-error text-[18px]" />
            <h3 className="label-caps text-on-surface-variant">
              CURRENT_BLOCKERS
            </h3>
          </div>
          {blockers.length === 0 ? (
            <p className="code-sm text-on-surface-variant/40">
              — none registered —
            </p>
          ) : (
            <ul className="space-y-2">
              {blockers.map((b) => (
                <li key={b.id} className="flex items-start gap-2 text-[14px]">
                  <span className="w-[6px] h-[6px] mt-[7px] bg-error rounded-full shrink-0" />
                  <span className="text-on-surface">
                    {b.title ?? b.body.slice(0, 200)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Threads + Decisions + Updates */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="bg-surface-container-low border border-outline-variant rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Icon name="device_hub" className="text-primary text-[18px]" />
            <h3 className="label-caps text-on-surface-variant">
              ACTIVE_WORK_THREADS
            </h3>
          </div>
          {project.threads.length === 0 ? (
            <p className="code-sm text-on-surface-variant/40">no threads</p>
          ) : (
            <ul className="space-y-4">
              {project.threads.map((t) => (
                <li key={t.id} className="border-l-2 border-primary/40 pl-2">
                  <div className="flex items-center gap-2">
                    <span className="code-sm text-on-surface font-medium">
                      {t.title}
                    </span>
                    <span className="label-caps text-[9px] text-on-surface-variant/60">
                      {t.state}
                    </span>
                  </div>
                  {t.nextActions && (
                    <div className="text-[12px] text-on-surface-variant mt-1">
                      → {t.nextActions}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-surface-container-low border border-outline-variant rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Icon name="gavel" className="text-tertiary text-[18px]" />
            <h3 className="label-caps text-on-surface-variant">DECISIONS</h3>
          </div>
          {project.decisions.length === 0 ? (
            <p className="code-sm text-on-surface-variant/40">no decisions</p>
          ) : (
            <ul className="space-y-2">
              {project.decisions.map((d) => (
                <li key={d.id} className="text-[13px]">
                  <span className="text-on-surface">{d.title}</span>
                  <span className="code-sm text-on-surface-variant/40 ml-1">
                    {timeAgo(d.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-surface-container-low border border-outline-variant rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Icon name="history" className="text-primary text-[18px]" />
            <h3 className="label-caps text-on-surface-variant">RECENT_UPDATES</h3>
          </div>
          <ul className="space-y-2">
            {project.updates.slice(0, 8).map((u) => (
              <li key={u.id} className="text-[13px]">
                <div className="flex items-center gap-2">
                  <span
                    className={`label-caps text-[9px] ${categoryColor(u.category)}`}
                  >
                    {u.category}
                  </span>
                  <span className="code-sm text-[10px] text-on-surface-variant/40">
                    {timeAgo(u.createdAt)}
                  </span>
                </div>
                <div className="text-on-surface mt-1 line-clamp-2">
                  {u.title ?? u.body.slice(0, 200)}
                </div>
              </li>
            ))}
          </ul>
          <Link
            href={`/timeline?project=${project.slug}`}
            className="mt-4 inline-block label-caps text-primary"
          >
            VIEW_TIMELINE →
          </Link>
        </section>
      </div>
    </div>
  );
}
