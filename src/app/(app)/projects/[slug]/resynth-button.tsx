"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/icon";

export function ResynthesizeButton({ slug }: { slug: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/projects/${slug}`, { method: "POST" });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `HTTP ${r.status}`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="label-caps px-4 py-2 bg-primary text-on-primary rounded flex items-center gap-1 disabled:opacity-50"
      >
        <Icon
          name={busy ? "sync" : "auto_awesome"}
          className={`text-[16px] ${busy ? "animate-spin" : ""}`}
        />
        {busy ? "SYNTHESIZING…" : "RE_SYNTHESIZE"}
      </button>
      {error && <span className="code-sm text-error text-[11px]">{error}</span>}
    </div>
  );
}
