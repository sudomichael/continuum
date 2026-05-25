"use client";

import { useState } from "react";

export function CliAuthForm({
  code,
  defaultName,
}: {
  code: string;
  defaultName: string | null;
}) {
  const [name, setName] = useState(defaultName ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function authorize() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/cli-auth/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name: name.trim() || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <p className="text-secondary text-sm">
        Authorized. You can close this tab — your CLI has the token now.
      </p>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        authorize();
      }}
      className="space-y-4"
    >
      <label className="block space-y-2">
        <span className="label-caps text-on-surface-variant">
          Name this device
        </span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="MacBook Pro"
          className="w-full rounded border border-outline-variant bg-surface-container-lowest px-2 py-2 font-mono text-[13px] text-on-surface focus:border-primary focus:outline-none"
        />
        <span className="text-[11px] text-on-surface-variant/60">
          Shown in /settings so you can revoke it later.
        </span>
      </label>

      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-primary text-on-primary label-caps py-2 px-4 rounded hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? "Authorizing…" : "Authorize this device"}
      </button>
    </form>
  );
}
