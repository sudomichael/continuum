// Package transcripts locates and parses Claude Code's session transcripts
// on disk so `continuum sync` can backfill what the SessionEnd hook missed.
//
// Layout discovered empirically (Claude Code 2.x):
//   ~/.claude/projects/<encoded-cwd>/<session-id>.jsonl
//
// `<encoded-cwd>` is the project's cwd with "/" rewritten to "-" (so
// "/Users/me/foo" → "-Users-me-foo"). That encoding is lossy in theory
// (real dashes vs. path separators) but every line of the JSONL also
// carries an explicit "cwd" field, so we treat the directory name as a
// hint and trust the in-file cwd for the canonical answer.
//
// Sessions are JSONL: one JSON object per line. The first line carries
// `{ "type": "permission-mode", "sessionId": "..." }`; subsequent lines
// include user prompts, assistant messages, tool calls, etc. We don't
// need to parse beyond extracting cwd + sessionId — the server-side
// summarizer treats the whole transcript as one blob.

package transcripts

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type Session struct {
	Path      string // absolute path to the .jsonl file
	SessionID string // UUID, also the filename without extension
	Cwd       string // working directory the session ran in
	Size      int64  // bytes — used to skip empty drafts
}

// ProjectsDir returns ~/.claude/projects/ if present.
func ProjectsDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(home, ".claude", "projects")
	if _, err := os.Stat(dir); errors.Is(err, os.ErrNotExist) {
		return "", fmt.Errorf("no Claude Code transcripts found (%s missing)", dir)
	}
	return dir, nil
}

// Discover walks the projects dir and returns one Session per .jsonl. Files
// with no cwd/sessionId we could parse are skipped silently — they're
// usually mid-write or corrupted.
func Discover() ([]Session, error) {
	dir, err := ProjectsDir()
	if err != nil {
		return nil, err
	}
	var out []Session
	err = filepath.Walk(dir, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return nil // ignore permission errors etc., keep walking
		}
		if info.IsDir() {
			return nil
		}
		if !strings.HasSuffix(info.Name(), ".jsonl") {
			return nil
		}
		s, ok := parseHeader(path, info.Size())
		if !ok {
			return nil
		}
		out = append(out, s)
		return nil
	})
	return out, err
}

// parseHeader scans the first ~50 lines of a JSONL looking for sessionId
// + cwd. Both fields appear in the first few entries; we don't need to
// read the whole file. Returns (zero, false) if we couldn't find either.
func parseHeader(path string, size int64) (Session, bool) {
	f, err := os.Open(path)
	if err != nil {
		return Session{}, false
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	// Claude transcripts can have very long lines (long assistant messages).
	// Bump the buffer so .Scan() doesn't bail on a 100KB+ line.
	scanner.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)

	var sessionID, cwd string
	for i := 0; i < 50 && scanner.Scan(); i++ {
		var row map[string]any
		if err := json.Unmarshal(scanner.Bytes(), &row); err != nil {
			continue
		}
		if sessionID == "" {
			if v, ok := row["sessionId"].(string); ok && v != "" {
				sessionID = v
			}
		}
		if cwd == "" {
			if v, ok := row["cwd"].(string); ok && v != "" {
				cwd = v
			}
		}
		if sessionID != "" && cwd != "" {
			break
		}
	}
	// Fallback: derive sessionId from the filename.
	if sessionID == "" {
		base := filepath.Base(path)
		sessionID = strings.TrimSuffix(base, ".jsonl")
	}
	if cwd == "" {
		return Session{}, false
	}
	return Session{
		Path:      path,
		SessionID: sessionID,
		Cwd:       cwd,
		Size:      size,
	}, true
}

// ReadAll returns the full transcript content. Used as the body of the
// /api/ingest POST — the server summarizes via the cheap-tier LLM.
func ReadAll(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return string(data), nil
}
