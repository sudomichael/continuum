// Backfill Project.updatedAt from MAX(updates.createdAt).
//
// Run-once chore. After this commit, /api/ingest and /api/capture bump
// Project.updatedAt on every write — but rows that ingested BEFORE that
// commit have a stale updatedAt (whatever auto-register stamped). This
// reads the actual last-activity timestamp per project and writes it back.
//
// Safe to re-run; idempotent. No-op for projects with no updates.

import { prisma } from "../src/lib/db";

async function main() {
  const projects = await prisma.project.findMany({
    select: {
      id: true,
      slug: true,
      updatedAt: true,
    },
  });

  let touched = 0;
  for (const p of projects) {
    const latest = await prisma.update.findFirst({
      where: { projectId: p.id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (!latest) continue;
    if (latest.createdAt.getTime() === p.updatedAt.getTime()) continue;
    await prisma.project.update({
      where: { id: p.id },
      data: { updatedAt: latest.createdAt },
    });
    touched++;
    process.stdout.write(
      `\x1b[36m[backfill]\x1b[0m ${p.slug} ← ${latest.createdAt.toISOString()}\n`,
    );
  }
  process.stdout.write(
    `\x1b[36m[backfill]\x1b[0m done — ${touched} of ${projects.length} project(s) updated\n`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
