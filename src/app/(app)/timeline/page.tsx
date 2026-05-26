import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireCurrentWorkspaceId } from "@/lib/tenant";
import { Icon } from "@/components/icon";
import { timeAgo, categoryColor } from "@/lib/format";

export const dynamic = "force-dynamic";

const CATEGORIES = [
  "all",
  "session",
  "decision",
  "blocker",
  "architecture",
  "idea",
  "progress",
  "next_action",
];

type SearchParams = Promise<{ category?: string; project?: string }>;

export default async function TimelinePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const cat = sp.category && sp.category !== "all" ? sp.category : undefined;
  const slug = sp.project;
  const workspaceId = await requireCurrentWorkspaceId();

  const project = slug
    ? await prisma.project.findUnique({
        where: { workspaceId_slug: { workspaceId, slug } },
      })
    : null;

  const updates = await prisma.update.findMany({
    where: {
      project: { workspaceId },
      ...(cat ? { category: cat } : {}),
      ...(project ? { projectId: project.id } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { project: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[32px] leading-[40px] tracking-[-0.02em] text-on-surface">
          Timeline
        </h1>
        <p className="code-md text-on-surface-variant/70 mt-1">
          Chronological operational memory stream.
          {project && (
            <>
              {" "}
              <span className="text-primary">[{project.name}]</span>
            </>
          )}
        </p>
      </div>

      <div className="flex flex-wrap gap-1">
        {CATEGORIES.map((c) => {
          const active = (sp.category ?? "all") === c;
          const query = new URLSearchParams();
          if (c !== "all") query.set("category", c);
          if (slug) query.set("project", slug);
          const href = `/timeline${query.toString() ? `?${query}` : ""}`;
          return (
            <Link
              key={c}
              href={href}
              className={`label-caps px-2 py-1 rounded border ${
                active
                  ? "bg-primary text-on-primary border-primary"
                  : "border-outline-variant text-on-surface-variant hover:bg-surface-variant"
              }`}
            >
              {c}
            </Link>
          );
        })}
      </div>

      <div className="border border-outline-variant rounded-lg bg-surface-container-lowest overflow-hidden">
        {updates.length === 0 ? (
          <div className="p-10 text-center text-on-surface-variant/60 text-[13px]">
            No updates yet. Try Quick Capture (CMD+K) or wire up the Claude Code
            hook.
          </div>
        ) : (
          <ul className="divide-y divide-outline-variant/30">
            {updates.map((u) => (
              <li
                key={u.id}
                className="px-4 py-2 hover:bg-surface-variant/20 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`label-caps text-[10px] ${categoryColor(u.category)}`}
                  >
                    {u.category}
                  </span>
                  <Link
                    href={`/projects/${u.project.slug}`}
                    className="code-sm text-[11px] text-primary hover:underline"
                  >
                    [{u.project.name}]
                  </Link>
                  <span className="code-sm text-[10px] text-on-surface-variant/50 ml-auto flex items-center gap-1">
                    <Icon
                      name={u.source === "claude_code" ? "terminal" : u.source === "codex" ? "terminal" : "edit_note"}
                      className="text-[12px]"
                    />
                    {u.source} · {timeAgo(u.createdAt)}
                  </span>
                </div>
                <div className="text-on-surface text-[14px] whitespace-pre-wrap">
                  {u.title && (
                    <span className="font-medium">{u.title}</span>
                  )}
                  {u.title && u.body && <br />}
                  <span className="text-on-surface-variant">
                    {u.body.slice(0, 600)}
                    {u.body.length > 600 ? "…" : ""}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
