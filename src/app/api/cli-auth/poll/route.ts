// GET /api/cli-auth/poll?code=...
//
// CLI polls this every couple seconds while the pairing is open. Returns:
//   { status: "pending" }                              while waiting
//   { status: "authorized", token, tokenId, name }     once user clicks Yes
//   { status: "expired" }                              past expiresAt
//
// On a successful read, the pairing row is deleted so the token can't be
// fetched twice. No auth — holding the code is the credential.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "Missing code." }, { status: 400 });
  }

  const pairing = await prisma.cliPairing.findUnique({ where: { code } });
  if (!pairing) {
    return NextResponse.json({ status: "expired" }, { status: 200 });
  }
  if (pairing.expiresAt < new Date()) {
    await prisma.cliPairing.delete({ where: { id: pairing.id } }).catch(() => {});
    return NextResponse.json({ status: "expired" }, { status: 200 });
  }
  if (!pairing.authorized || !pairing.token || !pairing.tokenId) {
    return NextResponse.json({ status: "pending" }, { status: 200 });
  }

  const token = pairing.token;
  const tokenId = pairing.tokenId;
  const name =
    (await prisma.cliToken.findUnique({ where: { id: tokenId } }))?.name ?? null;

  // Single-use: drop the pairing row now that the CLI has the token.
  await prisma.cliPairing.delete({ where: { id: pairing.id } });

  return NextResponse.json({
    status: "authorized",
    token,
    tokenId,
    name,
  });
}
