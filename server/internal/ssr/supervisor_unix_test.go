//go:build unix

package ssr

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"
)

// Run must start the Next.js server with core dumps off, whatever limit the gateway itself was started with.
func TestRunStartsNextServerWithoutCoreDumps(t *testing.T) {
	var original syscall.Rlimit
	if err := syscall.Getrlimit(syscall.RLIMIT_CORE, &original); err != nil {
		t.Fatalf("read core limit: %v", err)
	}
	if original.Max == 0 {
		t.Skip("the hard core limit is 0, so the child can not inherit a non-zero one")
	}
	t.Cleanup(func() { _ = syscall.Setrlimit(syscall.RLIMIT_CORE, &original) })
	raised := syscall.Rlimit{Cur: min(original.Max, 1<<20), Max: original.Max}
	if err := syscall.Setrlimit(syscall.RLIMIT_CORE, &raised); err != nil {
		t.Fatalf("raise core limit: %v", err)
	}

	dir := t.TempDir()
	report := filepath.Join(dir, "core-limit")
	fakeNode := filepath.Join(dir, "node")
	script := "#!/bin/sh\nulimit -c > " + report + ".tmp\nmv " + report + ".tmp " + report + "\nexec sleep 60\n"
	if err := os.WriteFile(fakeNode, []byte(script), 0o755); err != nil {
		t.Fatalf("write fake node: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	supervisor := &Supervisor{StandaloneDir: dir, NodeBin: fakeNode, Port: "1"}
	go func() {
		defer close(done)
		supervisor.Run(ctx)
	}()
	t.Cleanup(func() {
		cancel()
		<-done
	})

	deadline := time.Now().Add(5 * time.Second)
	for {
		got, err := os.ReadFile(report)
		if err == nil {
			if limit := strings.TrimSpace(string(got)); limit != "0" {
				t.Fatalf("Next.js child core limit = %q, want 0", limit)
			}
			return
		}
		if time.Now().After(deadline) {
			t.Fatal("the fake node never reported its core limit")
		}
		time.Sleep(10 * time.Millisecond)
	}
}
