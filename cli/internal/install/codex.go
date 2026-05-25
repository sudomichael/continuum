// Install the Continuum Codex hook. Mirrors scripts/install-codex-hook.ts.
//
// Codex doesn't ship a SessionEnd event yet (openai/codex#20603), so we
// register against `Stop` (fires per-turn). Server-side dedup by sessionId
// keeps the brain coherent.

package install

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/sudomichael/continuum/cli/embedded"
)

type CodexResult struct {
	HookPath      string
	HooksJSONPath string
	BackupCreated bool
}

func Codex(codexDir, continuumURL, continuumToken string) (CodexResult, error) {
	if err := os.MkdirAll(codexDir, 0o755); err != nil {
		return CodexResult{}, err
	}

	hookPath := filepath.Join(codexDir, "continuum-codex-hook.sh")
	hooksJSONPath := filepath.Join(codexDir, "hooks.json")

	if err := writeExecutable(hookPath, embedded.CodexStopHook); err != nil {
		return CodexResult{}, fmt.Errorf("write %s: %w", hookPath, err)
	}

	cfg, err := readJSON(hooksJSONPath)
	if err != nil {
		return CodexResult{}, err
	}
	backupCreated, err := backupOnce(hooksJSONPath)
	if err != nil {
		return CodexResult{}, err
	}

	addCodexHookEntry(cfg, "Stop", hookPath)
	setEnv(cfg, "CONTINUUM_URL", continuumURL)
	setEnv(cfg, "CONTINUUM_TOKEN", continuumToken)

	if err := writeJSON(hooksJSONPath, cfg); err != nil {
		return CodexResult{}, err
	}
	return CodexResult{
		HookPath:      hookPath,
		HooksJSONPath: hooksJSONPath,
		BackupCreated: backupCreated,
	}, nil
}

// addCodexHookEntry mirrors the TS install-codex-hook.ts: same shape as
// Claude's hooks structure (Codex copied the convention).
func addCodexHookEntry(cfg map[string]any, event, command string) {
	hooks, _ := cfg["hooks"].(map[string]any)
	if hooks == nil {
		hooks = map[string]any{}
		cfg["hooks"] = hooks
	}
	groups, _ := hooks[event].([]any)
	for _, g := range groups {
		group, _ := g.(map[string]any)
		hs, _ := group["hooks"].([]any)
		for _, h := range hs {
			hm, _ := h.(map[string]any)
			if hm["type"] == "command" && hm["command"] == command {
				return
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
