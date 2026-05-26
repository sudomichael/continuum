// POST /api/cli-auth/authorize
//
// Called from the /cli-auth page when the logged-in user clicks "Authorize".
// Looks up the pairing by code, mints a long-lived CLI token, persists the
// hash on CliToken, stuffs the raw token onto the pairing row for the CLI's
// next poll to pick up.
//
// Requires a valid session cookie (the middleware/proxy already enforces this
// on every page-and-API path under /api/* except the public ones).

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashToken, makeToken } from "@/lib/cli-auth";
import { requireCurrentWorkspaceId } from "@/lib/tenant";

const Body = z.object({
  code: z.string().min(8).max(64),
  // Optional friendly name for the device; defaults to platform string.
  name: z.string().min(1).max(80).optional(),
});

export async function POST(req: Request) {
  // The user clicking "Authorize" is already signed in (proxy enforces).
  // Whatever workspace they're currently in is the workspace the new CLI
  // device gets bound to.
  const workspaceId = await requireCurrentWorkspaceId();

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }

  const pairing = await prisma.cliPairing.findUnique({
    where: { code: parsed.code },
  });
  if (!pairing) {
    return NextResponse.json(
      { error: "Pairing code not found." },
      { status: 404 },
    );
  }
  if (pairing.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "Pairing code expired. Re-run the CLI command." },
      { status: 410 },
    );
  }
  if (pairing.authorized) {
    return NextResponse.json(
      { error: "Already authorized." },
      { status: 409 },
    );
  }

  const token = makeToken();
  const tokenHash = hashToken(token);
  const displayName =
    parsed.name?.trim() ||
    pairing.platform ||
    `cli-device-${pairing.id.slice(0, 6)}`;

  const cli = await prisma.cliToken.create({
    data: {
      workspaceId,
      tokenHash,
      name: displayName,
      platform: pairing.platform,
    },
  });

  await prisma.cliPairing.update({
    where: { id: pairing.id },
    data: { authorized: true, token, tokenId: cli.id, workspaceId },
  });

  return NextResponse.json({ ok: true, device: { id: cli.id, name: displayName } });
}
