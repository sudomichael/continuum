"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./icon";

type Props = { open: boolean; onClose: () => void };

export function QuickCaptureModal({ open, onClose }: Props) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    project: string;
    category: string;
  } | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => ref.current?.focus(), 30);
      setError(null);
      setResult(null);
    } else {
      setBody("");
    }
  }, [open]);

  if (!open) return null;

  async function submit() {
    if (!body.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed to capture");
      setResult({
        project: data.project?.name ?? "Unknown",
        category: data.update?.category ?? "note",
      });
      setBody("");
      router.refresh();
      setTimeout(() => onClose(), 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-surface-container border border-outline-variant rounded-lg shadow-2xl"
      >
        <div className="flex items-center gap-2 px-4 py-2 border-b border-outline-variant">
          <Icon name="bolt" filled className="text-[18px] text-primary" />
          <span className="label-caps text-primary">QUICK_CAPTURE</span>
          <span className="code-sm text-on-surface-variant/60 ml-auto">
            CMD+ENTER to submit · ESC to close
          </span>
        </div>
        <textarea
          ref={ref}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
          }}
          rows={6}
          placeholder="e.g. For Parcelwise, polygon editor mobile interactions broken — investigate brush model."
          className="w-full bg-surface-container-low p-4 font-mono text-[13px] leading-relaxed resize-none outline-none text-on-surface placeholder:text-on-surface-variant/40"
        />
        <div className="flex items-center justify-between gap-4 px-4 py-2 border-t border-outline-variant">
          <div className="code-sm text-on-surface-variant/60">
            {result ? (
              <span className="text-secondary">
                ✓ filed to {result.project} as {result.category}
              </span>
            ) : error ? (
              <span className="text-error">{error}</span>
            ) : (
              "AI will classify project + category and update the brain."
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="label-caps px-4 py-1 border border-outline-variant rounded text-on-surface-variant hover:bg-surface-variant"
            >
              CANCEL
            </button>
            <button
              type="button"
              disabled={submitting || !body.trim()}
              onClick={submit}
              className="label-caps px-4 py-1 bg-primary text-on-primary rounded disabled:opacity-40"
            >
              {submitting ? "SYNTHESIZING…" : "CAPTURE"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
