"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type ProviderId = "anthropic" | "openai" | "ollama" | "openrouter";

type ProviderChoice = {
  id: ProviderId;
  label: string;
  requiresKey: boolean;
  hint: string;
  defaultModel: string;
  // Popular model presets the user can click to fill in.
  commonModels: { id: string; label: string }[];
};

const CHOICES: ProviderChoice[] = [
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    requiresKey: true,
    hint: "Best quality. Get a key at console.anthropic.com.",
    defaultModel: "claude-sonnet-4-6",
    commonModels: [
      { id: "claude-opus-4-7", label: "Opus 4.7 — best, expensive" },
      { id: "claude-sonnet-4-6", label: "Sonnet 4.6 — recommended" },
      { id: "claude-haiku-4-5", label: "Haiku 4.5 — fast + cheap" },
    ],
  },
  {
    id: "openai",
    label: "OpenAI (GPT)",
    requiresKey: true,
    hint: "Get a key at platform.openai.com.",
    defaultModel: "gpt-4o",
    commonModels: [
      { id: "gpt-4o", label: "GPT-4o — recommended" },
      { id: "gpt-4o-mini", label: "GPT-4o mini — fast + cheap" },
      { id: "o1", label: "o1 — reasoning, slow" },
    ],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    requiresKey: true,
    hint: "One key, 100+ models. openrouter.ai.",
    defaultModel: "anthropic/claude-sonnet-4.5",
    commonModels: [
      { id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5" },
      { id: "openai/gpt-4o", label: "GPT-4o" },
      { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B — OSS" },
      { id: "deepseek/deepseek-chat", label: "DeepSeek — cheap" },
    ],
  },
  {
    id: "ollama",
    label: "Ollama (local, free)",
    requiresKey: false,
    hint: "Free, runs on your machine. Install ollama.com then `ollama pull <model>`.",
    defaultModel: "llama3.2:3b",
    commonModels: [
      { id: "llama3.2:3b", label: "llama3.2:3b — runs on most laptops" },
      { id: "llama3.3:70b", label: "llama3.3:70b — needs ~40GB RAM" },
      { id: "qwen2.5:7b", label: "qwen2.5:7b — solid mid-size" },
      { id: "mistral:7b", label: "mistral:7b" },
    ],
  },
];

export function OnboardingProviderForm() {
  const router = useRouter();
  const [provider, setProvider] = useState<ProviderId>("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(
    CHOICES.find((c) => c.id === "anthropic")!.defaultModel,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = CHOICES.find((c) => c.id === provider)!;

  // When the user switches provider, snap the model field to that provider's
  // default. (They can still override after.)
  useEffect(() => {
    setModel(chosen.defaultModel);
  }, [chosen.defaultModel]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (chosen.requiresKey && !apiKey.trim()) {
      setError("API key required for this provider.");
      return;
    }
    if (!model.trim()) {
      setError("Model name required.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/onboarding/provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey: chosen.requiresKey ? apiKey.trim() : null,
          model: model.trim(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      // Reload the dashboard — the gate will now drop away because an AI
      // provider is configured.
      router.refresh();
      router.push("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 mt-4">
      <div className="grid grid-cols-2 gap-2">
        {CHOICES.map((c) => (
          <label
            key={c.id}
            className={`cursor-pointer rounded border px-4 py-2 transition-colors ${
              provider === c.id
                ? "border-primary bg-primary-container/15"
                : "border-outline-variant hover:border-outline"
            }`}
          >
            <input
              type="radio"
              name="provider"
              value={c.id}
              checked={provider === c.id}
              onChange={() => setProvider(c.id)}
              className="sr-only"
            />
            <div className="font-mono text-[12px] font-bold text-on-surface">
              {c.label}
            </div>
            <div className="text-[11px] text-on-surface-variant mt-1">
              {c.hint}
            </div>
          </label>
        ))}
      </div>

      {chosen.requiresKey && (
        <label className="block space-y-2">
          <span className="font-mono text-xs uppercase tracking-wider text-on-surface-variant">
            API key
          </span>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoFocus
            placeholder={
              provider === "anthropic"
                ? "sk-ant-…"
                : provider === "openai"
                  ? "sk-…"
                  : provider === "openrouter"
                    ? "sk-or-…"
                    : ""
            }
            className="w-full rounded border border-outline-variant bg-surface-container-lowest px-2 py-2 font-mono text-[13px] text-on-surface focus:border-primary focus:outline-none"
          />
        </label>
      )}

      <div className="space-y-2">
        <label className="block space-y-2">
          <span className="font-mono text-xs uppercase tracking-wider text-on-surface-variant">
            Model
          </span>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={chosen.defaultModel}
            className="w-full rounded border border-outline-variant bg-surface-container-lowest px-2 py-2 font-mono text-[13px] text-on-surface focus:border-primary focus:outline-none"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {chosen.commonModels.map((m) => {
            const active = m.id === model;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setModel(m.id)}
                className={`text-[11px] font-mono px-2 py-1 rounded border transition-colors ${
                  active
                    ? "border-primary bg-primary-container/15 text-primary"
                    : "border-outline-variant text-on-surface-variant hover:border-outline hover:text-on-surface"
                }`}
                title={m.label}
              >
                {m.id}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-on-surface-variant/60">
          {chosen.commonModels.find((m) => m.id === model)?.label ??
            "Custom model — make sure it exists on this provider."}
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex items-center gap-2 bg-primary text-on-primary label-caps py-2 px-4 rounded hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? "Saving…" : "Save and continue"}
      </button>

      <p className="text-[11px] text-on-surface-variant/60">
        Continuum auto-picks sensible default models for each provider. You
        can tweak models, split SMART/CHEAP tiers, or add a custom endpoint
        later in <span className="font-mono">/settings</span>.
      </p>
    </form>
  );
}
