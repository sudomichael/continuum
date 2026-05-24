import Link from "next/link";
import { prisma } from "@/lib/db";
import { Icon } from "@/components/icon";
import { StatusPip } from "@/components/status-pip";
import { timeAgo } from "@/lib/format";
import { NewProjectForm } from "./new-project-form";

export const dynamic = "force-dynamic";

export default async function ProjectsListPage() {
  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { updates: true } }, brain: true },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-[32px] leading-[40px] tracking-[-0.02em] text-on-surface">
            Projects
          </h1>
          <p className="code-md text-on-surface-variant/70 mt-1">
            Register a node so Continuum can ingest its sessions.
          </p>
        </div>
      </div>

      <NewProjectForm />

      <div className="border border-outline-variant rounded-lg bg-surface-container-lowest overflow-hidden">
        <div className="grid grid-cols-[1.5fr_120px_1fr_120px_120px_100px] bg-surface-container-high border-b border-outline-variant px-4 py-2">
          <div className="label-caps text-on-surface-variant">PROJECT</div>
          <div className="label-caps text-on-surface-variant text-center">STATE</div>
          <div className="label-caps text-on-surface-variant">CWD</div>
          <div className="label-caps text-on-surface-variant text-center">UPDATES</div>
          <div className="label-caps text-on-surface-variant text-right">LAST_SYN</div>
          <div className="label-caps text-on-surface-variant text-right">ACTION</div>
        </div>
        <div className="divide-y divide-outline-variant/30">
          {projects.length === 0 && (
            <div className="p-10 text-center text-on-surface-variant/60 text-[13px]">
              No projects yet. Add one above.
            </div>
          )}
          {projects.map((p) => (
            <div
              key={p.id}
              className="grid grid-cols-[1.5fr_120px_1fr_120px_120px_100px] px-4 py-2 items-center hover:bg-surface-variant/30 transition-colors"
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
                    {p.slug}
                  </span>
                </div>
              </div>
              <div className="flex justify-center">
                <StatusPip state={p.state} />
              </div>
              <div className="code-sm text-on-surface-variant/70 truncate">
                {p.cwd ?? "—"}
              </div>
              <div className="text-center code-sm text-on-surface-variant">
                {p._count.updates}
              </div>
              <div className="text-right code-sm text-on-surface-variant/60">
                {timeAgo(p.brain?.lastSynthesizedAt)}
              </div>
              <div className="flex justify-end">
                <Link
                  href={`/projects/${p.slug}`}
                  className="label-caps text-primary px-2 py-1 border border-primary/30 rounded"
                >
                  OPEN
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
