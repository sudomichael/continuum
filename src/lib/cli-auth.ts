// Helpers for the CLI device-pairing flow.
//
// Flow:
//   1. CLI POSTs /api/cli-auth/start with { platform } → server creates
//      a CliPairing row, returns { code, authUrl, expiresAt }.
//   2. CLI opens authUrl in the user's browser.
//   3. User (already logged in) sees a confirmation page → POSTs
//      /api/cli-auth/authorize → server flips authorized=true, mints a
//      long-lived token, persists the sha256 hash in CliToken, stores
//      the raw token on the pairing row for the CLI to fetch.
//   4. CLI polls /api/cli-auth/poll?code=... → once authorized, returns
//      { token, tokenId }. Pairing row is then deleted.
//
// Token format: 32 random bytes, base64url. Stored as sha256 hex on
// CliToken.tokenHash; never persisted in cleartext past the polling
// window.

import { createHash, randomBytes } from "node:crypto";

export function makeCode(): string {
  // 16 bytes → 22 base64url chars, plenty unguessable.
  return randomBytes(16)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function makeToken(): string {
  return randomBytes(32)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Pairing rows live for 10 minutes before the CLI must give up.
export const PAIRING_TTL_MS = 10 * 60 * 1000;

// Verify a token from an X-Continuum-Token header against (a) the legacy
// shared secret in CONTINUUM_TOKEN env, and (b) per-device CLI tokens stored
// in the DB. Returns the workspaceId the token is authorized for, so
// callers can scope every subsequent query.
//
// In self-host mode, the legacy shared secret implicitly resolves to the
// singleton "personal" workspace. CLI tokens always carry their own
// workspaceId since they're issued per-pairing.
type TokenAuthResult =
  | { ok: false }
  | { ok: true; kind: "shared"; workspaceId: string }
  | { ok: true; kind: "cli"; tokenId: string; workspaceId: string };

export async function verifyTokenHeader(
  raw: string | null | undefined,
): Promise<TokenAuthResult> {
  if (!raw) return { ok: false };
  const got = raw.trim();
  if (!got) return { ok: false };

  const shared = process.env.CONTINUUM_TOKEN;
  if (shared && got === shared) {
    // Legacy shared secret only exists in self-host mode. Map to the
    // singleton workspace so route handlers don't need to special-case.
    const { getSelfHostWorkspaceId } = await import("./tenant");
    const workspaceId = await getSelfHostWorkspaceId();
    return { ok: true, kind: "shared", workspaceId };
  }

  // CLI device tokens: stored as sha256 hex. Looked up by hash, returning
  // the workspaceId the device was paired against.
  const { prisma } = await import("./db");
  const hash = hashToken(got);
  const row = await prisma.cliToken.findUnique({
    where: { tokenHash: hash },
    select: { id: true, workspaceId: true },
  });
  if (!row) return { ok: false };

  // Async best-effort touch; don't block on it.
  prisma.cliToken
    .update({ where: { id: row.id }, data: { lastSeenAt: new Date() } })
    .catch(() => {});

  return { ok: true, kind: "cli", tokenId: row.id, workspaceId: row.workspaceId };
}
