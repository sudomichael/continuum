// POST /api/cli-auth/revoke
//
// Used by /settings to nuke a paired device. Hooks running on that machine
// will get 401 from /api/ingest on their next call.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const Body = z.object({ id: z.string().min(1) });

export async function POST(req: Request) {
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
  await prisma.cliToken.deleteMany({ where: { id: parsed.id } });
  return NextResponse.json({ ok: true });
}
