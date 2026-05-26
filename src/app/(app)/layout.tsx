import { AppShell } from "@/components/app-shell";
import { getActiveMode } from "@/lib/mode";
import { requireCurrentWorkspaceId } from "@/lib/tenant";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Resolve the current workspace once at the layout level. If the request
  // somehow reached this without auth, the proxy should have caught it
  // first — but if it slips through, fall back to demo mode so the
  // dashboard renders an empty shell instead of crashing.
  const mode = await (async () => {
    try {
      const workspaceId = await requireCurrentWorkspaceId();
      return await getActiveMode(workspaceId);
    } catch {
      return "demo" as const;
    }
  })();
  return <AppShell mode={mode}>{children}</AppShell>;
}
