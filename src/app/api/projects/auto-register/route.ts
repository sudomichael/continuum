// Auto-register a project from a Claude Code session.
//
// Called by the SessionStart hook (and the MCP server). Given a cwd, this:
//   1. Finds an existing project bound to that cwd → returns it.
//   2. Otherwise infers a name from package.json or the directory basename,
//      generates a slug, creates a project + empty brain, and returns it.
//
// Token auth via X-Continuum-Token (same shared secret as /api/ingest).

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { prisma } from "@/lib/db";
import { verifyTokenHeader } from "@/lib/cli-auth";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

const Body = z.object({
  cwd: z.string().min(1),
  hint: z.string().optional(), // explicit override for the inferred name
});

function inferName(cwd: string, hint?: string): string {
  if (hint) return hint;
  const pkg = resolve(cwd, "package.json");
  if (existsSync(pkg)) {
    try {
      const data = JSON.parse(readFileSync(pkg, "utf8")) as { name?: string };
      if (data.name && typeof data.name === "string") {
        // strip scope and clean
        return data.name.replace(/^@[^/]+\//, "").trim() || basename(cwd);
      }
    } catch {
      // ignore parse errors
    }
  }
  return basename(cwd);
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "project"
  );
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  let n = 2;
  while (await prisma.project.findUnique({ where: { slug } })) {
    slug = `${base}-${n++}`;
    if (n > 50) {
      slug = `${base}-${Date.now().toString(36)}`;
      break;
    }
  }
  return slug;
}

function isGitRepo(cwd: string): boolean {
  // Accept either .git directory or a .git file (worktrees).
  return existsSync(resolve(cwd, ".git"));
}

// Material Symbols icon name picked from name + cwd keywords. Falls back to
// the generic brain icon. Kept intentionally small — the project page lets
// users override it later.
function pickIcon(name: string, cwd: string): string {
  const blob = `${name} ${basename(cwd)}`.toLowerCase();
  const rules: Array<[RegExp, string]> = [
    [/\b(api|backend|server)\b/, "api"],
    [/\b(cli|terminal|shell)\b/, "terminal"],
    [/\b(web|site|website|frontend|landing|marketing)\b/, "language"],
    [/\b(app|mobile|ios|android)\b/, "smartphone"],
    [/\b(extension|chrome|browser|plugin)\b/, "extension"],
    [/\b(bot|agent|ai|llm)\b/, "smart_toy"],
    [/\b(data|etl|pipeline|warehouse|analytics)\b/, "analytics"],
    [/\b(infra|deploy|ops|devops|cloud)\b/, "cloud"],
    [/\b(docs?|blog|content)\b/, "menu_book"],
    [/\b(game|games|gaming)\b/, "videogame_asset"],
    [/\b(design|ui|ux)\b/, "palette"],
    [/\b(test|tests|qa)\b/, "science"],
    [/\b(crawl|scrap|scrape)\b/, "travel_explore"],
  ];
  for (const [re, icon] of rules) {
    if (re.test(blob)) return icon;
  }
  return "psychology";
}

export async function POST(req: Request) {
  const jar = await cookies();
  const sessionOk = verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!sessionOk) {
    const tokenAuth = await verifyTokenHeader(
      req.headers.get("x-continuum-token"),
    );
    if (!tokenAuth.ok) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }

  // 1. Already registered?
  const existing = await prisma.project.findUnique({
    where: { cwd: parsed.cwd },
  });
  if (existing) {
    return NextResponse.json({ project: existing, created: false });
  }

  // 2. Refuse to auto-register non-git directories — that's noise prevention.
  if (!isGitRepo(parsed.cwd) && !parsed.hint) {
    return NextResponse.json(
      {
        error: "Not a git repository — refusing to auto-register.",
        cwd: parsed.cwd,
        hint: "Pass a `hint` name to override, or register manually at /projects.",
      },
      { status: 409 },
    );
  }

  const name = inferName(parsed.cwd, parsed.hint);
  const slug = await uniqueSlug(slugify(name));

  const created = await prisma.project.create({
    data: {
      slug,
      name,
      cwd: parsed.cwd,
      icon: pickIcon(name, parsed.cwd),
      state: "exploring",
    },
  });
  await prisma.brain.create({
    data: {
      projectId: created.id,
      currentFocus: `Auto-registered from ${parsed.cwd}. Brain will populate after the first session ends.`,
    },
  });

  return NextResponse.json({ project: created, created: true });
}
