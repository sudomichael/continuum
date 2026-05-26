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
// mode it always returns the singleton workspace. In cloud mode it reads
// the Clerk session, looks up the user's first workspace, and returns that
// id — provisioning one lazily if the Clerk webhook hasn't fired yet (or
// isn't configured). Throws only when there's no Clerk user.
export async function requireCurrentWorkspaceId(): Promise<string> {
  if (!isMultiTenantMode()) {
    return getSelfHostWorkspaceId();
  }

  const { auth, currentUser } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Unauthenticated request reached requireCurrentWorkspaceId");
  }

  // Fast path: existing membership.
  const existing = await prisma.user.findUnique({
    where: { externalId: userId },
    select: { memberships: { select: { workspaceId: true }, take: 1 } },
  });
  if (existing && existing.memberships.length > 0) {
    return existing.memberships[0].workspaceId;
  }

  // Slow path: webhook hasn't fired yet (or isn't configured). Provision
  // the User + Workspace + Membership inline. Idempotent against concurrent
  // requests via the externalId unique constraint.
  return provisionWorkspaceForClerkUser(userId, currentUser);
}

async function provisionWorkspaceForClerkUser(
  externalId: string,
  // Lazy import shape — accepting the function so tests can pass a stub.
  fetchUser: () => Promise<{
    emailAddresses?: { emailAddress: string }[];
    firstName?: string | null;
    lastName?: string | null;
    imageUrl?: string;
  } | null>,
): Promise<string> {
  const u = await fetchUser();
  const email = u?.emailAddresses?.[0]?.emailAddress ?? null;
  const name =
    [u?.firstName, u?.lastName].filter(Boolean).join(" ").trim() || null;

  // Upsert User idempotently — concurrent first-requests both succeed.
  const user = await prisma.user.upsert({
    where: { externalId },
    update: { email, name, imageUrl: u?.imageUrl ?? null },
    create: {
      externalId,
      email,
      name,
      imageUrl: u?.imageUrl ?? null,
    },
    select: {
      id: true,
      memberships: { select: { workspaceId: true }, take: 1 },
    },
  });
  if (user.memberships.length > 0) {
    return user.memberships[0].workspaceId;
  }

  // No membership yet — create a workspace.
  const baseSlug =
    (email
      ? email.split("@")[0].toLowerCase().replace(/[^a-z0-9]+/g, "-")
      : externalId.slice(0, 8)) || "workspace";
  let slug = baseSlug;
  let n = 2;
  while (await prisma.workspace.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${n++}`;
    if (n > 50) {
      slug = `${baseSlug}-${Date.now().toString(36)}`;
      break;
    }
  }
  const ws = await prisma.workspace.create({
    data: {
      slug,
      name: name ?? email ?? "Workspace",
      tier: "free",
      // Same OpenAI default as the Clerk webhook path — see
      // src/app/api/clerk-webhook/route.ts for the why.
      settings: {
        create: {
          smartProvider: "openai",
          smartBaseUrl: "https://api.openai.com/v1",
          smartModel: "gpt-4o",
          cheapProvider: "openai",
          cheapBaseUrl: "https://api.openai.com/v1",
          cheapModel: "gpt-4o-mini",
        },
      },
      members: {
        create: { user: { connect: { id: user.id } }, role: "owner" },
      },
    },
    select: { id: true },
  });
  return ws.id;
}
