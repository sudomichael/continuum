// `npm run connect-codex`
//
// Installs the Continuum Codex CLI hook:
//   - copies cli/embedded/hooks/continuum-codex-hook.sh to ~/.codex/continuum-codex-hook.sh
//   - patches ~/.codex/hooks.json with a `Stop` hook entry pointing at it
//
// Codex doesn't yet expose SessionEnd (see openai/codex#20603), so we register
// against `Stop` and let the server dedupe by sessionId.
//
// Idempotent. Backs up the existing hooks.json before patching.

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
import { ensureContinuumUrl, readEnvFile } from "./lib/installer-env";

const ROOT = resolve(__dirname, "..");
const HOOK_SOURCE = resolve(ROOT, "cli/embedded/hooks/continuum-codex-hook.sh");
const CODEX_DIR = resolve(homedir(), ".codex");
const HOOK_DEST = resolve(CODEX_DIR, "continuum-codex-hook.sh");
const HOOKS_JSON = resolve(CODEX_DIR, "hooks.json");
const ENV_PATH = resolve(ROOT, ".env");

function log(msg: string) {
  process.stdout.write(`\x1b[36m[connect-codex]\x1b[0m ${msg}\n`);
}

function readJSONIfExists(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch (e) {
    throw new Error(
      `Could not parse ${path} as JSON — refusing to overwrite. Fix the file and rerun. (${(e as Error).message})`,
    );
  }
}

function copyHookScript() {
  if (!existsSync(CODEX_DIR)) mkdirSync(CODEX_DIR, { recursive: true });
  if (!existsSync(HOOK_SOURCE)) {
    throw new Error(`Codex hook source not found at ${HOOK_SOURCE}`);
  }
  if (
    existsSync(HOOK_DEST) &&
    readFileSync(HOOK_SOURCE, "utf8") === readFileSync(HOOK_DEST, "utf8")
  ) {
    log(`hook already up to date → ${HOOK_DEST}`);
    return;
  }
  copyFileSync(HOOK_SOURCE, HOOK_DEST);
  chmodSync(HOOK_DEST, 0o755);
  log(`installed ${HOOK_DEST}`);
}

type Hook = { type: "command"; command: string };
type HookGroup = { hooks: Hook[] };

function patchHooksJson(url: string, token: string) {
  const config = readJSONIfExists(HOOKS_JSON);
  const hooks =
    (config.hooks as Record<string, HookGroup[]> | undefined) ?? {};

  // Codex hooks pass their JSON envelope on stdin, so we can call the script
  // directly. CONTINUUM_URL / CONTINUUM_TOKEN need to be in the env where
  // Codex spawns the hook — written into the hook's `env` field so users
  // don't have to export them globally.
  const command = HOOK_DEST;

  const event = "Stop";
  const groups = hooks[event] ?? [];
  const already = groups.some((g) =>
    (g.hooks ?? []).some(
      (h) => h.type === "command" && h.command === command,
    ),
  );

  if (already) {
    log(`Stop hook already present`);
  } else {
    groups.push({ hooks: [{ type: "command", command }] });
    log(`added Stop hook entry`);
  }
  hooks[event] = groups;
  config.hooks = hooks;

  // Codex hooks inherit shell env by default; we also stash the values in
  // an `env` block so users with stripped shells still get them.
  const env =
    (config.env as Record<string, string> | undefined) ?? {};
  env.CONTINUUM_URL = url;
  env.CONTINUUM_TOKEN = token;
  config.env = env;

  if (existsSync(HOOKS_JSON)) {
    const bak = `${HOOKS_JSON}.continuum.bak`;
    if (!existsSync(bak)) {
      copyFileSync(HOOKS_JSON, bak);
      log(`backed up existing hooks.json → ${bak}`);
    }
  }
  writeFileSync(HOOKS_JSON, JSON.stringify(config, null, 2) + "\n", "utf8");
  log(`patched ${HOOKS_JSON}`);
}

async function main() {
  log("installing Continuum Codex CLI hook…");
  const url = await ensureContinuumUrl(ENV_PATH);
  log(`using Continuum URL: ${url}`);

  const env = readEnvFile(ENV_PATH);
  const token = env.CONTINUUM_TOKEN ?? "";
  if (!token) {
    log(
      "WARNING: CONTINUUM_TOKEN is empty in .env — the hook will fail auth. " +
        "Run `npm run dev` once to auto-generate it, then re-run this.",
    );
  }

  copyHookScript();
  patchHooksJson(url, token);

  log("done. Restart Codex CLI to pick up the new hook.");
  log(
    "Note: Codex's `Stop` event fires per-turn, not at true session end. " +
      "Continuum dedupes by session_id so this is fine — when openai/codex#20603 " +
      "ships SessionEnd, change the `event` in hooks.json from `Stop` to `SessionEnd`.",
  );
}

main().catch((e) => {
  console.error(
    "\x1b[31m[connect-codex]\x1b[0m",
    e instanceof Error ? e.message : e,
  );
  process.exit(1);
});
