// Install the Continuum hooks for Claude Code.
//
// Mirrors scripts/install-hook.ts. Writes hook scripts to ~/.claude/,
// patches ~/.claude/settings.json with hook + env entries, backs up the
// existing settings.json once. Idempotent.

package install

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/sudomichael/continuum/cli/embedded"
)

type ClaudeResult struct {
	HookPath         string
	SessionStartPath string
	SettingsPath     string
	MCPScriptPath    string // empty if MCP install was skipped
	BackupCreated    bool
}

func Claude(claudeDir, continuumURL, continuumToken string) (ClaudeResult, error) {
	if err := os.MkdirAll(claudeDir, 0o755); err != nil {
		return ClaudeResult{}, err
	}

	hookPath := filepath.Join(claudeDir, "continuum-hook.sh")
	startPath := filepath.Join(claudeDir, "continuum-session-start.sh")
	settingsPath := filepath.Join(claudeDir, "settings.json")

	if err := writeExecutable(hookPath, embedded.ClaudeSessionEndHook); err != nil {
		return ClaudeResult{}, fmt.Errorf("write %s: %w", hookPath, err)
	}
	if err := writeExecutable(startPath, embedded.ClaudeSessionStartHook); err != nil {
		return ClaudeResult{}, fmt.Errorf("write %s: %w", startPath, err)
	}

	// Drop the MCP server script into ~/.continuum/mcp/ so Claude Code can
	// run it via `npx tsx <path>`. We don't ship a Node runtime ourselves —
	// devs using Claude Code already have Node — but we own the script so
	// it stays in sync with the server.
	mcpPath, err := writeMCPScript()
	if err != nil {
		// Non-fatal: hooks still work without MCP. Print a softer warning
		// upstream (the caller decides whether to surface).
		mcpPath = ""
	}

	settings, err := readJSON(settingsPath)
	if err != nil {
		return ClaudeResult{}, err
	}
	backupCreated, err := backupOnce(settingsPath)
	if err != nil {
		return ClaudeResult{}, err
	}

	addClaudeHookEntry(settings, "SessionEnd", "~/.claude/continuum-hook.sh")
	addClaudeHookEntry(settings, "SessionStart", "~/.claude/continuum-session-start.sh")
	setEnv(settings, "CONTINUUM_URL", continuumURL)
	setEnv(settings, "CONTINUUM_TOKEN", continuumToken)
	if mcpPath != "" {
		registerMCPServer(settings, mcpPath, continuumURL, continuumToken)
	}

	if err := writeJSON(settingsPath, settings); err != nil {
		return ClaudeResult{}, err
	}
	return ClaudeResult{
		HookPath:         hookPath,
		SessionStartPath: startPath,
		SettingsPath:     settingsPath,
		MCPScriptPath:    mcpPath,
		BackupCreated:    backupCreated,
	}, nil
}

// writeMCPScript drops the MCP TS source into ~/.continuum/mcp/. Returns
// the path so the settings.json patch can reference it.
func writeMCPScript() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(home, ".continuum", "mcp")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	path := filepath.Join(dir, "continuum-mcp.ts")
	if err := os.WriteFile(path, embedded.ClaudeMCPServer, 0o644); err != nil {
		return "", err
	}
	return path, nil
}

// registerMCPServer adds (or updates) a "continuum" entry in
// settings.mcpServers — same shape Claude Code's MCP system expects.
// Uses `npx tsx` so the user doesn't need a separate runtime install.
func registerMCPServer(settings map[string]any, scriptPath, url, token string) {
	servers, _ := settings["mcpServers"].(map[string]any)
	if servers == nil {
		servers = map[string]any{}
		settings["mcpServers"] = servers
	}
	servers["continuum"] = map[string]any{
		"type":    "stdio",
		"command": "npx",
		"args":    []any{"-y", "tsx", scriptPath},
		"env": map[string]any{
			"CONTINUUM_URL":   url,
			"CONTINUUM_TOKEN": token,
		},
	}
}

// addClaudeHookEntry mirrors the TS install-hook.ts: settings.hooks[event]
// is an array of { hooks: [{ type: "command", command: ... }] } groups.
// Idempotent — re-running doesn't double-add.
func addClaudeHookEntry(settings map[string]any, event, command string) {
	hooks, _ := settings["hooks"].(map[string]any)
	if hooks == nil {
		hooks = map[string]any{}
		settings["hooks"] = hooks
	}
	groups, _ := hooks[event].([]any)
	for _, g := range groups {
		group, _ := g.(map[string]any)
		hs, _ := group["hooks"].([]any)
		for _, h := range hs {
			hm, _ := h.(map[string]any)
			if hm["type"] == "command" && hm["command"] == command {
				return // already present
			}
		}
	}
	groups = append(groups, map[string]any{
		"hooks": []any{
			map[string]any{"type": "command", "command": command},
		},
	})
	hooks[event] = groups
}

func setEnv(settings map[string]any, key, value string) {
	env, _ := settings["env"].(map[string]any)
	if env == nil {
		env = map[string]any{}
		settings["env"] = env
	}
	env[key] = value
}

func readJSON(path string) (map[string]any, error) {
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return map[string]any{}, nil
	}
	if err != nil {
		return nil, err
	}
	if len(data) == 0 {
		return map[string]any{}, nil
	}
	var out map[string]any
	if err := json.Unmarshal(data, &out); err != nil {
		return nil, fmt.Errorf("parse %s: %w (refusing to overwrite; fix the file and retry)", path, err)
	}
	if out == nil {
		return map[string]any{}, nil
	}
	return out, nil
}

func writeJSON(path string, v any) error {
	buf, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	buf = append(buf, '\n')
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, buf, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func writeExecutable(path string, contents []byte) error {
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, contents, 0o755); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func backupOnce(path string) (bool, error) {
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return false, nil
	}
	bak := path + ".continuum.bak"
	if _, err := os.Stat(bak); err == nil {
		return false, nil // already backed up
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return false, err
	}
	if err := os.WriteFile(bak, data, 0o644); err != nil {
		return false, err
	}
	return true, nil
}
