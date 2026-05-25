<div align="center">

# Continuum

**A living project brain for founders running many AI-assisted projects.**

[![Release](https://img.shields.io/github/v/release/sudomichael/continuum?label=release&color=4b8eff)](https://github.com/sudomichael/continuum/releases)
[![CI](https://img.shields.io/github/actions/workflow/status/sudomichael/continuum/release.yml?label=release%20build)](https://github.com/sudomichael/continuum/actions)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-green.svg)](./LICENSE)
[![Discussions](https://img.shields.io/github/discussions/sudomichael/continuum?color=adc6ff)](https://github.com/sudomichael/continuum/discussions)

[**getcontinuum.dev**](https://getcontinuum.dev) · [Install](#install) · [How it works](#how-it-works) · [Self-host](#self-hosting) · [Contributing](./CONTRIBUTING.md)

</div>

---

Continuum continuously synthesizes a tight operational document for each of your AI-assisted projects — what it is, where it stands, what's blocking, what's next — from your **Claude Code** and **Codex** sessions, manual captures, and decisions. Stop work for three weeks, come back, regain full context in under 30 seconds.

> AI coding sessions act like isolated managers. Continuum is the executive layer above them.

## Install

**On your dev machine** (one line, after you've stood up a Continuum server):

```bash
curl -fsSL https://get.getcontinuum.dev/install.sh | sh
```

That downloads the `continuum` CLI, verifies its SHA256, drops it into `~/.continuum/bin/`, wires your shell, and drops you straight into `continuum connect` — the browser-pairing flow that authorizes this machine and installs hooks into every coding agent it finds (Claude Code, Codex CLI).

Alternate install paths:

- **Homebrew** (macOS / Linux): `brew install sudomichael/tap/continuum`
- **Go**: `go install github.com/sudomichael/continuum/cli@latest`
- **Binary download**: grab a release from [the releases page](https://github.com/sudomichael/continuum/releases)

To install Continuum the **server**, see [Self-hosting](#self-hosting).

## How it works

```
┌──────────────┐       SessionEnd / Stop hook       ┌─────────────────┐
│ Claude Code  │ ─────── transcript via POST ─────▶ │   Continuum     │
│ Codex CLI    │                                    │   (your server) │
│ (any agent)  │ ◀─── tools via MCP server ─────── │                 │
└──────────────┘                                    └────────┬────────┘
                                                             │
                                                             ▼
                                                   ┌─────────────────┐
                                                   │ Brain synthesis │
                                                   │ (SMART + CHEAP  │
                                                   │  AI tiers)      │
                                                   └─────────────────┘
```

1. **Hooks fire automatically** on session events. SessionStart auto-registers any git repo as a project. SessionEnd / Stop POSTs the transcript to your Continuum server.
2. **Continuum summarizes** the session via a cheap model and **synthesizes a brain doc** via a smart model: what changed, decisions made, blockers, next actions.
3. **The dashboard surfaces it** — one row per project showing state, focus, momentum, blockers. Open a project to see its full brain, threads, decisions, and timeline.
4. **MCP tools** give agents a way to talk back: *"register this with continuum,"* *"what's blocking parcelwise?"* etc.

## Surfaces

| Path | What |
| --- | --- |
| `/` | Executive dashboard — one row per project |
| `/projects/[slug]` | Project Brain — synthesized sections + threads + decisions + recent updates |
| `/timeline` | Chronological operational memory stream |
| `/settings` | AI provider, password, connected CLI devices |
| `CMD+K` | Quick Capture — paste a thought; AI classifies + re-synthesizes |

## AI provider flexibility

Two model tiers, each independently configurable:

- **SMART** — brain synthesis (low volume, strategic)
- **CHEAP** — session summarization + capture classification (high volume)

Built-in presets:

| Provider | Notes |
| --- | --- |
| Anthropic (Claude) | Native SDK, top quality |
| OpenAI (GPT) | |
| **Ollama** | Local, free OSS models. $0/mo. |
| **OpenRouter** | One key, 100+ models including OSS |
| Custom | Any OpenAI-compatible endpoint (vLLM, llama-cpp-server, LM Studio, Groq, Together, DeepSeek, …) |

Configure in `/settings`. Mix-and-match freely — e.g. Anthropic SMART + Ollama CHEAP keeps quality up where it matters and costs near zero where it doesn't.

## Self-hosting

Continuum the **server** is a Next.js app + Postgres. Three install options, in order of effort:

### Option A — Docker Compose (recommended)

```bash
git clone https://github.com/sudomichael/continuum
cd continuum
docker compose up -d           # spins up Postgres
cp .env.example .env
# Edit .env — paste the docker postgres URL or a Neon URL
npm install
npm run build && npm start
```

### Option B — Build from source against your own Postgres

Same as A but skip `docker compose up`. Point `DATABASE_URL` at whatever Postgres you've already got — [Neon](https://neon.tech) free tier is the lowest-effort path.

### Option C — Deploy to Vercel / Render / Railway (coming soon)

One-click deploy buttons land in the next release. Until then, the source install above works on any Node host.

After `npm start`, open `http://localhost:3000` and log in with password **`continuum`** (change it immediately at `/settings`). Then install the CLI on every machine where you use Claude Code / Codex — they all point at the same Continuum.

## Bring your own agent

Continuum officially supports Claude Code and Codex CLI hooks. **Anything else** that can run a shell command at session end can plug in via the universal ingest endpoint:

```bash
curl -X POST "$CONTINUUM_URL/api/ingest" \
  -H "Content-Type: application/json" \
  -H "X-Continuum-Token: $CONTINUUM_TOKEN" \
  -d '{ "cwd": "'"$(pwd)"'", "source": "custom", "sessionId": "...", "transcript": "..." }'
```

If `sessionId` is included, Continuum dedupes per-session so per-turn hooks work too. Works with Cursor, Aider, Cline, Gemini CLI, custom shell wrappers.

## Privacy + telemetry

Continuum does **not** collect telemetry by default. The CLI can ping an aggregate-count endpoint when explicitly opted in (`CONTINUUM_TELEMETRY=1`); without that env var, no network calls beyond your own Continuum server are ever made. Your transcripts go only to *your* server and *your* AI provider.

## Env vars

See [.env.example](./.env.example). Headlines:

| Var | What |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (required) |
| `ENCRYPTION_KEY` | 32-byte hex; auto-generated on first run. Encrypts AI provider keys at rest. |
| `CONTINUUM_TOKEN` | Legacy shared secret for hooks. New installs should use per-device CLI tokens (browser pairing). |
| `CONTINUUM_PASSWORD_HASH` | Optional pre-seeded scrypt hash for stateless deploys. |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | Fallbacks if `/settings` is empty for that provider. |
| `DEMO_MODE=1` | Run with a canned mock provider (no real AI calls). |

## License

[AGPL-3.0](./LICENSE). Self-hosting is free forever. If you modify Continuum and run it as a service for others, your changes must be released under the same license. A managed hosted version is planned — same codebase, paid features gated behind env flags.

## Contributing

[CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines. Security reports: [SECURITY.md](./SECURITY.md).
