// Cobra root command + shared version string set by main.

package cmd

import "github.com/spf13/cobra"

var Version = "dev"

func Root() *cobra.Command {
	root := &cobra.Command{
		Use:   "continuum",
		Short: "Continuum CLI — wires AI coding agents into your Continuum brain",
		Long: `Continuum: a living project brain.

This CLI pairs your machine with a Continuum server, then installs hooks
into your AI coding agents (Claude Code, Codex CLI) so every session's
transcript flows back into Continuum for synthesis.

Typical first run:
    continuum connect
    # → opens your browser, you click Authorize, hooks get installed`,
		SilenceUsage:  true,
		SilenceErrors: true,
	}
	root.AddCommand(connectCmd())
	root.AddCommand(statusCmd())
	root.AddCommand(doctorCmd())
	root.AddCommand(disconnectCmd())
	root.AddCommand(versionCmd())
	return root
}
