package ssr

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

var fastProbe = probeTiming{timeout: 20 * time.Millisecond, interval: 5 * time.Millisecond, retry: 5 * time.Millisecond}

// A health server whose first `healthy` answers are immediate, then `hung` hang past the probe timeout.
func hangingHealthServer(t *testing.T, healthy, hung int32) *httptest.Server {
	t.Helper()
	var seen atomic.Int32
	release := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := seen.Add(1)
		if n > healthy && n <= healthy+hung {
			select {
			case <-release:
			case <-r.Context().Done():
			}
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(func() {
		close(release)
		server.Close()
	})
	return server
}

func runProbe(t *testing.T, supervisor *Supervisor, url string) {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		defer close(done)
		supervisor.probe(ctx, url, fastProbe)
	}()
	t.Cleanup(func() {
		cancel()
		<-done
	})
}

func waitFor(t *testing.T, what string, condition func() bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for !condition() {
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for %s", what)
		}
		time.Sleep(time.Millisecond)
	}
}

func TestProbeKeepsServingThroughABusyServer(t *testing.T) {
	server := hangingHealthServer(t, 1, maxProbeTimeouts-1)
	supervisor := &Supervisor{}
	runProbe(t, supervisor, server.URL)
	waitFor(t, "the first healthy answer", supervisor.Ready)

	var droppedOut atomic.Bool
	stop := time.Now().Add(time.Duration(maxProbeTimeouts+2) * (fastProbe.timeout + fastProbe.retry))
	for time.Now().Before(stop) {
		if !supervisor.Ready() {
			droppedOut.Store(true)
		}
		time.Sleep(time.Millisecond)
	}
	if droppedOut.Load() {
		t.Fatal("a busy server must stay ready through fewer timeouts than the limit")
	}
}

func TestProbeDropsAServerThatStaysHung(t *testing.T) {
	server := hangingHealthServer(t, 1, 1<<30)
	supervisor := &Supervisor{}
	runProbe(t, supervisor, server.URL)
	waitFor(t, "the first healthy answer", supervisor.Ready)
	waitFor(t, "a hung server to be dropped", func() bool { return !supervisor.Ready() })
}

func TestProbeDropsARefusedServerAtOnce(t *testing.T) {
	var down atomic.Bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if down.Load() {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	supervisor := &Supervisor{}
	runProbe(t, supervisor, server.URL)
	waitFor(t, "the first healthy answer", supervisor.Ready)

	down.Store(true)
	waitFor(t, "a failing server to be dropped", func() bool { return !supervisor.Ready() })

	down.Store(false)
	waitFor(t, "a recovered server to come back", supervisor.Ready)
	server.CloseClientConnections()
	server.Close()
	began := time.Now()
	waitFor(t, "a refused server to be dropped", func() bool { return !supervisor.Ready() })
	if waited := time.Since(began); waited > time.Duration(maxProbeTimeouts)*fastProbe.timeout {
		t.Fatalf("a refused connection took %v to drop, it must not wait for the timeout limit", waited)
	}
}
