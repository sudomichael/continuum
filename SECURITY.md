# Security policy

## Supported versions

Only the latest release receives security fixes. Continuum is pre-1.0 and the surface area shifts; please run a recent version.

## Reporting a vulnerability

**Please don't open a public GitHub issue for security reports.** Instead:

- Email **security@getcontinuum.dev** with the details, and
- (Optionally) request a private GitHub Security Advisory at <https://github.com/sudomichael/continuum/security/advisories/new>

I aim to acknowledge within 72 hours, with a fix or mitigation timeline within 7 days. Once a fix is shipped, you'll be credited in the release notes (unless you'd rather not be).

## Scope

In scope:
- The Continuum web app (`src/`)
- The Continuum CLI (`cli/`)
- The hook scripts (`cli/embedded/hooks/`)
- The release / install supply chain (`install.sh`, GitHub Actions, release artifacts)

Out of scope:
- Self-hosted instances misconfigured by the operator (e.g. running without `ENCRYPTION_KEY`, public Postgres with no password). Issues stemming from bad operator config should be opened as regular GitHub issues with a docs-tag.
- Third-party AI providers' security (Anthropic, OpenAI, Ollama, …)

## Known sensitivity notes

- The browser-pairing token issued during `continuum connect` is long-lived and grants ingest/auto-register access. Revoke from **Settings → Connected Devices** on the web UI if a machine is lost.
- API keys for AI providers are encrypted at rest with `AES-256-GCM` using `ENCRYPTION_KEY`. Lose that key and the encrypted keys become unrecoverable.
- The legacy `CONTINUUM_TOKEN` env var is a shared secret with no per-device revocation. Prefer the CLI's per-device tokens for new installs.
