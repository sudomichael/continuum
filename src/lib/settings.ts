import { prisma } from "./db";
import { decrypt, encrypt } from "./crypto";
import { getPreset } from "./providers";

export type TierConfig = {
  provider: string; // ProviderId
  baseUrl: string;
  model: string;
  apiKey: string | null;
};

export type ResolvedSettings = {
  smart: TierConfig;
  cheap: TierConfig;
};

function resolveKey(cipher: string | null, envFallback?: string): string | null {
  if (cipher) {
    try {
      return decrypt(cipher);
    } catch {
      // fall through to env
    }
  }
  return envFallback?.trim() ? envFallback : null;
}

export async function getSettings(workspaceId: string): Promise<ResolvedSettings> {
  const row = await prisma.settings.upsert({
    where: { workspaceId },
    update: {},
    create: { workspaceId },
  });

  // Env fallbacks: per-provider keys, then a generic ANTHROPIC/OPENAI key.
  const anthropicEnv = process.env.ANTHROPIC_API_KEY;
  const openaiEnv = process.env.OPENAI_API_KEY;

  function envFallbackFor(provider: string): string | undefined {
    if (provider === "anthropic") return anthropicEnv;
    if (provider === "openai") return openaiEnv;
    return undefined;
  }

  return {
    smart: {
      provider: row.smartProvider,
      baseUrl: row.smartBaseUrl,
      model: row.smartModel,
      apiKey: resolveKey(row.smartKeyCipher, envFallbackFor(row.smartProvider)),
    },
    cheap: {
      provider: row.cheapProvider,
      baseUrl: row.cheapBaseUrl,
      model: row.cheapModel,
      apiKey: resolveKey(row.cheapKeyCipher, envFallbackFor(row.cheapProvider)),
    },
  };
}

export type TierUpdate = {
  provider?: string;
  baseUrl?: string;
  model?: string;
  apiKey?: string | null; // null clears; undefined leaves alone
};

export async function updateSettings(
  workspaceId: string,
  input: {
    smart?: TierUpdate;
    cheap?: TierUpdate;
  },
) {
  const data: Record<string, string | null> = {};

  if (input.smart) {
    if (input.smart.provider !== undefined)
      data.smartProvider = input.smart.provider;
    if (input.smart.baseUrl !== undefined)
      data.smartBaseUrl = input.smart.baseUrl;
    if (input.smart.model !== undefined) data.smartModel = input.smart.model;
    if (input.smart.apiKey !== undefined) {
      data.smartKeyCipher = input.smart.apiKey ? encrypt(input.smart.apiKey) : null;
    }
  }
  if (input.cheap) {
    if (input.cheap.provider !== undefined)
      data.cheapProvider = input.cheap.provider;
    if (input.cheap.baseUrl !== undefined)
      data.cheapBaseUrl = input.cheap.baseUrl;
    if (input.cheap.model !== undefined) data.cheapModel = input.cheap.model;
    if (input.cheap.apiKey !== undefined) {
      data.cheapKeyCipher = input.cheap.apiKey ? encrypt(input.cheap.apiKey) : null;
    }
  }

  await prisma.settings.upsert({
    where: { workspaceId },
    update: data,
    create: { workspaceId, ...data },
  });
}

// Whether the configured provider/model is actually usable right now —
// answers the "should we fall back to demo mode?" question.
export function tierUsable(t: TierConfig): boolean {
  if (!t.model) return false;
  const preset = getPreset(t.provider);
  if (preset.requiresKey && !t.apiKey) return false;
  return true;
}
