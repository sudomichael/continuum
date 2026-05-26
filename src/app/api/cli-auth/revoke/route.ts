// POST /api/cli-auth/revoke
//
// Used by /settings to nuke a paired device. Hooks running on that machine
// will get 401 from /api/ingest on their next call. Scoped to the current
// workspace — a user can only revoke their own devices.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCurrentWorkspaceId } from "@/lib/tenant";

const Body = z.object({ id: z.string().min(1) });

export async function POST(req: Request) {
  const workspaceId = await requireCurrentWorkspaceId();
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
  await prisma.cliToken.deleteMany({
    where: { id: parsed.id, workspaceId },
  });
  return NextResponse.json({ ok: true });
}
