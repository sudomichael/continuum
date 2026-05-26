import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PROVIDERS, type ProviderId } from "@/lib/providers";
import { updateSettings } from "@/lib/settings";
import { requireCurrentWorkspaceId } from "@/lib/tenant";

// Onboarding writes BOTH tiers (smart + cheap) with the same provider/key.
// Power users split them later in /settings.

const Body = z.object({
  provider: z.enum(["anthropic", "openai", "ollama", "openrouter"]),
  apiKey: z.string().min(1).nullable(),
  // Optional — falls back to the provider's default model if missing.
  model: z.string().min(1).max(200).optional(),
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

  const preset = PROVIDERS[parsed.provider as ProviderId];
  if (preset.requiresKey && !parsed.apiKey) {
    return NextResponse.json(
      { error: `${preset.label} requires an API key.` },
      { status: 400 },
    );
  }

  const common = {
    provider: preset.id,
    baseUrl: preset.baseUrl,
    apiKey: parsed.apiKey, // null is fine for Ollama; updateSettings handles it
  };

  // Onboarding picks ONE model for both tiers. Power users split SMART/CHEAP
  // in /settings later. If the form didn't send a model, fall back to the
  // provider's recommended SMART default.
  const model = parsed.model ?? preset.defaultSmartModel;

  await updateSettings(workspaceId, {
    smart: { ...common, model },
    cheap: { ...common, model },
  });

  // Force the (app)/layout to re-render so the DEMO_MODE chip in AppShell
  // flips to SYSTEM_OPTIMAL immediately instead of waiting for a manual
  // refresh. "layout" scope busts both the layout and the page below it.
  revalidatePath("/", "layout");

  return NextResponse.json({ ok: true });
}
