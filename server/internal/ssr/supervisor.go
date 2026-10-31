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

// probeTiming is how a health probe is paced.
type probeTiming struct {
	timeout  time.Duration
	interval time.Duration
	retry    time.Duration
}

// maxProbeTimeouts is how many probes in a row may time out before the server counts as down. Next.js answers probes on
// the thread that renders, so a slow render looks like a timeout; every request would get a 503 from a server that is
// only busy. A refused connection or a bad status is not this case and counts at once.
const maxProbeTimeouts = 5

var defaultProbeTiming = probeTiming{timeout: 2 * time.Second, interval: 5 * time.Second, retry: 500 * time.Millisecond}

// ProbeExternal polls an externally managed Next.js upstream at healthURL until ctx is cancelled.
func (s *Supervisor) ProbeExternal(ctx context.Context, healthURL string) {
	s.probe(ctx, healthURL, defaultProbeTiming)
}

func (s *Supervisor) probe(ctx context.Context, healthURL string, timing probeTiming) {
	client := &http.Client{Timeout: timing.timeout}
	timeouts := 0
	for {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, healthURL, nil)
		if err == nil {
			resp, doErr := client.Do(req)
			switch {
			case doErr == nil:
				_ = resp.Body.Close()
				timeouts = 0
				s.ready.Store(resp.StatusCode == http.StatusOK)
			case os.IsTimeout(doErr):
				timeouts++
				if timeouts == maxProbeTimeouts && s.ready.Swap(false) {
					logx.Printf("Next.js health probe timed out %d times in a row; marking it not ready", timeouts)
				}
			default:
				timeouts = 0
				s.ready.Store(false)
			}
		}
		delay := timing.interval
		if !s.ready.Load() || timeouts > 0 {
			delay = timing.retry
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
	disableCoreDumps()

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
