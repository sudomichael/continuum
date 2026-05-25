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

	if err := writeJSON(settingsPath, settings); err != nil {
		return ClaudeResult{}, err
	}
	return ClaudeResult{
		HookPath:         hookPath,
		SessionStartPath: startPath,
		SettingsPath:     settingsPath,
		BackupCreated:    backupCreated,
	}, nil
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
