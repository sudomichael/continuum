// Package httpx is a tiny JSON-over-HTTP helper that automatically attaches
// X-Continuum-Token when configured. Used by every command that talks to a
// Continuum server (connect, status, ingest, etc.).

package httpx

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type Client struct {
	BaseURL string
	Token   string
	HTTP    *http.Client
}

func New(baseURL, token string) *Client {
	return &Client{
		BaseURL: strings.TrimRight(baseURL, "/"),
		Token:   token,
		HTTP:    &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *Client) PostJSON(path string, body any, out any) error {
	return c.do("POST", path, body, out)
}

func (c *Client) GetJSON(path string, out any) error {
	return c.do("GET", path, nil, out)
}

func (c *Client) do(method, path string, body any, out any) error {
	var rdr io.Reader
	if body != nil {
		buf, err := json.Marshal(body)
		if err != nil {
			return err
		}
		rdr = bytes.NewReader(buf)
	}
	req, err := http.NewRequest(method, c.BaseURL+path, rdr)
	if err != nil {
		return err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.Token != "" {
		req.Header.Set("X-Continuum-Token", c.Token)
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		// Surface server-side error messages when available — most of
		// Continuum's API returns { error: "..." }.
		var er struct {
			Error string `json:"error"`
		}
		if json.Unmarshal(data, &er) == nil && er.Error != "" {
			return fmt.Errorf("HTTP %d: %s", resp.StatusCode, er.Error)
		}
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(data)))
	}
	if out == nil {
		return nil
	}
	return json.Unmarshal(data, out)
}
