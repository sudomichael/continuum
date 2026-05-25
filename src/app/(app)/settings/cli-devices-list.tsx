"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";

type Device = {
  id: string;
  name: string;
  platform: string | null;
  createdAt: Date | string;
  lastSeenAt: Date | string | null;
};

function fmt(d: Date | string | null): string {
  if (!d) return "never";
  const ms = new Date(d).getTime();
  const diff = Date.now() - ms;
  const min = Math.round(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export function CliDevicesList({ devices }: { devices: Device[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [revoking, setRevoking] = useState<string | null>(null);

  if (devices.length === 0) {
    return (
      <p className="text-on-surface-variant/70 text-[12px]">
        No devices paired yet.
      </p>
    );
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this device? Hooks on it will stop working immediately.")) return;
    setRevoking(id);
    try {
      await fetch("/api/cli-auth/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      startTransition(() => router.refresh());
    } finally {
      setRevoking(null);
    }
  }

  return (
    <ul className="divide-y divide-outline-variant/30 border border-outline-variant rounded">
      {devices.map((d) => (
        <li
          key={d.id}
          className="flex items-center gap-4 px-4 py-2 text-[13px]"
        >
          <Icon
            name="computer"
            className="text-on-surface-variant text-[18px] shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="text-on-surface truncate">{d.name}</div>
            <div className="text-[11px] text-on-surface-variant/60 font-mono">
              {d.platform ?? "unknown"} · last seen {fmt(d.lastSeenAt)} · added{" "}
              {fmt(d.createdAt)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => revoke(d.id)}
            disabled={pending || revoking === d.id}
            className="label-caps text-[10px] px-2 py-1 border border-outline-variant rounded text-on-surface-variant hover:text-red-400 hover:border-red-400 disabled:opacity-40"
          >
            {revoking === d.id ? "REVOKING…" : "REVOKE"}
          </button>
        </li>
      ))}
    </ul>
  );
}
