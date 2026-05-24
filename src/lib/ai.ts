import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { getSettings, tierUsable, type TierConfig } from "./settings";
import { demoComplete } from "./demo-provider";
import { isAnthropic } from "./providers";

export type ChatMessage = { role: "user" | "assistant"; content: string };

// SMART = brain synthesis (low volume, strategic).
// CHEAP = session summarization + capture classification (high volume).
export type Tier = "smart" | "cheap";

function isDemoMode(anyUsable: boolean): boolean {
  if (process.env.DEMO_MODE === "1" || process.env.DEMO_MODE === "true")
    return true;
  return !anyUsable;
}

export async function complete(opts: {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  jsonResponse?: boolean;
  tier?: Tier;
}): Promise<string> {
  const s = await getSettings();
  const requested: Tier = opts.tier ?? "smart";

  const smartOk = tierUsable(s.smart);
  const cheapOk = tierUsable(s.cheap);

  if (isDemoMode(smartOk || cheapOk)) {
    return demoComplete({ system: opts.system, messages: opts.messages });
  }

  // Pick the requested tier if usable; otherwise fall back to the other one.
  const tierConfig =
    requested === "smart"
      ? smartOk
        ? s.smart
        : s.cheap
      : cheapOk
        ? s.cheap
        : s.smart;

  return callProvider(tierConfig, opts);
}

async function callProvider(
  tier: TierConfig,
  opts: {
    system: string;
    messages: ChatMessage[];
    maxTokens?: number;
    jsonResponse?: boolean;
  },
): Promise<string> {
  if (isAnthropic(tier.provider)) {
    return anthropicCall(tier, opts);
  }
  return openaiCompatibleCall(tier, opts);
}

async function anthropicCall(
  tier: TierConfig,
  opts: { system: string; messages: ChatMessage[]; maxTokens?: number },
): Promise<string> {
  const client = new Anthropic({
    apiKey: tier.apiKey ?? "",
    baseURL: tier.baseUrl || undefined,
  });
  const r = await client.messages.create({
    model: tier.model,
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.system,
    messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
  });
  return r.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

async function openaiCompatibleCall(
  tier: TierConfig,
  opts: {
    system: string;
    messages: ChatMessage[];
    maxTokens?: number;
    jsonResponse?: boolean;
  },
): Promise<string> {
  // Many local providers (Ollama, llama-cpp-server) don't require a key.
  // OpenAI SDK insists on a non-empty string, so we send a placeholder.
  const client = new OpenAI({
    apiKey: tier.apiKey || "no-key-needed",
    baseURL: tier.baseUrl,
  });

  // Only set response_format on providers that we know support it (OpenAI proper).
  // Local servers like Ollama will 400 on it.
  const wantJson = opts.jsonResponse && tier.provider === "openai";

  const r = await client.chat.completions.create({
    model: tier.model,
    messages: [
      { role: "system", content: opts.system },
      ...opts.messages.map((m) => ({ role: m.role, content: m.content })),
    ],
    response_format: wantJson ? { type: "json_object" } : undefined,
    max_completion_tokens: opts.maxTokens ?? 4096,
  });
  return (r.choices[0]?.message?.content ?? "").trim();
}

export async function activeModelName(tier: Tier = "smart"): Promise<string> {
  const s = await getSettings();
  const smartOk = tierUsable(s.smart);
  const cheapOk = tierUsable(s.cheap);
  if (isDemoMode(smartOk || cheapOk)) return "demo";
  if (tier === "smart") return smartOk ? s.smart.model : s.cheap.model;
  return cheapOk ? s.cheap.model : s.smart.model;
}

// Health check: send a tiny prompt and time the response.
export async function pingTier(tier: TierConfig): Promise<{
  ok: boolean;
  latencyMs?: number;
  error?: string;
  text?: string;
}> {
  const t0 = Date.now();
  try {
    const text = await callProvider(tier, {
      system: "You are a connectivity test. Reply with exactly: ok",
      messages: [{ role: "user", content: "ping" }],
      maxTokens: 16,
    });
    return { ok: true, latencyMs: Date.now() - t0, text };
  } catch (e) {
    return {
      ok: false,
      latencyMs: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
