// Uninstall: remove hook scripts + Continuum's entries from settings.json /
// hooks.json. Restores the backup if one exists. Used by `continuum disconnect`.

package install

import (
	"errors"
	"os"
	"path/filepath"
)

type UninstallResult struct {
	Removed []string
	Skipped []string
}

func Uninstall(claudeDir, codexDir string) (UninstallResult, error) {
	var res UninstallResult
	var firstErr error

	// Claude
	for _, p := range []string{
		filepath.Join(claudeDir, "continuum-hook.sh"),
		filepath.Join(claudeDir, "continuum-session-start.sh"),
	} {
		if removed, err := tryRemove(p); err != nil {
			if firstErr == nil {
				firstErr = err
			}
		} else if removed {
			res.Removed = append(res.Removed, p)
		}
	}
	if err := stripFromJSON(
		filepath.Join(claudeDir, "settings.json"),
		[]string{
			"~/.claude/continuum-hook.sh",
			"~/.claude/continuum-session-start.sh",
		},
		[]string{"CONTINUUM_URL", "CONTINUUM_TOKEN"},
	); err != nil {
		if firstErr == nil {
			firstErr = err
		}
	}

	// Codex
	codexHook := filepath.Join(codexDir, "continuum-codex-hook.sh")
	if removed, err := tryRemove(codexHook); err != nil {
		if firstErr == nil {
			firstErr = err
		}
	} else if removed {
		res.Removed = append(res.Removed, codexHook)
	}
	if err := stripFromJSON(
		filepath.Join(codexDir, "hooks.json"),
		[]string{codexHook},
		[]string{"CONTINUUM_URL", "CONTINUUM_TOKEN"},
	); err != nil {
		if firstErr == nil {
			firstErr = err
		}
	}

	return res, firstErr
}

func tryRemove(path string) (bool, error) {
	if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	return true, os.Remove(path)
}

func stripFromJSON(path string, commands []string, envKeys []string) error {
	if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
		return nil
	}
	cfg, err := readJSON(path)
	if err != nil {
		return err
	}

	hooks, _ := cfg["hooks"].(map[string]any)
	if hooks != nil {
		for event, raw := range hooks {
			groups, _ := raw.([]any)
			kept := make([]any, 0, len(groups))
			for _, g := range groups {
				group, _ := g.(map[string]any)
				hs, _ := group["hooks"].([]any)
				keptHooks := make([]any, 0, len(hs))
				for _, h := range hs {
					hm, _ := h.(map[string]any)
					if hm["type"] == "command" && contains(commands, asString(hm["command"])) {
						continue
					}
					keptHooks = append(keptHooks, h)
				}
				if len(keptHooks) > 0 {
					group["hooks"] = keptHooks
					kept = append(kept, group)
				}
			}
			if len(kept) == 0 {
				delete(hooks, event)
			} else {
				hooks[event] = kept
			}
		}
		if len(hooks) == 0 {
			delete(cfg, "hooks")
		}
	}

	env, _ := cfg["env"].(map[string]any)
	if env != nil {
		for _, k := range envKeys {
			delete(env, k)
		}
		if len(env) == 0 {
			delete(cfg, "env")
		}
	}

	return writeJSON(path, cfg)
}

func contains(haystack []string, needle string) bool {
	for _, h := range haystack {
		if h == needle {
			return true
		}
	}
	return false
}

func asString(v any) string {
	s, _ := v.(string)
	return s
}
