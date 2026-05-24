// `npm run install-hook`
//
// Installs the Continuum SessionEnd hook for Claude Code in one command:
//   - copies apps/cli/continuum-hook.sh to ~/.claude/continuum-hook.sh
//   - patches ~/.claude/settings.json with the hook entry + env vars
//
// Idempotent: re-running updates the script and leaves the settings entry
// intact (or adds it if missing). Asks before overwriting an existing hook
// script that differs.

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  chmodSync,
  copyFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { ensureContinuumUrl } from "./lib/installer-env";

const ROOT = resolve(__dirname, "..");
const HOOK_SOURCE = resolve(ROOT, "apps/cli/continuum-hook.sh");
const START_HOOK_SOURCE = resolve(ROOT, "apps/cli/continuum-session-start.sh");
const CLAUDE_DIR = resolve(homedir(), ".claude");
const HOOK_DEST = resolve(CLAUDE_DIR, "continuum-hook.sh");
const START_HOOK_DEST = resolve(CLAUDE_DIR, "continuum-session-start.sh");
const SETTINGS_PATH = resolve(CLAUDE_DIR, "settings.json");
const ENV_PATH = resolve(ROOT, ".env");

function read(p: string): string {
  return readFileSync(p, "utf8");
}

function readEnv(): Record<string, string> {
  if (!existsSync(ENV_PATH)) return {};
  const out: Record<string, string> = {};
  for (const line of read(ENV_PATH).split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    )
      v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

async function ask(question: string): Promise<boolean> {
  const rl = createInterface({ input, output });
  const answer = await rl.question(`${question} (y/N) `);
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

async function copyOneHook(src: string, dest: string, label: string) {
  if (!existsSync(src)) {
    throw new Error(`${label} source not found at ${src}`);
  }
  if (existsSync(dest)) {
    if (read(src) === read(dest)) {
      log(`${label} already up to date → ${dest}`);
      return;
    }
    const ok = await ask(
      `An existing ${label} at ${dest} differs from the source. Overwrite?`,
    );
    if (!ok) {
      log(`kept existing ${label}`);
      return;
    }
  }
  copyFileSync(src, dest);
  chmodSync(dest, 0o755);
  log(`installed ${dest}`);
}

async function copyHookScripts() {
  if (!existsSync(CLAUDE_DIR)) mkdirSync(CLAUDE_DIR, { recursive: true });
  await copyOneHook(HOOK_SOURCE, HOOK_DEST, "SessionEnd hook");
  await copyOneHook(
    START_HOOK_SOURCE,
    START_HOOK_DEST,
    "SessionStart hook",
  );
}

type Settings = {
  hooks?: Record<string, unknown>;
  env?: Record<string, string>;
  [k: string]: unknown;
};

function readJSONIfExists(path: string): Settings {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(read(path)) as Settings;
  } catch (e) {
    throw new Error(
      `Could not parse ${path} as JSON — refusing to overwrite. Fix the file and rerun. (${(e as Error).message})`,
    );
  }
}

function ensureHooksEntry(settings: Settings) {
  type Hook = { type: string; command: string };
  type HookGroup = { matcher?: string; hooks: Hook[] };
  const hooks = (settings.hooks as Record<string, HookGroup[] | undefined>) ?? {};

  function addHook(event: "SessionEnd" | "SessionStart", command: string) {
    const groups = hooks[event] ?? [];
    const has = groups.some((g) =>
      (g.hooks ?? []).some(
        (h) => h.type === "command" && h.command === command,
      ),
    );
    if (has) {
      log(`${event} hook already present`);
    } else {
      groups.push({ hooks: [{ type: "command", command }] });
      log(`added ${event} hook entry`);
    }
    hooks[event] = groups;
  }

  addHook("SessionEnd", "~/.claude/continuum-hook.sh");
  addHook("SessionStart", "~/.claude/continuum-session-start.sh");

  settings.hooks = hooks;
}

function ensureEnvBlock(
  settings: Settings,
  env: Record<string, string>,
  url: string,
) {
  const e = settings.env ?? {};
  const token = env.CONTINUUM_TOKEN ?? "";

  if (!token) {
    log(
      "WARNING: CONTINUUM_TOKEN is empty in .env — the hook will fail auth. " +
        "Run `npm run dev` once to auto-generate it, then re-run `npm run install-hook`.",
    );
  }

  e.CONTINUUM_URL = url;
  e.CONTINUUM_TOKEN = token;
  settings.env = e;
}

async function patchSettings(url: string) {
  const settings = readJSONIfExists(SETTINGS_PATH);
  const env = readEnv();

  ensureHooksEntry(settings);
  ensureEnvBlock(settings, env, url);

  if (existsSync(SETTINGS_PATH)) {
    const backup = `${SETTINGS_PATH}.continuum.bak`;
    if (!existsSync(backup)) {
      copyFileSync(SETTINGS_PATH, backup);
      log(`backed up existing settings → ${backup}`);
    }
  }

  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n", "utf8");
  log(`patched ${SETTINGS_PATH}`);
}

function log(msg: string) {
  process.stdout.write(`\x1b[36m[install-hook]\x1b[0m ${msg}\n`);
}

async function main() {
  log("installing Continuum Claude Code hooks…");
  const url = await ensureContinuumUrl(ENV_PATH);
  log(`using Continuum URL: ${url}`);
  await copyHookScripts();
  await patchSettings(url);
  log("done. Restart Claude Code to pick up the new hooks.");
  log(
    "SessionStart will auto-register any git repo you open Claude Code in.",
  );
  log(
    "SessionEnd will summarize the session and update that project's brain.",
  );
}

main().catch((e) => {
  console.error("\x1b[31m[install-hook]\x1b[0m", e instanceof Error ? e.message : e);
  process.exit(1);
});
