// Strictly opt-in usage telemetry.
//
// **No data is sent unless the user explicitly sets `CONTINUUM_TELEMETRY=1`.**
// Even when opted in, what we send is intentionally tiny — event name,
// CLI version, OS+arch. No transcripts, no project names, no paths, no
// tokens, no user identifiers.
//
// The endpoint is plain-Plausible-style aggregate counting, hosted on the
// marketing site. There is no per-user state.

package telemetry

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"os"
	"runtime"
	"time"
)

// PingURL is overridden by `-X telemetry.PingURL=...` in CI for tests.
var PingURL = "https://getcontinuum.dev/api/cli-event"

func enabled() bool {
	v := os.Getenv("CONTINUUM_TELEMETRY")
	return v == "1" || v == "true"
}

// Event fires a fire-and-forget POST. Safe to call in any code path; if
// telemetry is off (the default), this returns immediately.
func Event(name, cliVersion string) {
	if !enabled() {
		return
	}
	payload, _ := json.Marshal(map[string]string{
		"event":   name,
		"version": cliVersion,
		"os":      runtime.GOOS,
		"arch":    runtime.GOARCH,
	})
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, "POST", PingURL, bytes.NewReader(payload))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	// Best-effort: ignore errors. We never want telemetry to break a CLI run.
	resp, err := http.DefaultClient.Do(req)
	if err == nil {
		resp.Body.Close()
	}
}
