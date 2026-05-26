// `continuum connect`
//
// The one command users actually run. End-to-end:
//   1. Prompt for / reuse the server URL.
//   2. Browser-pair with the server → get a per-device token.
//   3. Auto-discover installed coding agents.
//   4. Install hooks for each (with a per-agent y/N prompt; default y).
//   5. Persist URL + token to ~/.continuum/config.toml.

package cmd

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/sudomichael/continuum/cli/internal/cfg"
	"github.com/sudomichael/continuum/cli/internal/discover"
	"github.com/sudomichael/continuum/cli/internal/install"
	"github.com/sudomichael/continuum/cli/internal/pair"
	"github.com/sudomichael/continuum/cli/internal/telemetry"
)

func connectCmd() *cobra.Command {
	var urlFlag string
	var yes bool

	c := &cobra.Command{
		Use:   "connect",
		Short: "Pair this machine with a Continuum server + install hooks",
		Long: `Opens your browser to authorize this machine, then installs hooks
for every supported coding agent it finds (Claude Code, Codex CLI).

Re-running is safe — hooks are idempotent and the device token is reused.`,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runConnect(urlFlag, yes)
		},
	}
	c.Flags().StringVar(&urlFlag, "url", "", "Continuum server URL (defaults to existing config or prompt)")
	c.Flags().BoolVarP(&yes, "yes", "y", false, "skip per-agent confirmation prompts")
	return c
}

func runConnect(urlFlag string, yes bool) error {
	existing, _, _ := cfg.Load()

	url := strings.TrimSpace(urlFlag)
	if url == "" {
		url = existing.URL
	}
	if url == "" {
		url = promptDefault("Continuum URL", "http://localhost:3000")
	}
	url = normalizeURL(url)

	platform := fmt.Sprintf("%s/%s", runtime.GOOS, runtime.GOARCH)

	// Reuse the device token if we already have one for this server.
	token := existing.Token
	tokenID := existing.TokenID
	tokenName := existing.DeviceID

	if token == "" || existing.URL != url {
		fmt.Println()
		fmt.Println("Opening your browser to authorize this device…")
		result, err := pair.Pair(url, platform, func(authURL string) {
			fmt.Printf("  → %s\n", authURL)
			fmt.Println("(if the browser didn't open, paste that URL into one yourself)")
			fmt.Println()
		})
		if err != nil {
			return err
		}
		token = result.Token
		tokenID = result.TokenID
		tokenName = result.Name
		fmt.Printf("✓ paired as %q\n", tokenName)
	} else {
		fmt.Printf("✓ already paired as %q\n", tokenName)
	}

	// Persist the config BEFORE touching agent settings — that way a hook
	// install failure doesn't leave the user without their token.
	if err := cfg.Save(cfg.Config{
		URL:       url,
		Token:     token,
		TokenID:   tokenID,
		DeviceID:  tokenName,
		Platform:  platform,
		UpdatedAt: time.Now().UTC().Format(time.RFC3339),
	}); err != nil {
		return fmt.Errorf("save config: %w", err)
	}

	// Auto-discover and install.
	found, err := discover.Detect()
	if err != nil {
		return err
	}
	if len(found) == 0 {
		fmt.Println()
		fmt.Println("⚠ Didn't find Claude Code or Codex CLI on this machine.")
		fmt.Println("  Install one of them, then re-run `continuum connect` to add the hooks.")
		return nil
	}

	fmt.Println()
	for _, f := range found {
		if !yes && !promptYesDefaultYes(fmt.Sprintf("Install hook for %s?", f.Label)) {
			fmt.Printf("  skipped %s\n", f.Label)
			continue
		}
		switch f.Agent {
		case discover.AgentClaude:
			res, err := install.Claude(f.Dir, url, token)
			if err != nil {
				return fmt.Errorf("install Claude hook: %w", err)
			}
			fmt.Printf("✓ %s installed → %s + %s\n",
				f.Label,
				filepath.Base(res.HookPath),
				filepath.Base(res.SessionStartPath),
			)
			if res.MCPScriptPath != "" {
				fmt.Printf("  + MCP server registered (continuum_register_project, continuum_capture, …)\n")
			} else {
				fmt.Printf("  ! MCP server skipped — Claude Code won't get the continuum_* tools this run\n")
			}
			if res.BackupCreated {
				fmt.Printf("  backed up your settings.json (one-time)\n")
			}
		case discover.AgentCodex:
			res, err := install.Codex(f.Dir, url, token)
			if err != nil {
				return fmt.Errorf("install Codex hook: %w", err)
			}
			fmt.Printf("✓ %s installed → %s\n", f.Label, filepath.Base(res.HookPath))
			if res.BackupCreated {
				fmt.Printf("  backed up your hooks.json (one-time)\n")
			}
		}
	}

	fmt.Println()
	fmt.Println("Hooks installed. Importing your existing Claude Code sessions…")
	fmt.Println()

	// Backfill any pre-existing transcripts so the dashboard doesn't open
	// to an empty state. Without this, the user's first dashboard load
	// shows their projects with 0 updates each (SessionEnd only fires on
	// future clean exits — anything pre-install is invisible).
	if err := RunSync(0, true); err != nil {
		// Soft-fail: hooks are installed, future sessions will work.
		fmt.Printf("  ! sync had errors: %v\n", err)
		fmt.Println("  Future Claude Code sessions will still ingest via the hooks.")
	}

	fmt.Println()
	fmt.Printf("Open %s to finish setup (pick an AI provider if you haven't).\n", url)
	_ = openBrowser(url)

	telemetry.Event("connect", Version)
	return nil
}

func openBrowser(url string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	return cmd.Start()
}

// ---- prompts ----------------------------------------------------------------

func promptDefault(label, fallback string) string {
	fmt.Printf("%s [%s]: ", label, fallback)
	r := bufio.NewReader(os.Stdin)
	line, _ := r.ReadString('\n')
	line = strings.TrimSpace(line)
	if line == "" {
		return fallback
	}
	return line
}

func promptYesDefaultYes(q string) bool {
	fmt.Printf("%s [Y/n] ", q)
	r := bufio.NewReader(os.Stdin)
	line, _ := r.ReadString('\n')
	line = strings.ToLower(strings.TrimSpace(line))
	return line == "" || line == "y" || line == "yes"
}

func normalizeURL(raw string) string {
	v := strings.TrimSpace(raw)
	if v == "" {
		return v
	}
	if !strings.HasPrefix(v, "http://") && !strings.HasPrefix(v, "https://") {
		v = "http://" + v
	}
	return strings.TrimRight(v, "/")
}
