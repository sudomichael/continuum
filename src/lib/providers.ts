// Provider presets for Continuum's two-tier model config.
//
// Almost every modern provider speaks the OpenAI Chat Completions API, so the
// only special case is Anthropic (which has its own SDK and native messages
// API). For everything else, we point the OpenAI SDK at a different baseURL.

export type ProviderId =
  | "anthropic"
  | "openai"
  | "ollama"
  | "openrouter"
  | "custom";

export type ProviderPreset = {
  id: ProviderId;
  label: string;
  baseUrl: string;
  // Default model to pre-fill on each tier; user can override.
  defaultSmartModel: string;
  defaultCheapModel: string;
  // Whether this provider requires an API key. Local providers like Ollama don't.
  requiresKey: boolean;
  notes?: string;
};

export const PROVIDERS: Record<ProviderId, ProviderPreset> = {
  anthropic: {
    id: "anthropic",
    label: "Anthropic (Claude)",
    baseUrl: "https://api.anthropic.com",
    defaultSmartModel: "claude-sonnet-4-6",
    defaultCheapModel: "claude-haiku-4-5",
    requiresKey: true,
    notes: "Top-quality synthesis. Uses the native Anthropic SDK.",
  },
  openai: {
    id: "openai",
    label: "OpenAI (GPT)",
    baseUrl: "https://api.openai.com/v1",
    defaultSmartModel: "gpt-4o",
    defaultCheapModel: "gpt-4o-mini",
    requiresKey: true,
  },
  ollama: {
    id: "ollama",
    label: "Ollama (local)",
    baseUrl: "http://localhost:11434/v1",
    defaultSmartModel: "llama3.3:70b",
    defaultCheapModel: "llama3.2:3b",
    requiresKey: false,
    notes: "Run models locally. No API cost. Slower; quality varies by model.",
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultSmartModel: "anthropic/claude-sonnet-4.5",
    defaultCheapModel: "meta-llama/llama-3.3-70b-instruct",
    requiresKey: true,
    notes: "One key, 100+ models including OSS and proprietary.",
  },
  custom: {
    id: "custom",
    label: "Custom (OpenAI-compatible)",
    baseUrl: "http://localhost:8080/v1",
    defaultSmartModel: "",
    defaultCheapModel: "",
    requiresKey: false,
    notes:
      "Point at any OpenAI-compatible endpoint (vLLM, llama-cpp-server, LM Studio, Groq, Together, DeepSeek, …).",
  },
};

export function getPreset(id: string): ProviderPreset {
  return PROVIDERS[id as ProviderId] ?? PROVIDERS.custom;
}

export function isAnthropic(providerId: string): boolean {
  return providerId === "anthropic";
}
