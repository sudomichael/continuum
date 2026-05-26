// Tenancy resolution + helpers.
//
// In **self-host mode** (default), there is exactly one Workspace named
// "personal", auto-created by bootstrap.ts. Every route resolves the
// current workspace to that one.
//
// In **cloud mode** (`CONTINUUM_MULTI_TENANT=1`), the workspace is
// resolved from the request:
//   - Web requests:  Clerk session → User → first Workspace membership
//   - CLI requests:  X-Continuum-Token → CliToken.workspaceId
//
// Routes call `currentWorkspaceId()` once at the top and pass it into
// queries. The Prisma client is NOT yet wrapped in an extension that
// auto-injects the filter — we do it explicitly in queries to keep the
// surface area small and reviewable. We can add the extension later
// once query patterns stabilize.

import { prisma } from "./db";

export const SELF_HOST_WORKSPACE_SLUG = "personal";

export function isMultiTenantMode(): boolean {
  return (
    process.env.CONTINUUM_MULTI_TENANT === "1" ||
    process.env.CONTINUUM_MULTI_TENANT === "true"
  );
}

// Self-host: the one and only workspace. Cached after first call since it
// never changes for the lifetime of the process.
let cachedSelfHostWorkspaceId: string | null = null;

export async function getSelfHostWorkspaceId(): Promise<string> {
  if (cachedSelfHostWorkspaceId) return cachedSelfHostWorkspaceId;
  const ws = await prisma.workspace.findUnique({
    where: { slug: SELF_HOST_WORKSPACE_SLUG },
    select: { id: true },
  });
  if (!ws) {
    throw new Error(
      `Self-host workspace not found. Did bootstrap.ts run? Looking for slug=${SELF_HOST_WORKSPACE_SLUG}.`,
    );
  }
  cachedSelfHostWorkspaceId = ws.id;
  return ws.id;
}

// requireCurrentWorkspaceId is the resolver for web requests. In self-host
// mode it always returns the singleton workspace. In cloud mode (later) it
// reads the Clerk session, looks up the user's first workspace membership,
// and returns that id. Throws if no workspace is resolvable — routes that
// hit this without a valid session should already be blocked by the proxy.
export async function requireCurrentWorkspaceId(): Promise<string> {
  if (!isMultiTenantMode()) {
    return getSelfHostWorkspaceId();
  }
  // Cloud mode: resolve from Clerk. Wired up in Phase 2.
  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Unauthenticated request reached requireCurrentWorkspaceId");
  }
  const user = await prisma.user.findUnique({
    where: { externalId: userId },
    select: { memberships: { select: { workspaceId: true }, take: 1 } },
  });
  if (!user || user.memberships.length === 0) {
    throw new Error(`User ${userId} has no workspace yet — webhook may have lagged`);
  }
  return user.memberships[0].workspaceId;
}
