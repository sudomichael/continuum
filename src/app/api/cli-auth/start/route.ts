// POST /api/cli-auth/start
//
// Called by the CLI to begin a device-pairing session. No auth required —
// holding the resulting code is the only credential. The session is short-
// lived (10 min) and single-use.
//
// Response:
//   { code, authUrl, expiresAt }

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { makeCode, PAIRING_TTL_MS } from "@/lib/cli-auth";

const Body = z.object({
  platform: z.string().min(1).max(80).optional(),
});

export async function POST(req: Request) {
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json().catch(() => ({})));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }

  const code = makeCode();
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);

  await prisma.cliPairing.create({
    data: { code, platform: parsed.platform ?? null, expiresAt },
  });

  // The CLI uses the request origin to know where to send the browser.
  // Falls back to CONTINUUM_URL env in case the request came over an odd
  // proxy that mangled the Host header.
  const origin =
    req.headers.get("origin") ??
    req.headers.get("x-forwarded-host")
      ? `${req.headers.get("x-forwarded-proto") ?? "https"}://${req.headers.get("x-forwarded-host")}`
      : new URL(req.url).origin;
  const baseUrl = (process.env.CONTINUUM_URL || origin).replace(/\/+$/, "");
  const authUrl = `${baseUrl}/cli-auth?code=${encodeURIComponent(code)}`;

  return NextResponse.json({
    code,
    authUrl,
    expiresAt: expiresAt.toISOString(),
  });
}
