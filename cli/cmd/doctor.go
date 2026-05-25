// `continuum doctor` — diagnostic. Walks every part of the install + token
// + hooks and prints a checklist with PASS / WARN / FAIL per check. The
// goal is "user pastes the output into an issue and I can debug from it."

package cmd

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"time"

	"github.com/spf13/cobra"

	"github.com/sudomichael/continuum/cli/internal/cfg"
	"github.com/sudomichael/continuum/cli/internal/discover"
	"github.com/sudomichael/continuum/cli/internal/httpx"
)

func doctorCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "doctor",
		Short: "Run diagnostics on your Continuum install",
		Long: `Walks every part of the install + token + hooks and prints a
checklist with PASS / WARN / FAIL per check. Paste the output into an
issue when something's broken.`,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runDoctor()
		},
	}
}

type result struct {
	status string // PASS | WARN | FAIL
	label  string
	detail string
}

func runDoctor() error {
	var checks []result

	// 1. Continuum CLI version + platform
	checks = append(checks, result{
		status: "INFO",
		label:  "CLI version",
		detail: fmt.Sprintf("%s (%s/%s)", Version, runtime.GOOS, runtime.GOARCH),
	})

	// 2. Config file
	confPath, _ := cfg.ConfigPath()
	conf, exists, err := cfg.Load()
	if err != nil {
		checks = append(checks, result{"FAIL", "config file", fmt.Sprintf("%s — %v", confPath, err)})
	} else if !exists {
		checks = append(checks, result{"WARN", "config file", fmt.Sprintf("%s — missing. Run `continuum connect`.", confPath)})
		return printAndReturn(checks, false)
	} else {
		checks = append(checks, result{"PASS", "config file", confPath})
		checks = append(checks, result{"INFO", "server URL", conf.URL})
		if conf.DeviceID != "" {
			checks = append(checks, result{"INFO", "device", fmt.Sprintf("%q (%s)", conf.DeviceID, conf.Platform)})
		}
	}

	// 3. Server reachability + token validity. We probe a benign authed
	// endpoint (/api/projects, which lists projects). 401/403 means the
	// token is wrong; 200 means we're good; anything else is server-side.
	if conf.URL == "" || conf.Token == "" {
		checks = append(checks, result{"WARN", "server reachability", "skipped (no URL/token configured)"})
	} else {
		client := httpx.New(conf.URL, conf.Token)
		client.HTTP.Timeout = 10 * time.Second
		if err := client.GetJSON("/api/projects", &[]any{}); err != nil {
			checks = append(checks, result{"FAIL", "server reachability", err.Error()})
		} else {
			checks = append(checks, result{"PASS", "server reachability", "/api/projects responded ok"})
		}
	}

	// 4. Per-agent hook install state.
	found, err := discover.Detect()
	if err != nil {
		checks = append(checks, result{"FAIL", "agent discovery", err.Error()})
	} else if len(found) == 0 {
		checks = append(checks, result{"WARN", "agent discovery", "no agents detected. Install Claude Code or Codex CLI."})
	} else {
		for _, a := range found {
			hookPath := agentHookPath(a)
			if hookPath == "" {
				continue
			}
			if info, err := os.Stat(hookPath); errors.Is(err, os.ErrNotExist) {
				checks = append(checks, result{
					"FAIL",
					fmt.Sprintf("%s hook installed", a.Label),
					fmt.Sprintf("%s missing — run `continuum connect`", hookPath),
				})
			} else if err != nil {
				checks = append(checks, result{
					"FAIL",
					fmt.Sprintf("%s hook installed", a.Label),
					err.Error(),
				})
			} else if info.Mode().Perm()&0o100 == 0 {
				checks = append(checks, result{
					"FAIL",
					fmt.Sprintf("%s hook installed", a.Label),
					fmt.Sprintf("%s not executable (mode %o)", hookPath, info.Mode().Perm()),
				})
			} else {
				checks = append(checks, result{
					"PASS",
					fmt.Sprintf("%s hook installed", a.Label),
					hookPath,
				})
			}
		}
	}

	return printAndReturn(checks, true)
}

func agentHookPath(a discover.Found) string {
	switch a.Agent {
	case discover.AgentClaude:
		return filepath.Join(a.Dir, "continuum-hook.sh")
	case discover.AgentCodex:
		return filepath.Join(a.Dir, "continuum-codex-hook.sh")
	}
	return ""
}

func printAndReturn(checks []result, anyFatal bool) error {
	maxLabel := 0
	for _, c := range checks {
		if len(c.label) > maxLabel {
			maxLabel = len(c.label)
		}
	}
	fmt.Println()
	hasFail := false
	for _, c := range checks {
		var marker string
		switch c.status {
		case "PASS":
			marker = "✓"
		case "WARN":
			marker = "!"
		case "FAIL":
			marker = "✗"
			hasFail = true
		default:
			marker = "·"
		}
		fmt.Printf("  %s [%s] %-*s  %s\n", marker, c.status, maxLabel, c.label, c.detail)
	}
	fmt.Println()
	if hasFail {
		fmt.Println("One or more checks failed. Fixes above; paste this output into a GitHub issue if you're stuck.")
		os.Exit(1)
	} else {
		fmt.Println("All checks passed.")
	}
	return nil
}
