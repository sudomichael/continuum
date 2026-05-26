// Free-tier enforcement.
//
// Free: 3 projects + 50 sessions/month
// Pro / team / self_hosted: unlimited (for now)
//
// "Session" = an /api/ingest call that actually persists an update. We
// record one UsageEvent per successful ingest, then count this month's
// events to enforce the cap. The same event row will later feed token-cost
// accounting once we wire metering.

import { prisma } from "./db";

export class TierLimitError extends Error {
  status = 402; // Payment Required is the standard "you hit a quota" code
  constructor(message: string, readonly detail: Record<string, unknown> = {}) {
    super(message);
    this.name = "TierLimitError";
  }
}

const FREE_PROJECT_CAP = 3;
const FREE_SESSIONS_PER_MONTH = 50;

function startOfMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function workspaceTier(workspaceId: string): Promise<string> {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { tier: true },
  });
  return ws?.tier ?? "free";
}

export async function enforceProjectLimit(workspaceId: string): Promise<void> {
  const tier = await workspaceTier(workspaceId);
  if (tier !== "free") return;

  const count = await prisma.project.count({ where: { workspaceId } });
  if (count >= FREE_PROJECT_CAP) {
    throw new TierLimitError(
      `Free tier is limited to ${FREE_PROJECT_CAP} projects. Archive an existing project or upgrade.`,
      { tier, current: count, limit: FREE_PROJECT_CAP },
    );
  }
}

export async function enforceSessionLimit(workspaceId: string): Promise<void> {
  const tier = await workspaceTier(workspaceId);
  if (tier !== "free") return;

  const since = startOfMonth();
  const count = await prisma.usageEvent.count({
    where: {
      workspaceId,
      kind: "session_ingested",
      createdAt: { gte: since },
    },
  });
  if (count >= FREE_SESSIONS_PER_MONTH) {
    throw new TierLimitError(
      `Free tier is limited to ${FREE_SESSIONS_PER_MONTH} sessions/month. ` +
        `You've ingested ${count} this month. Cap resets ${nextMonthLabel()}.`,
      { tier, current: count, limit: FREE_SESSIONS_PER_MONTH },
    );
  }
}

export async function recordSessionIngested(workspaceId: string): Promise<void> {
  await prisma.usageEvent.create({
    data: { workspaceId, kind: "session_ingested" },
  });
}

function nextMonthLabel(): string {
  const next = startOfMonth();
  next.setUTCMonth(next.getUTCMonth() + 1);
  return next.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
