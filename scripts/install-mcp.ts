// `npm run install-mcp`
//
// Registers the Continuum MCP server in ~/.claude/settings.json so Claude Code
// can talk to it natively. After this, you can say things like
//   "register this project with Continuum"
//   "what's the brain say about Parcelwise?"
// and Claude will call the right tools.
//
// Idempotent. Backs up the existing settings.json before patching.

import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { ensureContinuumUrl } from "./lib/installer-env";

const ROOT = resolve(__dirname, "..");
const MCP_SCRIPT = resolve(ROOT, "apps/cli/continuum-mcp.ts");
const SETTINGS_PATH = resolve(homedir(), ".claude", "settings.json");
const ENV_PATH = resolve(ROOT, ".env");

function read(p: string) {
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

function log(msg: string) {
  process.stdout.write(`\x1b[36m[install-mcp]\x1b[0m ${msg}\n`);
}

type Settings = {
  mcpServers?: Record<
    string,
    {
      type?: string;
      command: string;
      args?: string[];
      env?: Record<string, string>;
    }
  >;
  [k: string]: unknown;
};

function loadSettings(): Settings {
  if (!existsSync(SETTINGS_PATH)) return {};
  try {
    return JSON.parse(read(SETTINGS_PATH)) as Settings;
  } catch (e) {
    throw new Error(
      `Could not parse ${SETTINGS_PATH}: ${(e as Error).message}`,
    );
  }
}

async function main() {
  if (!existsSync(MCP_SCRIPT)) {
    throw new Error(`MCP script not found at ${MCP_SCRIPT}`);
  }

  const url = await ensureContinuumUrl(ENV_PATH);
  log(`using Continuum URL: ${url}`);
  const env = readEnv();
  const token = env.CONTINUUM_TOKEN ?? "";

  if (!token) {
    log(
      "WARNING: CONTINUUM_TOKEN missing in .env. Run `npm run dev` once to generate it, then re-run this.",
    );
  }

  const settings = loadSettings();
  const servers = settings.mcpServers ?? {};

  servers.continuum = {
    type: "stdio",
    command: "npx",
    args: ["-y", "tsx", MCP_SCRIPT],
    env: {
      CONTINUUM_URL: url,
      CONTINUUM_TOKEN: token,
    },
  };

  settings.mcpServers = servers;

  if (existsSync(SETTINGS_PATH)) {
    const bak = `${SETTINGS_PATH}.continuum.bak`;
    if (!existsSync(bak)) {
      copyFileSync(SETTINGS_PATH, bak);
      log(`backed up existing settings → ${bak}`);
    }
  }
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n", "utf8");
  log(`registered MCP server in ${SETTINGS_PATH}`);
  log("Restart Claude Code so it picks up the new MCP server.");
  log(
    "Then try: 'register this project with continuum', or 'what's blocking my projects?'",
  );
}

main().catch((e) => {
  console.error(
    "\x1b[31m[install-mcp]\x1b[0m",
    e instanceof Error ? e.message : e,
  );
  process.exit(1);
});
