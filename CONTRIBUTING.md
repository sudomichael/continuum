# Contributing to Continuum

Thanks for your interest. Continuum is a small, opinionated project — I'd rather merge a tightly-scoped PR that nails one thing than a big one that touches everything.

## Quick orientation

| Path | What |
| --- | --- |
| `src/` | Next.js 16 app (the server / dashboard) |
| `prisma/` | Schema + migrations |
| `cli/` | Go CLI source (`continuum connect`, etc.) |
| `cli/embedded/hooks/` | Canonical hook scripts. Embedded into the Go binary AND used by the repo-clone install path. |
| `scripts/` | TS install scripts for the repo-clone path (`npm run connect-*`) |
| `cli/embedded/mcp/continuum-mcp.ts` | MCP server for Claude Code |
| `.github/workflows/` | CI + release pipeline |

## Development setup

```bash
git clone https://github.com/sudomichael/continuum
cd continuum
npm install
# Edit .env, set DATABASE_URL (Neon free tier is the fastest path)
npm run dev
```

For the Go CLI:

```bash
cd cli
go build -o /tmp/continuum .
/tmp/continuum --help
```

## Before opening a PR

1. **Open an issue first** for anything non-trivial. Avoids you doing 4 hours of work I'd have steered differently.
2. **Keep PRs small and focused** — one concern per PR.
3. **`npx tsc --noEmit` passes.** No new TS errors.
4. **`cd cli && go build ./...` passes.** No new Go errors.
5. **No new dependencies without a reason in the PR description.** Continuum aims to stay light.

## Commit messages

Lowercase, imperative, no Conventional Commits prefix. The first line should make sense as a release-note bullet:

```
add OpenRouter to the onboarding provider picker
fix race in the SessionStart hook when two repos open at once
```

Not:

```
feat: Add OpenRouter
```

## What I won't merge

- Adding telemetry, ads, analytics, or anything that phones home without opt-in.
- Refactors with no clear win, especially "rename things" PRs.
- New AI providers that aren't OpenAI-compatible (they already work via the `custom` preset).
- New surface area for the cloud version — that's a separate private repo by design.

## What I'd love help with

See [issues tagged `help wanted`](https://github.com/sudomichael/continuum/labels/help%20wanted). Anything labelled `good first issue` is genuinely a first issue.

## Releasing (maintainers)

```bash
git tag v0.X.Y
git push origin v0.X.Y
```

The release workflow builds all 5 CLI binaries, generates `SHA256SUMS`, publishes to GitHub Releases, and triggers the Homebrew tap bump.
