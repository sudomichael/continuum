"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/icon";

export function NewProjectForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    identifier: "",
    description: "",
    cwd: "",
    icon: "psychology",
    state: "active" as const,
  });

  function slugify(s: string) {
    return s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          slug: form.slug || slugify(form.name),
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed");
      setOpen(false);
      setForm({
        name: "",
        slug: "",
        identifier: "",
        description: "",
        cwd: "",
        icon: "psychology",
        state: "active",
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="label-caps inline-flex items-center gap-1 px-4 py-2 bg-primary text-on-primary rounded"
      >
        <Icon name="add" className="text-[16px]" />
        REGISTER_PROJECT
      </button>
    );
  }

  return (
    <div className="border border-outline-variant rounded-lg bg-surface-container-low p-4">
      <div className="flex items-center justify-between mb-4">
        <span className="label-caps text-primary">NEW_NODE</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-on-surface-variant hover:text-on-surface"
        >
          <Icon name="close" className="text-[18px]" />
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="NAME">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Parcelwise"
            className="input"
          />
        </Field>
        <Field label="SLUG (optional, auto from name)">
          <input
            value={form.slug}
            onChange={(e) =>
              setForm({
                ...form,
                slug: e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9-]/g, ""),
              })
            }
            placeholder="parcelwise"
            className="input font-mono"
          />
        </Field>
        <Field label="IDENTIFIER (optional)">
          <input
            value={form.identifier}
            onChange={(e) => setForm({ ...form, identifier: e.target.value })}
            placeholder="#LOGISTICS-77"
            className="input font-mono"
          />
        </Field>
        <Field label="ICON (Material Symbols)">
          <input
            value={form.icon}
            onChange={(e) => setForm({ ...form, icon: e.target.value })}
            placeholder="psychology"
            className="input font-mono"
          />
        </Field>
        <Field label="DESCRIPTION" full>
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="One-line description"
            className="input"
          />
        </Field>
        <Field label="LOCAL_CWD (for Claude Code hook)" full>
          <input
            value={form.cwd}
            onChange={(e) => setForm({ ...form, cwd: e.target.value })}
            placeholder="/Users/you/devProjects/parcelwise"
            className="input font-mono"
          />
        </Field>
        <Field label="STATE">
          <select
            value={form.state}
            onChange={(e) =>
              setForm({
                ...form,
                state: e.target.value as typeof form.state,
              })
            }
            className="input"
          >
            <option value="active">active</option>
            <option value="near_launch">near_launch</option>
            <option value="paused">paused</option>
            <option value="exploring">exploring</option>
            <option value="archived">archived</option>
          </select>
        </Field>
      </div>
      {error && (
        <div className="code-sm text-error mt-2">{error}</div>
      )}
      <div className="flex justify-end gap-2 mt-4">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="label-caps px-4 py-1 border border-outline-variant rounded text-on-surface-variant"
        >
          CANCEL
        </button>
        <button
          type="button"
          disabled={submitting || !form.name}
          onClick={submit}
          className="label-caps px-4 py-1 bg-primary text-on-primary rounded disabled:opacity-40"
        >
          {submitting ? "CREATING…" : "CREATE"}
        </button>
      </div>
      <style jsx>{`
        .input {
          background: var(--color-surface-container-lowest);
          border: 1px solid var(--color-outline-variant);
          border-radius: 4px;
          padding: 8px 12px;
          font-size: 13px;
          color: var(--color-on-surface);
          width: 100%;
        }
        .input:focus {
          outline: none;
          border-color: var(--color-primary);
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1 ${full ? "md:col-span-2" : ""}`}>
      <span className="label-caps text-on-surface-variant text-[9px]">
        {label}
      </span>
      {children}
    </label>
  );
}
