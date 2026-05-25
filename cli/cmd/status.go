// `continuum status` — diagnostic. Shows the configured server URL, the
// paired device name, and whether each detected agent has Continuum hooks
// installed.

package cmd

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"

	"github.com/sudomichael/continuum/cli/internal/cfg"
	"github.com/sudomichael/continuum/cli/internal/discover"
)

func statusCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "status",
		Short: "Show pairing + hook install state for this machine",
		RunE: func(cmd *cobra.Command, args []string) error {
			conf, present, err := cfg.Load()
			if err != nil {
				return err
			}
			if !present {
				fmt.Println("Not connected. Run `continuum connect` to pair this machine.")
				return nil
			}

			fmt.Printf("Continuum: %s\n", conf.URL)
			if conf.DeviceID != "" {
				fmt.Printf("Device:    %s (%s)\n", conf.DeviceID, conf.Platform)
			}
			fmt.Println()

			found, err := discover.Detect()
			if err != nil {
				return err
			}
			if len(found) == 0 {
				fmt.Println("No coding agents detected.")
				return nil
			}
			for _, f := range found {
				installed := checkInstalled(f)
				icon := "✗"
				if installed {
					icon = "✓"
				}
				fmt.Printf("  %s %s — %s\n", icon, f.Label, f.Dir)
			}
			return nil
		},
	}
}

func checkInstalled(f discover.Found) bool {
	switch f.Agent {
	case discover.AgentClaude:
		return exists(filepath.Join(f.Dir, "continuum-hook.sh"))
	case discover.AgentCodex:
		return exists(filepath.Join(f.Dir, "continuum-codex-hook.sh"))
	}
	return false
}

func exists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}
