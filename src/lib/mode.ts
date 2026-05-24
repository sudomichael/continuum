import { getSettings, tierUsable } from "./settings";

export async function getActiveMode(): Promise<"demo" | "live"> {
  if (process.env.DEMO_MODE === "1" || process.env.DEMO_MODE === "true")
    return "demo";
  const s = await getSettings();
  return tierUsable(s.smart) || tierUsable(s.cheap) ? "live" : "demo";
}
