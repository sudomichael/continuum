#!/usr/bin/env -S npx tsx
// Continuum MCP server (stdio).
//
// Exposes Continuum's project + brain operations as tools that Claude Code can
// call directly. You can then say things like:
//   "register this project with Continuum"
//   "what's the brain say about Parcelwise?"
//   "what's blocking my projects right now?"
//
// All tools hit the local Continuum HTTP API (defaults to http://localhost:3000),
// authenticated via X-Continuum-Token.
//
// CRITICAL: stdio MCP requires that stdout carry ONLY JSON-RPC framing. Any
// logging from this server must go to stderr.

import {
  Server,
} from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const URL_BASE = process.env.CONTINUUM_URL ?? "http://localhost:3000";
const TOKEN = process.env.CONTINUUM_TOKEN ?? "";

function err(msg: string) {
  process.stderr.write(`[continuum-mcp] ${msg}\n`);
}

async function api(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<unknown> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (TOKEN) headers["X-Continuum-Token"] = TOKEN;

  const res = await fetch(`${URL_BASE}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // leave as text
  }
  if (!res.ok) {
    throw new Error(
      `${init.method ?? "GET"} ${path} → HTTP ${res.status}: ${typeof parsed === "string" ? parsed : JSON.stringify(parsed)}`,
    );
  }
  return parsed;
}

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text:
          typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

const TOOLS = [
  {
    name: "continuum_register_project",
    description:
      "Register the current Claude Code project with Continuum. Pass the absolute cwd; optionally override the inferred name. Idempotent — returns the existing project if one is already bound to that cwd. If `cwd` is not a git repo, you must pass a `name` to confirm intent.",
    inputSchema: {
      type: "object",
      properties: {
        cwd: {
          type: "string",
          description:
            "Absolute path to the project's working directory. Usually the value of $CLAUDE_PROJECT_DIR.",
        },
        name: {
          type: "string",
          description:
            "Optional explicit project name. If omitted, inferred from package.json or directory name.",
        },
      },
      required: ["cwd"],
    },
  },
  {
    name: "continuum_list_projects",
    description:
      "List all projects registered in Continuum, including state, current focus, and momentum/health scores. Use this to give the user a portfolio overview.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "continuum_get_brain",
    description:
      "Get the synthesized 'project brain' for a single project by slug — what it is, current state, architecture, blockers, next actions. Use this to recover full context when the user comes back to a project.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Project slug, e.g. 'parcelwise'." },
      },
      required: ["slug"],
    },
  },
  {
    name: "continuum_capture",
    description:
      "Log a thought, decision, blocker, or note into Continuum. The server will classify it to the right project + category and re-synthesize the relevant brain. Use this whenever the user says something noteworthy about a project mid-session, or explicitly asks you to capture/remember it.",
    inputSchema: {
      type: "object",
      properties: {
        body: {
          type: "string",
          description: "Free-text note. Mention the project name if known.",
        },
        projectSlug: {
          type: "string",
          description:
            "Optional explicit project slug. Skip the classifier when you already know the target.",
        },
      },
      required: ["body"],
    },
  },
  {
    name: "continuum_resynthesize",
    description:
      "Force a fresh synthesis of a project's brain from its latest updates. Use this after capturing several updates in a row, or when the user wants the brain refreshed.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string" },
      },
      required: ["slug"],
    },
  },
  {
    name: "continuum_status",
    description:
      "Quick health check — confirms the Continuum server is reachable and reports active mode (demo vs live) and project count.",
    inputSchema: { type: "object", properties: {} },
  },
];

async function handle(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "continuum_register_project": {
      const cwd = String(args.cwd);
      const hint = args.name ? String(args.name) : undefined;
      const result = (await api("/api/projects/auto-register", {
        method: "POST",
        body: { cwd, hint },
      })) as { project: { slug: string; name: string }; created: boolean };
      return textResult(
        result.created
          ? `Registered "${result.project.name}" (slug: ${result.project.slug}) bound to ${cwd}.`
          : `Already registered as "${result.project.name}" (slug: ${result.project.slug}).`,
      );
    }
    case "continuum_list_projects": {
      const list = (await api("/api/projects")) as unknown;
      return textResult(list);
    }
    case "continuum_get_brain": {
      const slug = String(args.slug);
      const result = await api(`/api/projects/${encodeURIComponent(slug)}`);
      return textResult(result);
    }
    case "continuum_capture": {
      const body = String(args.body);
      const projectSlug = args.projectSlug
        ? String(args.projectSlug)
        : undefined;
      const result = (await api("/api/capture", {
        method: "POST",
        body: { body, projectSlug },
      })) as {
        project?: { name?: string; slug?: string };
        update?: { category?: string };
      };
      return textResult(
        `Filed → ${result.project?.name ?? "?"} as ${result.update?.category ?? "note"}. Brain re-synthesized.`,
      );
    }
    case "continuum_resynthesize": {
      const slug = String(args.slug);
      await api(`/api/projects/${encodeURIComponent(slug)}`, {
        method: "POST",
      });
      return textResult(`Re-synthesized brain for ${slug}.`);
    }
    case "continuum_status": {
      try {
        const r = (await api("/api/projects")) as unknown[];
        return textResult({
          reachable: true,
          url: URL_BASE,
          projects: Array.isArray(r) ? r.length : 0,
          tokenConfigured: Boolean(TOKEN),
        });
      } catch (e) {
        return errorResult(
          `Continuum not reachable at ${URL_BASE}. Start it with \`npm run dev\` in the repo. (${
            e instanceof Error ? e.message : String(e)
          })`,
        );
      }
    }
    default:
      return errorResult(`Unknown tool: ${name}`);
  }
}

async function main() {
  const server = new Server(
    { name: "continuum", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    const args = (req.params.arguments ?? {}) as Record<string, unknown>;
    try {
      return await handle(name, args);
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  err(`continuum MCP ready (${URL_BASE})`);
}

main().catch((e) => {
  err(`fatal: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
  process.exit(1);
});
