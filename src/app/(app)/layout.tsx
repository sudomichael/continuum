import { AppShell } from "@/components/app-shell";
import { getActiveMode } from "@/lib/mode";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const mode = await getActiveMode().catch(() => "demo" as const);
  return <AppShell mode={mode}>{children}</AppShell>;
}
