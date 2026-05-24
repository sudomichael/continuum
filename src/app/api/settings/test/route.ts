// POST /api/settings/test — pings a tier config and returns ok/error + latency.
// Used by the "TEST_CONNECTION" buttons on the Settings page.
import { NextResponse } from "next/server";
import { z } from "zod";
import { pingTier } from "@/lib/ai";
import { getSettings } from "@/lib/settings";

const Body = z.object({
  tier: z.enum(["smart", "cheap"]),
  // Optional override — test these unsaved values without persisting first.
  provider: z.string().optional(),
  baseUrl: z.string().optional(),
  model: z.string().optional(),
  apiKey: z.string().optional(),
});

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
  const saved = await getSettings();
  const base = parsed.tier === "smart" ? saved.smart : saved.cheap;
  const config = {
    provider: parsed.provider ?? base.provider,
    baseUrl: parsed.baseUrl ?? base.baseUrl,
    model: parsed.model ?? base.model,
    apiKey: parsed.apiKey ?? base.apiKey,
  };
  if (!config.model) {
    return NextResponse.json(
      { ok: false, error: "No model configured." },
      { status: 200 },
    );
  }
  const result = await pingTier(config);
  return NextResponse.json(result);
}
