package ssr

import (
	"context"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sync/atomic"
	"time"

	"github.com/StarMoe-org/moenotes/server/internal/logx"
)

// Supervisor manages the child Next.js standalone server (node server.js) and probes /internal-healthz.
type Supervisor struct {
	StandaloneDir string
	NodeBin       string
	Port          string
	MaxOldSpaceMB string
	ExtraEnv      []string

	ready atomic.Bool
}

// Ready reports whether the Next.js server has passed its /internal-healthz probe.
func (s *Supervisor) Ready() bool {
	return s.ready.Load()
}

// ProbeExternal polls an externally managed Next.js upstream at healthURL until ctx is cancelled.
func (s *Supervisor) ProbeExternal(ctx context.Context, healthURL string) {
	client := &http.Client{Timeout: 2 * time.Second}
	for {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, healthURL, nil)
		if err == nil {
			resp, doErr := client.Do(req)
			if doErr == nil {
				_ = resp.Body.Close()
				s.ready.Store(resp.StatusCode == http.StatusOK)
			} else {
				s.ready.Store(false)
			}
		}
		delay := 5 * time.Second
		if !s.ready.Load() {
			delay = 500 * time.Millisecond
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(delay):
		}
	}
}

// Run supervises `node server.js` inside StandaloneDir, restarting on unexpected exits.
func (s *Supervisor) Run(ctx context.Context) {
	nodeBin := s.NodeBin
	if nodeBin == "" {
		nodeBin = "node"
	}
	port := s.Port
	if port == "" {
		port = "3000"
	}
	maxMem := s.MaxOldSpaceMB
	if maxMem == "" {
		maxMem = "512"
	}
	serverJS := filepath.Join(s.StandaloneDir, "server.js")
	healthURL := "http://127.0.0.1:" + port + "/internal-healthz"
	go s.ProbeExternal(ctx, healthURL)

	for {
		if ctx.Err() != nil {
			return
		}
		cmd := exec.CommandContext(ctx, nodeBin, "--max-old-space-size="+maxMem, serverJS)
		cmd.Dir = s.StandaloneDir
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		env := append([]string(nil), os.Environ()...)
		env = append(env, "NODE_ENV=production", "HOSTNAME=127.0.0.1", "PORT="+port)
		env = append(env, s.ExtraEnv...)
		cmd.Env = env

		logx.Printf("starting Next.js standalone server in %s on 127.0.0.1:%s", s.StandaloneDir, port)
		err := cmd.Run()
		s.ready.Store(false)
		if ctx.Err() != nil {
			return
		}
		logx.Printf("Next.js standalone server exited (%v); restarting in 2s", err)
		select {
		case <-ctx.Done():
			return
		case <-time.After(2 * time.Second):
		}
	}
}
