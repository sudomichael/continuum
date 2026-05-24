"use client";

import { useState } from "react";
import { Icon } from "@/components/icon";

type Preset = {
  id: string;
  label: string;
  baseUrl: string;
  defaultSmartModel: string;
  defaultCheapModel: string;
  requiresKey: boolean;
  notes?: string;
};

type TierState = {
  provider: string;
  baseUrl: string;
  model: string;
  keyConfigured: boolean;
};

type Initial = { smart: TierState; cheap: TierState };

type TierKind = "smart" | "cheap";

export function SettingsForm({
  presets,
  initial,
}: {
  presets: Preset[];
  initial: Initial;
}) {
  const [smart, setSmart] = useState({
    provider: initial.smart.provider,
    baseUrl: initial.smart.baseUrl,
    model: initial.smart.model,
    apiKey: "",
    keyConfigured: initial.smart.keyConfigured,
  });
  const [cheap, setCheap] = useState({
    provider: initial.cheap.provider,
    baseUrl: initial.cheap.baseUrl,
    model: initial.cheap.model,
    apiKey: "",
    keyConfigured: initial.cheap.keyConfigured,
  });
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const body = {
        smart: {
          provider: smart.provider,
          baseUrl: smart.baseUrl,
          model: smart.model,
          ...(smart.apiKey ? { apiKey: smart.apiKey } : {}),
        },
        cheap: {
          provider: cheap.provider,
          baseUrl: cheap.baseUrl,
          model: cheap.model,
          ...(cheap.apiKey ? { apiKey: cheap.apiKey } : {}),
        },
      };
      const r = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `HTTP ${r.status}`);
      }
      setSavedAt(new Date());
      if (smart.apiKey)
        setSmart({ ...smart, apiKey: "", keyConfigured: true });
      if (cheap.apiKey)
        setCheap({ ...cheap, apiKey: "", keyConfigured: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-on-surface-variant/80">
        <span className="label-caps text-primary">SMART</span> = brain synthesis
        (low volume, strategic).{" "}
        <span className="label-caps text-tertiary">CHEAP</span> = session
        summarization + capture classification (high volume). You can mix
        providers — e.g. Anthropic for SMART, Ollama for CHEAP.
      </p>
      <TierCard
        title="SMART_TIER"
        accent="primary"
        presets={presets}
        state={smart}
        setState={setSmart}
        tierKind="smart"
      />
      <TierCard
        title="CHEAP_TIER"
        accent="tertiary"
        presets={presets}
        state={cheap}
        setState={setCheap}
        tierKind="cheap"
      />

      <div className="flex items-center justify-end gap-2">
        {error && <span className="code-sm text-error">{error}</span>}
        {savedAt && (
          <span className="code-sm text-secondary flex items-center gap-1">
            <Icon name="check_circle" filled className="text-[14px]" />
            saved
          </span>
        )}
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="label-caps px-4 py-2 bg-primary text-on-primary rounded disabled:opacity-50"
        >
          {busy ? "SAVING…" : "SAVE_CONFIG"}
        </button>
      </div>

      <style jsx>{`
        :global(.input) {
          background: var(--color-surface-container-lowest);
          border: 1px solid var(--color-outline-variant);
          border-radius: 4px;
          padding: 8px 12px;
          font-size: 13px;
          color: var(--color-on-surface);
          width: 100%;
        }
        :global(.input:focus) {
          outline: none;
          border-color: var(--color-primary);
        }
      `}</style>
    </div>
  );
}

type TierFormState = {
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  keyConfigured: boolean;
};

