package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
)

func versionCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "version",
		Short: "Print the Continuum CLI version",
		RunE: func(cmd *cobra.Command, args []string) error {
			fmt.Printf("continuum %s\n", Version)
			return nil
		},
	}
}
