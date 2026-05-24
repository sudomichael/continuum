"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "./icon";
import { QuickCaptureModal } from "./quick-capture-modal";

const NAV = [
  { href: "/", label: "Dashboard", icon: "dashboard" },
  { href: "/projects", label: "Projects", icon: "psychology" },
  { href: "/timeline", label: "Timeline", icon: "history" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

export function AppShell({
  children,
  mode = "live",
}: {
  children: React.ReactNode;
  mode?: "demo" | "live";
}) {
  const pathname = usePathname();
  const [captureOpen, setCaptureOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCaptureOpen(true);
      }
      if (e.key === "Escape") setCaptureOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname?.startsWith(href);

  return (
    <>
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 w-[240px] h-screen border-r border-outline-variant bg-surface-container-lowest flex flex-col py-6 px-4 z-50">
        <div className="mb-10 px-1">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-primary-container flex items-center justify-center">
              <Icon name="psychology" filled className="text-on-primary-container" />
            </div>
            <div>
              <div className="label-caps text-primary tracking-[0.2em]">CONTINUUM</div>
              <div className="code-sm text-[9px] text-on-surface-variant/50 leading-none">
                v0.1.0-dev
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          {NAV.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-4 px-2 py-2 rounded transition-colors duration-150 ${
                  active
                    ? "text-primary border-r-2 border-primary bg-primary-container/10"
                    : "text-on-surface-variant/70 hover:bg-surface-variant hover:text-on-surface"
                }`}
              >
                <Icon name={item.icon} className="text-[20px]" />
                <span className="label-caps">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto pt-6 border-t border-outline-variant/30">
          <button
            type="button"
            onClick={() => setCaptureOpen(true)}
            className="w-full bg-primary text-on-primary label-caps py-2 px-4 rounded hover:opacity-90 transition-opacity flex items-center justify-center gap-1"
          >
            <Icon name="bolt" className="text-[16px]" />
            Quick Capture
          </button>
          <div className="mt-6 flex items-center gap-2 px-1">
            <div className="w-6 h-6 rounded-full bg-surface-container-highest border border-outline flex items-center justify-center">
              <Icon name="person" className="text-[14px] text-on-surface-variant" />
            </div>
            <div className="overflow-hidden flex-1">
              <div className="code-sm text-on-surface truncate">FOUNDER_01</div>
              <div className="code-sm text-[9px] text-on-surface-variant/50">
                OPERATIONAL_MODE
              </div>
            </div>
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                title="Sign out"
                className="text-on-surface-variant/60 hover:text-on-surface"
              >
                <Icon name="logout" className="text-[16px]" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Top bar */}
      <header className="fixed top-0 right-0 left-[240px] h-14 border-b border-outline-variant bg-surface flex justify-between items-center px-6 z-40">
        <div className="flex items-center gap-6 flex-1">
          <div className="relative w-full max-w-md">
            <Icon
              name="search"
              className="absolute left-2 top-1/2 -translate-y-1/2 text-on-surface-variant text-[16px]"
            />
            <button
              type="button"
              onClick={() => setCaptureOpen(true)}
              className="bg-surface-container-low border-none rounded py-1 pl-10 pr-4 code-sm w-full text-left text-on-surface-variant hover:text-on-surface focus:ring-1 focus:ring-primary cursor-text"
            >
              CMD+K to capture &amp; search brain…
            </button>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {mode === "demo" && (
            <Link
              href="/settings"
              className="label-caps text-[10px] px-2 py-1 border border-tertiary/40 bg-tertiary/10 text-tertiary rounded hover:bg-tertiary/20"
              title="No API key configured — using canned demo responses. Click to add a key."
            >
              DEMO_MODE
            </Link>
          )}
          <div className="flex flex-col items-end">
            <span
              className={`code-sm text-[10px] ${
                mode === "demo" ? "text-tertiary" : "text-secondary"
              }`}
            >
              {mode === "demo" ? "DEMO_PROVIDER" : "SYSTEM_OPTIMAL"}
            </span>
            <span className="code-sm text-[9px] text-on-surface-variant/50">
              SYNC: live
            </span>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="ml-[240px] mt-14 min-h-[calc(100vh-56px)] bg-background">
        <div className="mx-auto max-w-[1280px] px-6 py-6">{children}</div>
      </main>

      <QuickCaptureModal open={captureOpen} onClose={() => setCaptureOpen(false)} />
    </>
  );
}
