// Package embedded ships the hook scripts inside the CLI binary so users
// never deal with file paths. `continuum connect` writes these straight to
// ~/.claude/ and ~/.codex/ at install time.
//
// The hook scripts themselves remain editable .sh files under hooks/ so
// they can also be used by the legacy `npm run connect-claude-code` flow
// for repo cloners.

package embedded

import _ "embed"

//go:embed hooks/continuum-hook.sh
var ClaudeSessionEndHook []byte

//go:embed hooks/continuum-session-start.sh
var ClaudeSessionStartHook []byte

//go:embed hooks/continuum-codex-hook.sh
var CodexStopHook []byte

//go:embed mcp/continuum-mcp.ts
var ClaudeMCPServer []byte
