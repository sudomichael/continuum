// Shared helper for both installers (install-hook, install-mcp).
//
// Reads the project .env, asks the user (once, on a TTY) where their Continuum
// is reachable, and persists CONTINUUM_URL back into .env so future installer
// runs and other tooling can use the same value.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const DEFAULT_URL = "http://localhost:3000";

export function readEnvFile(envPath: string): Record<string, string> {
  if (!existsSync(envPath)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

function setEnvVar(envPath: string, key: string, value: string) {
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf8").split("\n");
  let found = false;
  const next = lines.map((line) => {
    if (new RegExp(`^\\s*${key}\\s*=`).test(line)) {
      found = true;
      return `${key}="${value}"`;
    }
    return line;
  });
  if (!found) {
    if (next.length > 0 && next[next.length - 1] === "") next.pop();
    next.push(`${key}="${value}"`, "");
  }
  writeFileSync(envPath, next.join("\n"), "utf8");
}

function normalizeUrl(raw: string): string {
  let v = raw.trim();
  if (!v) return DEFAULT_URL;
  if (!/^https?:\/\//i.test(v)) v = `http://${v}`;
  return v.replace(/\/+$/, "");
}

export async function ensureContinuumUrl(envPath: string): Promise<string> {
  const env = readEnvFile(envPath);
  const existing = env.CONTINUUM_URL?.trim();

  // Already set (e.g. by a prior installer run): trust it, don't re-prompt.
  if (existing) return existing;

  // Non-interactive (CI, piped): use default, persist it.
  if (!process.stdin.isTTY) {
    setEnvVar(envPath, "CONTINUUM_URL", DEFAULT_URL);
    return DEFAULT_URL;
  }

  const rl = createInterface({ input, output });
  const answer = await rl.question(
    `Where is your Continuum reachable? [${DEFAULT_URL}]: `,
  );
  rl.close();

  const url = answer.trim() ? normalizeUrl(answer) : DEFAULT_URL;
  setEnvVar(envPath, "CONTINUUM_URL", url);
  return url;
}
