// `continuum disconnect` — remove all installed hooks from this machine.
//
// Intentionally does NOT revoke the device token on the server side —
// that's done from the Continuum web UI (Settings → Connected Devices →
// Revoke). Reason: this command is for "clean off this machine", and the
// server-side revoke is for "kill a machine I no longer control".

package cmd

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"

	"github.com/sudomichael/continuum/cli/internal/cfg"
	"github.com/sudomichael/continuum/cli/internal/install"
)

func disconnectCmd() *cobra.Command {
	var keepConfig bool
	c := &cobra.Command{
		Use:   "disconnect",
		Short: "Remove Continuum hooks from this machine",
		RunE: func(cmd *cobra.Command, args []string) error {
			home, err := os.UserHomeDir()
			if err != nil {
				return err
			}
			res, err := install.Uninstall(
				filepath.Join(home, ".claude"),
				filepath.Join(home, ".codex"),
			)
			if err != nil {
				return err
			}
			if len(res.Removed) == 0 {
				fmt.Println("Nothing to remove — no Continuum hooks were installed.")
			} else {
				for _, r := range res.Removed {
					fmt.Printf("✓ removed %s\n", r)
				}
			}
			if !keepConfig {
				path, _ := cfg.ConfigPath()
				if err := os.Remove(path); err == nil {
					fmt.Printf("✓ removed %s\n", path)
				}
			}
			fmt.Println()
			fmt.Println("To kill the server-side device token too, revoke it in Settings → Connected Devices.")
			return nil
		},
	}
	c.Flags().BoolVar(&keepConfig, "keep-config", false, "leave ~/.continuum/config.toml in place")
	return c
}
