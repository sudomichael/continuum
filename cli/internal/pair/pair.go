// Package pair runs the browser-based device-pairing dance against a
// Continuum server.
//
// Sequence:
//   1. POST /api/cli-auth/start { platform } → { code, authUrl, expiresAt }
//   2. Open authUrl in the user's default browser
//   3. Poll GET /api/cli-auth/poll?code=... until status flips to authorized
//   4. Return the token + tokenId
//
// The CLI never runs a local listener — polling is simpler, no firewall
// prompts, no port collisions. Tradeoff is ~2s extra latency once the user
// clicks Authorize, which nobody notices.

package pair

import (
	"errors"
	"fmt"
	"os/exec"
	"runtime"
	"time"

	"github.com/sudomichael/continuum/cli/internal/httpx"
)

type startResp struct {
	Code      string `json:"code"`
	AuthURL   string `json:"authUrl"`
	ExpiresAt string `json:"expiresAt"`
}

type pollResp struct {
	Status  string `json:"status"`
	Token   string `json:"token,omitempty"`
	TokenID string `json:"tokenId,omitempty"`
	Name    string `json:"name,omitempty"`
}

// Result is everything the CLI needs to persist into ~/.continuum/config.toml.
type Result struct {
	Token   string
	TokenID string
	Name    string
	AuthURL string
}

// Pair drives the full flow. baseURL must be reachable from this machine
// AND from the browser (typically the same machine). Calls onOpened so the
// caller can print the URL before the browser launches.
func Pair(baseURL, platform string, onOpened func(string)) (Result, error) {
	client := httpx.New(baseURL, "") // no token yet, that's the whole point

	var start startResp
	if err := client.PostJSON("/api/cli-auth/start", map[string]any{
		"platform": platform,
	}, &start); err != nil {
		return Result{}, fmt.Errorf("starting pairing: %w", err)
	}

	if onOpened != nil {
		onOpened(start.AuthURL)
	}
	_ = openBrowser(start.AuthURL) // best-effort; if it fails the URL is already printed

	// Poll every 2s for up to 10 minutes. Server-side TTL is also 10 minutes;
	// we give up first so the user sees a clear timeout.
	deadline := time.Now().Add(10 * time.Minute)
	for time.Now().Before(deadline) {
		time.Sleep(2 * time.Second)
		var p pollResp
		if err := client.GetJSON("/api/cli-auth/poll?code="+start.Code, &p); err != nil {
			// Transient network errors shouldn't kill the wait — keep trying
			// until the deadline.
			continue
		}
		switch p.Status {
		case "authorized":
			return Result{
				Token:   p.Token,
				TokenID: p.TokenID,
				Name:    p.Name,
				AuthURL: start.AuthURL,
			}, nil
		case "expired":
			return Result{}, errors.New("pairing code expired — re-run `continuum connect`")
		case "pending":
			continue
		default:
			return Result{}, fmt.Errorf("unknown pairing status: %q", p.Status)
		}
	}
	return Result{}, errors.New("timed out waiting for browser authorization")
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
