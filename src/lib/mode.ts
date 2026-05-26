import { getSettings, tierUsable } from "./settings";

export async function getActiveMode(workspaceId: string): Promise<"demo" | "live"> {
  if (process.env.DEMO_MODE === "1" || process.env.DEMO_MODE === "true")
    return "demo";
  const s = await getSettings(workspaceId);
  return tierUsable(s.smart) || tierUsable(s.cheap) ? "live" : "demo";
}
