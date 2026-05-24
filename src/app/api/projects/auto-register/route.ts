// Auto-register a project from a Claude Code session.
//
// Called by the SessionStart hook (and the MCP server). Given a cwd, this:
//   1. Finds an existing project bound to that cwd → returns it.
//   2. Otherwise infers a name from package.json or the directory basename,
//      generates a slug, creates a project + empty brain, and returns it.
//
// Token auth via X-Continuum-Token (same shared secret as /api/ingest).

import { NextResponse } from "next/server";
import { z } from "zod";
import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { prisma } from "@/lib/db";

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

export async function POST(req: Request) {
  const expected = process.env.CONTINUUM_TOKEN;
  if (expected) {
    const got = req.headers.get("x-continuum-token");
    if (got !== expected) {
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
      icon: "psychology",
      state: "active",
    },
  });
  await prisma.brain.create({
    data: { projectId: created.id, currentFocus: `Just registered from ${parsed.cwd}.` },
  });

  return NextResponse.json({ project: created, created: true });
}
