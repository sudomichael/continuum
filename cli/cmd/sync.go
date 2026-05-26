// `continuum sync`
//
// Backfills Claude Code session transcripts that the SessionEnd hook
// missed (because SessionEnd only fires on clean exit, and most users
// hard-kill or have multiple sessions still open). Walks
// ~/.claude/projects/<encoded-cwd>/*.jsonl, auto-registers the
// project per transcript, and POSTs the full content to /api/ingest.
//
// Server-side dedup is keyed on (source="claude_code", sessionId), so
// running `sync` repeatedly is safe and idempotent — re-ingesting the
// same session overwrites the previous fanout rather than stacking.
//
// Also runs automatically at the end of `continuum connect` so a fresh
// install lands the user on a populated dashboard, not an empty one.

package cmd

import (
	"fmt"
	"path/filepath"

	"github.com/spf13/cobra"

	"github.com/sudomichael/continuum/cli/internal/cfg"
	"github.com/sudomichael/continuum/cli/internal/httpx"
	"github.com/sudomichael/continuum/cli/internal/transcripts"
)

func lastPathSegment(p string) string {
	return filepath.Base(p)
}

func syncCmd() *cobra.Command {
	var limit int
	c := &cobra.Command{
		Use:   "sync",
		Short: "Ingest existing Claude Code transcripts into Continuum",
		Long: `Backfills sessions that the SessionEnd hook never delivered (most
common case: you killed Claude Code mid-session). Reads transcripts from
~/.claude/projects/ and POSTs each to /api/ingest. Idempotent.`,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runSync(limit, true /* interactive */)
		},
	}
	c.Flags().IntVar(&limit, "limit", 0, "max sessions to ingest (0 = all)")
	return c
}

// RunSync is exposed so `connect` can call it after install.
func RunSync(limit int, verbose bool) error {
	return runSync(limit, verbose)
}

func runSync(limit int, verbose bool) error {
	conf, exists, err := cfg.Load()
	if err != nil {
		return err
	}
	if !exists {
		return fmt.Errorf("not connected — run `continuum connect` first")
	}

	sessions, err := transcripts.Discover()
	if err != nil {
		return err
	}
	if len(sessions) == 0 {
		if verbose {
			fmt.Println("No Claude Code transcripts found yet.")
		}
		return nil
	}

	if limit > 0 && len(sessions) > limit {
		sessions = sessions[:limit]
	}

	client := httpx.New(conf.URL, conf.Token)
	if verbose {
		fmt.Printf("Found %d session(s). Ingesting…\n", len(sessions))
	}

	ok, skipped, failed := 0, 0, 0
	for i, s := range sessions {
		// Drop draft / empty-ish sessions. <2KB is "permission-mode line
		// plus maybe one snapshot" — no real conversation, no value.
		if s.Size < 2048 {
			skipped++
			if verbose {
				fmt.Printf("  [%d/%d] %s — skipped (too small: %dB)\n",
					i+1, len(sessions), s.SessionID[:8], s.Size)
			}
			continue
		}

		// Auto-register the project from the transcript's cwd. The server
		// is idempotent; existing projects come back unchanged.
		var reg struct {
			Project struct {
				ID   string `json:"id"`
				Slug string `json:"slug"`
				Name string `json:"name"`
			} `json:"project"`
			Created bool `json:"created"`
		}
		// Sync is bulk backfill — accept non-git directories too. The user
		// already used Claude Code there, that's intent enough. We pass a
		// `hint` of the directory basename so auto-register has a name to
		// derive a slug from when there's no package.json/.git context.
		hint := lastPathSegment(s.Cwd)
		if err := client.PostJSON("/api/projects/auto-register",
			map[string]any{"cwd": s.Cwd, "hint": hint}, &reg); err != nil {
			failed++
			if verbose {
				fmt.Printf("  [%d/%d] %s — auto-register failed: %v\n",
					i+1, len(sessions), s.SessionID[:8], err)
			}
			continue
		}

		body, err := transcripts.ReadAll(s.Path)
		if err != nil {
			failed++
			if verbose {
				fmt.Printf("  [%d/%d] %s — read failed: %v\n",
					i+1, len(sessions), s.SessionID[:8], err)
			}
			continue
		}

		// Cap at 1MB to stay well under the 2MB ingest limit; the server
		// trims again to ~60k chars before summarization, so anything
		// past that is dead weight.
		const maxPayload = 1_000_000
		if len(body) > maxPayload {
			body = body[len(body)-maxPayload:]
		}

		if err := client.PostJSON("/api/ingest", map[string]any{
			"cwd":         s.Cwd,
			"source":      "claude_code",
			"sessionId":   s.SessionID,
			"transcript":  body,
			"projectSlug": reg.Project.Slug,
		}, nil); err != nil {
			failed++
			if verbose {
				fmt.Printf("  [%d/%d] %s (%s) — ingest failed: %v\n",
					i+1, len(sessions), s.SessionID[:8], reg.Project.Slug, err)
			}
			continue
		}
		ok++
		if verbose {
			fmt.Printf("  [%d/%d] %s → %s ✓\n",
				i+1, len(sessions), s.SessionID[:8], reg.Project.Slug)
		}
	}

	if verbose {
		fmt.Println()
		fmt.Printf("Sync complete: %d ingested, %d skipped, %d failed.\n", ok, skipped, failed)
	}
	if failed > 0 {
		return fmt.Errorf("%d session(s) failed", failed)
	}
	return nil
}
