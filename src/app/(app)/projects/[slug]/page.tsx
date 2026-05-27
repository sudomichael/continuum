import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireCurrentWorkspaceId } from "@/lib/tenant";
import { Icon } from "@/components/icon";
import { BrainSection } from "@/components/brain-section";
import { timeAgo, categoryColor } from "@/lib/format";
import { ResynthesizeButton } from "./resynth-button";
import { ProjectChat } from "./project-chat";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ slug: string }> };

// The project page is an "operational map" for one project — observational,
// ambient, oriented around rapid contextual rehydration. The reader has
// been away for weeks and wants to recognize where things stand, not be
// nagged about what to do next.

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
            <h1 className="font-display text-[32px] leading-[40px] tracking-[-0.02em] text-on-surface">
              {project.name}
            </h1>
            {project.identifier && (
              <div className="code-sm text-on-surface-variant/60 mt-1">
                {project.identifier}
              </div>
            )}
            {/* The dashboard preview line. Observational, not directive. */}
            {brain?.currentFocus && (
              <p className="text-on-surface-variant/80 text-[14px] mt-1 max-w-2xl">
                {brain.currentFocus}
              </p>
            )}
          </div>
        </div>

        <ResynthesizeButton slug={project.slug} />
      </div>

      {brain?.lastSynthesizedAt && (
        <div className="code-sm text-[11px] text-on-surface-variant/50 -mt-2">
          last synthesis: {timeAgo(brain.lastSynthesizedAt)}
          {brain.synthesisModel ? ` · ${brain.synthesisModel}` : ""}
        </div>
      )}

      {/* Operational sections — in rehydration order. */}
      <div className="space-y-4">
        <BrainSection
          icon="public"
          title="Current state"
          content={brain?.currentState}
          empty="No synthesis yet. Run a Claude Code session here, or click Re-synthesize."
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <BrainSection
            icon="update"
            title="What changed recently"
            content={brain?.whatChangedRecently}
          />
          <BrainSection
            icon="explore"
            title="Current direction"
            content={brain?.currentDirection}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <BrainSection
            icon="account_tree"
            title="Architecture snapshot"
            content={brain?.architectureSnapshot}
          />
          <BrainSection
            icon="forum"
            title="Open threads"
            content={brain?.openThreads}
          />
        </div>
      </div>

      {/* Deep context — collapsed by default visually via a divider + softer
          treatment. These are the raw historical artifacts; the synthesis
          above is the actual product. */}
      <details className="rounded-lg border border-outline-variant bg-surface-container-low">
        <summary className="cursor-pointer px-4 py-3 label-caps text-on-surface-variant select-none">
          Deep context — work threads, decisions, recent updates
        </summary>
        <div className="border-t border-outline-variant/40 grid grid-cols-1 lg:grid-cols-3 gap-4 p-4">
          <section>
            <h3 className="label-caps text-on-surface-variant mb-2">
              Active work threads
            </h3>
            {project.threads.length === 0 ? (
              <p className="code-sm text-on-surface-variant/40">none</p>
            ) : (
              <ul className="space-y-3">
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
                        {t.nextActions}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="label-caps text-on-surface-variant mb-2">
              Decisions
            </h3>
            {project.decisions.length === 0 ? (
              <p className="code-sm text-on-surface-variant/40">none</p>
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

          <section>
            <h3 className="label-caps text-on-surface-variant mb-2">
              Recent updates
            </h3>
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
              className="mt-3 inline-block label-caps text-[10px] text-primary"
            >
              View full timeline →
            </Link>
          </section>
        </div>
      </details>

      <ProjectChat slug={project.slug} />
    </div>
  );
}
