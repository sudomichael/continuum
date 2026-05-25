// Package cfg reads + writes ~/.continuum/config.toml. The config holds
// everything `continuum` needs to run a paired install: the server URL,
// the per-device token issued by /api/cli-auth/authorize, and the device
// metadata for display.

package cfg

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/BurntSushi/toml"
)

type Config struct {
	URL       string `toml:"url"`
	Token     string `toml:"token"`
	TokenID   string `toml:"token_id,omitempty"`
	DeviceID  string `toml:"device_id,omitempty"`
	Platform  string `toml:"platform,omitempty"`
	UpdatedAt string `toml:"updated_at,omitempty"`
}

func ConfigPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".continuum", "config.toml"), nil
}

// Load returns (cfg, exists, err). If the file doesn't exist, exists is
// false and cfg is the zero value — callers can ask the user to run
// `continuum connect` first.
func Load() (Config, bool, error) {
	path, err := ConfigPath()
	if err != nil {
		return Config{}, false, err
	}
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return Config{}, false, nil
	}
	if err != nil {
		return Config{}, false, err
	}
	var c Config
	if err := toml.Unmarshal(data, &c); err != nil {
		return Config{}, true, fmt.Errorf("parse %s: %w", path, err)
	}
	return c, true, nil
}

// Save writes the config atomically (tmp + rename) and ensures the
// containing dir has 0700 perms so the token isn't world-readable.
func Save(c Config) error {
	path, err := ConfigPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	tmp := path + ".tmp"
	f, err := os.OpenFile(tmp, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		return err
	}
	enc := toml.NewEncoder(f)
	if err := enc.Encode(c); err != nil {
		f.Close()
		os.Remove(tmp)
		return err
	}
	if err := f.Close(); err != nil {
		os.Remove(tmp)
		return err
	}
	return os.Rename(tmp, path)
}
