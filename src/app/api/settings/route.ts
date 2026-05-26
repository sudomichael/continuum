import { NextResponse } from "next/server";
import { z } from "zod";
import { getSettings, updateSettings } from "@/lib/settings";
import { PROVIDERS } from "@/lib/providers";
import { requireCurrentWorkspaceId } from "@/lib/tenant";

export async function GET() {
  const workspaceId = await requireCurrentWorkspaceId();
  const s = await getSettings(workspaceId);
  return NextResponse.json({
    smart: {
      provider: s.smart.provider,
      baseUrl: s.smart.baseUrl,
      model: s.smart.model,
      keyConfigured: Boolean(s.smart.apiKey),
    },
    cheap: {
      provider: s.cheap.provider,
      baseUrl: s.cheap.baseUrl,
      model: s.cheap.model,
      keyConfigured: Boolean(s.cheap.apiKey),
    },
    presets: Object.values(PROVIDERS).map((p) => ({
      id: p.id,
      label: p.label,
      baseUrl: p.baseUrl,
      defaultSmartModel: p.defaultSmartModel,
      defaultCheapModel: p.defaultCheapModel,
      requiresKey: p.requiresKey,
      notes: p.notes,
    })),
  });
}

const TierInput = z.object({
  provider: z.string().optional(),
  baseUrl: z.string().optional(),
  model: z.string().optional(),
  apiKey: z.string().nullable().optional(),
});

const Body = z.object({
  smart: TierInput.optional(),
  cheap: TierInput.optional(),
});

export async function POST(req: Request) {
  const workspaceId = await requireCurrentWorkspaceId();
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "Invalid body", detail: String(e) },
      { status: 400 },
    );
  }
  try {
    await updateSettings(workspaceId, parsed);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