function TierCard({
  title,
  accent,
  presets,
  state,
  setState,
  tierKind,
}: {
  title: string;
  accent: "primary" | "tertiary";
  presets: Preset[];
  state: TierFormState;
  setState: (s: TierFormState) => void;
  tierKind: TierKind;
}) {
  const preset = presets.find((p) => p.id === state.provider) ?? presets[0];
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    latencyMs?: number;
    error?: string;
    text?: string;
  } | null>(null);

  function onProviderChange(id: string) {
    const p = presets.find((q) => q.id === id) ?? presets[0];
    setState({
      ...state,
      provider: id,
      baseUrl: p.baseUrl,
      model:
        tierKind === "smart" ? p.defaultSmartModel : p.defaultCheapModel,
    });
    setTestResult(null);
  }

  async function test() {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier: tierKind,
          provider: state.provider,
          baseUrl: state.baseUrl,
          model: state.model,
          ...(state.apiKey ? { apiKey: state.apiKey } : {}),
        }),
      });
      const d = await r.json();
      setTestResult(d);
    } catch (e) {
      setTestResult({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="border border-outline-variant rounded-lg bg-surface-container-low p-4 space-y-4">
      <h2 className={`label-caps text-${accent}`}>{title}</h2>

      <Field label="PROVIDER">
        <select
          value={state.provider}
          onChange={(e) => onProviderChange(e.target.value)}
          className="input"
        >
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        {preset.notes && (
          <span className="code-sm text-[11px] text-on-surface-variant/60">
            {preset.notes}
          </span>
        )}
      </Field>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="BASE_URL">
          <input
            value={state.baseUrl}
            onChange={(e) => setState({ ...state, baseUrl: e.target.value })}
            className="input font-mono"
            placeholder={preset.baseUrl}
          />
        </Field>
        <Field label="MODEL">
          <input
            value={state.model}
            onChange={(e) => setState({ ...state, model: e.target.value })}
            className="input font-mono"
            placeholder={
              tierKind === "smart"
                ? preset.defaultSmartModel
                : preset.defaultCheapModel
            }
          />
        </Field>
      </div>

      <Field
        label={
          preset.requiresKey
            ? "API_KEY"
            : "API_KEY (optional for this provider)"
        }
      >
        <div className="flex gap-2 items-center">
          <input
            type="password"
            value={state.apiKey}
            onChange={(e) => setState({ ...state, apiKey: e.target.value })}
            placeholder={
              state.keyConfigured
                ? "•••••••••••• (configured — paste to replace)"
                : preset.requiresKey
                  ? "sk-…"
                  : "(leave blank for local providers)"
            }
            className="input font-mono flex-1"
          />
          <StatusDot
            ok={state.keyConfigured || !preset.requiresKey}
            title={
              !preset.requiresKey
                ? "no key needed"
                : state.keyConfigured
                  ? "configured"
                  : "missing"
            }
          />
        </div>
      </Field>

      <div className="flex items-center justify-between gap-2">
        <div className="code-sm text-[11px]">
          {testResult ? (
            testResult.ok ? (
              <span className="text-secondary">
                ✓ ok · {testResult.latencyMs}ms
                {testResult.text && (
                  <span className="text-on-surface-variant/60 ml-1">
                    “{testResult.text.slice(0, 40)}”
                  </span>
                )}
              </span>
            ) : (
              <span className="text-error">
                ✗ {testResult.error ?? "failed"}
              </span>
            )
          ) : (
            <span className="text-on-surface-variant/50">
              press TEST_CONNECTION to verify
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={test}
          disabled={testing}
          className="label-caps px-4 py-1 border border-outline-variant hover:bg-surface-variant rounded disabled:opacity-50"
        >
          {testing ? "TESTING…" : "TEST_CONNECTION"}
        </button>
      </div>
    </section>
  );
}

function StatusDot({ ok, title }: { ok: boolean; title?: string }) {
  return (
    <span
      title={title}
      className={`w-[8px] h-[8px] rounded-full shrink-0 ${
        ok ? "bg-secondary animate-status-active" : "bg-error"
      }`}
    />
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label-caps text-on-surface-variant text-[9px]">
        {label}
      </span>
      {children}
    </label>
  );
}
