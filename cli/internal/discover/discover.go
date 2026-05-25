// Package discover figures out which coding agents are installed on this
// machine so `continuum connect` can offer hooks for each one without the
// user listing them.
//
// Detection rules (intentionally lenient — false positives are cheap, the
// user gets a prompt for each):
//   - Claude Code: ~/.claude/ directory exists
//   - Codex CLI:   ~/.codex/ directory exists

package discover

import (
	"os"
	"path/filepath"
)

type Agent string

const (
	AgentClaude Agent = "claude"
	AgentCodex  Agent = "codex"
)

// Found reports which agents look installed plus where they live. Returned
// in a stable order so the UX is predictable.
type Found struct {
	Agent Agent
	Label string
	Dir   string
}

func Detect() ([]Found, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}
	var out []Found
	check := func(agent Agent, label, sub string) {
		path := filepath.Join(home, sub)
		if info, err := os.Stat(path); err == nil && info.IsDir() {
			out = append(out, Found{Agent: agent, Label: label, Dir: path})
		}
	}
	check(AgentClaude, "Claude Code", ".claude")
	check(AgentCodex, "OpenAI Codex CLI", ".codex")
	return out, nil
}
