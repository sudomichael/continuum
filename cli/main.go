// Continuum CLI entrypoint.
//
// Single static binary distributed via `curl | sh` (install.sh) or `go install`.
// Embeds the hook scripts via go:embed so the user never deals with file paths
// — `continuum connect` writes everything it needs to ~/.claude/, ~/.codex/, etc.
//
// Subcommands:
//   connect      pair with a Continuum server + install hooks for detected agents
//   status       show what's installed + last-seen timestamps
//   disconnect   remove installed hooks (does NOT delete the server-side device token)
//   version      print version
//
// Config lives at ~/.continuum/config.toml.

package main

import (
	"fmt"
	"os"

	"github.com/sudomichael/continuum/cli/cmd"
)

// Injected at build time via -ldflags "-X main.version=v0.1.0".
var version = "dev"

func main() {
	cmd.Version = version
	if err := cmd.Root().Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
