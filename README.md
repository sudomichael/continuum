# Continuum

A **living project brain** for founders running many AI-assisted projects at once.

Continuum synthesizes a tight operational document for each project — what it is, where it stands, what's blocking, what's next — from your Claude Code sessions, manual notes, and decisions. Stop work for three weeks, come back, regain full context in under 30 seconds.

> AI coding sessions act like isolated managers. Continuum is the executive layer above them.

---

## Installing from source

Requirements: Node 20+, a Postgres database (any host — Neon, Supabase, RDS, a local install, or the `docker compose` option below).

```bash
git clone <this-repo> continuum
cd continuum
npm install
```

Create a `.env` with your database connection string:

```
DATABASE_URL=postgresql://username:password@localhost:5432/continuum
```

Then build and start:

```bash
npm run build
npm start
```

Open <http://localhost:3000>. The build step creates tables in your database if you're installing for the first time (so `DATABASE_URL` must be reachable during `npm run build`). It will also create a login user with password **`continuum`** — change it in `/settings` after signing in.

Without an API key, Continuum runs in **demo mode** with a canned AI provider so you can poke around the UI. To unlock real synthesis, visit `/settings` and paste an Anthropic or OpenAI key. Keys are encrypted at rest (`AES-256-GCM`).

## Running Postgres with Docker

If you don't want to bring your own Postgres, the repo ships a `docker-compose.yml` with a local Postgres service. From the repo root:

```bash
docker compose up -d
```

Then set `DATABASE_URL=postgresql://continuum:continuum@localhost:5432/continuum` in `.env` and follow the source install above.

## Connect your coding agent

The headline feature: every coding session in a git repo auto-registers as a project, its transcript gets summarized on session end, and that project's brain re-synthesizes.

**One command, on any machine:**

```bash
curl -fsSL https://get.getcontinuum.dev/install.sh | sh
continuum connect
```

That:

1. Downloads the `continuum` binary into `~/.continuum/bin/` and adds it to your PATH.
2. Opens your browser so you can authorize this machine against your Continuum server.
3. Auto-detects every supported coding agent on your machine and offers to install hooks for each (Claude Code, OpenAI Codex CLI, more coming).

Restart any open agent sessions so they pick up the new hooks. Re-run anytime — `continuum connect` is idempotent. Manage paired devices in **Settings → Connected Devices**.

> **Already cloned this repo for hacking?** You can also run `npm run connect-claude-code` / `npm run connect-codex` from the repo root — same effect, no CLI install needed.

### Codex CLI caveat

Codex doesn't yet expose a true `SessionEnd` event ([openai/codex#20603](https://github.com/openai/codex/issues/20603)) so the installer registers against `Stop` (fires per-turn). The server dedupes by `session_id`, so the project brain stays current as the session grows instead of stacking duplicate session rows. When upstream ships `SessionEnd`, swap the event name in `~/.codex/hooks.json` — no other change needed.

## Connect any other coding agent

Anything that can run a shell command at session end can feed Continuum. POST the transcript to `/api/ingest`:

```bash
curl -X POST "$CONTINUUM_URL/api/ingest" \
  -H "Content-Type: application/json" \
  -H "X-Continuum-Token: $CONTINUUM_TOKEN" \
  -d @- <<EOF
{
  "cwd": "$(pwd)",
  "source": "claude_code",
  "sessionId": "<stable session id, optional but recommended>",
  "transcript": "$(cat path/to/transcript)"
}
EOF
```

If `sessionId` is included, Continuum dedupes per-session — handy for tools that fire mid-session (e.g. Codex's `Stop` event). The first matching `cwd` resolves to a registered project; if no project is bound to that `cwd`, hit `/api/projects/auto-register` first.

Works with Cursor, Aider, Cline, Gemini CLI, Aider, custom shell wrappers — anything with a session-end hook or a way to grab the transcript.

## AI provider flexibility

Continuum uses two model tiers, each independently configurable:

- **SMART** — brain synthesis (low volume, strategic)
- **CHEAP** — session summarization + capture classification (high volume, easier)

Each tier has its own provider, base URL, model, and API key. Mix-and-match freely — e.g. Anthropic for SMART, Ollama for CHEAP.

**Built-in presets:**
- Anthropic (Claude) — native SDK, top quality
- OpenAI (GPT)
- **Ollama** — local, free, OSS models. Zero API cost.
- **OpenRouter** — one key, 100+ models including OSS
- **Custom** — any OpenAI-compatible endpoint (vLLM, llama-cpp-server, LM Studio, Groq, Together, DeepSeek, …)

**Cost** depends on what you pick:
- Both tiers Anthropic: ~$30–60/month at heavy usage
- Both tiers Ollama (local): **$0**
- Anthropic SMART + Ollama CHEAP: ~$5–10/month
- OpenRouter on cheaper OSS models: ~$2–10/month

Configure in `/settings`. Hit `TEST_CONNECTION` on each tier to verify before saving.

## Surfaces

| Path | What it does |
| --- | --- |
| `/` | Executive dashboard — one row per project: state, focus, blockers, momentum, health |
| `/projects/[slug]` | Project Brain — synthesized sections + threads + decisions + recent updates |
| `/timeline` | Chronological operational memory stream, filterable |
| `/settings` | API keys, provider, model selection, password |
| `CMD+K` anywhere | Quick Capture — paste a thought; AI classifies + re-synthesizes |

## Env vars

| Var | Required | What it's for |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string. |
| `ENCRYPTION_KEY` | yes | 32-byte hex (`openssl rand -hex 32`). Encrypts API keys at rest. Auto-generated on first `npm run build` if missing. |
| `CONTINUUM_TOKEN` | yes | 24-byte hex (`openssl rand -hex 24`). Shared secret Claude Code / Codex hooks send in `X-Continuum-Token`. Auto-generated on first `npm run build` if missing. |
| `CONTINUUM_URL` | no | Where Continuum is reachable. Used by the installer to wire up Claude Code; defaults to `http://localhost:3000`. |
| `CONTINUUM_PASSWORD_HASH` | no | Pre-seed the web login password as a scrypt hash. In-DB value (set via `/settings`) takes precedence. |
| `ANTHROPIC_API_KEY` | no | Fallback if `/settings` is empty for the Anthropic provider. |
| `OPENAI_API_KEY` | no | Same idea for OpenAI. |
| `DEMO_MODE` | no | Set to `1` to use the canned mock AI provider (no real keys needed). |

## License

[AGPL-3.0](./LICENSE). Self-hosting is free forever. If you modify Continuum and run it as a service for others, your changes must be released under the same license.
