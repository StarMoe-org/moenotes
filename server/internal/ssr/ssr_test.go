package ssr

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestPrefersMarkdown(t *testing.T) {
	if !PrefersMarkdown("text/markdown") {
		t.Fatal("expected text/markdown to be preferred")
	}
	if !PrefersMarkdown("text/markdown;q=0.9, text/html;q=0.8") {
		t.Fatal("expected higher q markdown to win")
	}
	if PrefersMarkdown("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8") {
		t.Fatal("standard browser Accept must prefer HTML")
	}
	if PrefersMarkdown("text/markdown;q=0.5, text/html;q=0.9") {
		t.Fatal("lower q markdown must lose to HTML")
	}
}

func TestGatewayCacheNegotiationAndVersionInvalidation(t *testing.T) {
	var htmlHits atomic.Int32
	var mdHits atomic.Int32

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, ".md") || strings.Contains(r.Header.Get("Accept"), "text/markdown") {
			n := mdHits.Add(1)
			w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
			w.Header().Set("X-Markdown-Tokens", "42")
			_, _ = w.Write([]byte("# Card 1001\n\nRender "))
			_, _ = w.Write([]byte{byte('0' + n)})
			return
		}
		n := htmlHits.Add(1)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte("<!doctype html><h1>Card 1001</h1><span>"))
		_, _ = w.Write([]byte{byte('0' + n)})
		_, _ = w.Write([]byte("</span>"))
	}))
	defer upstream.Close()

	cache := NewHTMLCache(t.TempDir(), "build-1", "tw@1.0.0")
	gw, err := NewGateway(GatewayOptions{
		UpstreamURL: upstream.URL,
		Cache:       cache,
	})
	if err != nil {
		t.Fatal(err)
	}

	// 1. HTML miss then hit
	r1 := httptest.NewRecorder()
	gw.ServeHTTP(r1, httptest.NewRequest(http.MethodGet, "http://site/cards/1001", nil))
	if r1.Code != http.StatusOK || r1.Header().Get("X-Moenotes-Cache") != "MISS" || htmlHits.Load() != 1 {
		t.Fatalf("unexpected first HTML response: code=%d cache=%s hits=%d", r1.Code, r1.Header().Get("X-Moenotes-Cache"), htmlHits.Load())
	}

	r2 := httptest.NewRecorder()
	gw.ServeHTTP(r2, httptest.NewRequest(http.MethodGet, "http://site/cards/1001", nil))
	if r2.Code != http.StatusOK || r2.Header().Get("X-Moenotes-Cache") != "HIT" || htmlHits.Load() != 1 {
		t.Fatalf("expected HTML cache HIT: code=%d cache=%s hits=%d", r2.Code, r2.Header().Get("X-Moenotes-Cache"), htmlHits.Load())
	}

	// 2. Accept: text/markdown on the same path uses separate "md" cache slot
	mdReq := httptest.NewRequest(http.MethodGet, "http://site/cards/1001", nil)
	mdReq.Header.Set("Accept", "text/markdown")
	r3 := httptest.NewRecorder()
	gw.ServeHTTP(r3, mdReq)
	if r3.Code != http.StatusOK || !strings.HasPrefix(r3.Header().Get("Content-Type"), "text/markdown") || mdHits.Load() != 1 {
		t.Fatalf("expected Markdown response: code=%d ct=%s mdHits=%d", r3.Code, r3.Header().Get("Content-Type"), mdHits.Load())
	}

	// 3. Version bump invalidates HTML & Markdown cache immediately
	if !cache.SetDataVersion("tw@1.1.0") {
		t.Fatal("expected SetDataVersion to report change")
	}
	r4 := httptest.NewRecorder()
	gw.ServeHTTP(r4, httptest.NewRequest(http.MethodGet, "http://site/cards/1001", nil))
	if r4.Header().Get("X-Moenotes-Cache") != "MISS" || htmlHits.Load() != 2 {
		t.Fatalf("expected cache invalidation on version bump: cache=%s hits=%d", r4.Header().Get("X-Moenotes-Cache"), htmlHits.Load())
	}
}

func TestGatewayForceBypassPenetration(t *testing.T) {
	var upstreamHits atomic.Int32
	var sawBypassHeader atomic.Bool
	var forceHookCalls atomic.Int32

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamHits.Add(1)
		if r.Header.Get("X-Moenotes-Bypass-Cache") == "1" {
			sawBypassHeader.Store(true)
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte("<!doctype html><h1>Fresh</h1>"))
	}))
	defer upstream.Close()

	cache := NewHTMLCache(t.TempDir(), "build-1", "tw@1.0.0")
	gw, err := NewGateway(GatewayOptions{
		UpstreamURL: upstream.URL,
		Cache:       cache,
		OnForceRefresh: func(context.Context) {
			forceHookCalls.Add(1)
		},
	})
	if err != nil {
		t.Fatal(err)
	}

	// Prime cache.
	r1 := httptest.NewRecorder()
	gw.ServeHTTP(r1, httptest.NewRequest(http.MethodGet, "http://site/cards/71", nil))
	if r1.Header().Get("X-Moenotes-Cache") != "MISS" || upstreamHits.Load() != 1 {
		t.Fatalf("expected initial MISS, got %s", r1.Header().Get("X-Moenotes-Cache"))
	}

	// Header-based force bypass penetrates HTMLCache, triggers OnForceRefresh, and forwards X-Moenotes-Bypass-Cache: 1.
	bypassReq := httptest.NewRequest(http.MethodGet, "http://site/cards/71", nil)
	bypassReq.Header.Set("X-Moenotes-Bypass-Cache", "1")
	r2 := httptest.NewRecorder()
	gw.ServeHTTP(r2, bypassReq)
	if r2.Header().Get("X-Moenotes-Cache") != "BYPASS" || upstreamHits.Load() != 2 || !sawBypassHeader.Load() || forceHookCalls.Load() != 1 {
		t.Fatalf("expected BYPASS penetration: cache=%s hits=%d header=%v hook=%d", r2.Header().Get("X-Moenotes-Cache"), upstreamHits.Load(), sawBypassHeader.Load(), forceHookCalls.Load())
	}

	// Query-based force bypass (?_refresh=<ts>, matching MoeSekai Settings refresh) penetrates, updates HTMLCache, and triggers OnForceRefresh.
	sawBypassHeader.Store(false)
	r3 := httptest.NewRecorder()
	gw.ServeHTTP(r3, httptest.NewRequest(http.MethodGet, "http://site/cards/71?_refresh=1793250000", nil))
	if r3.Header().Get("X-Moenotes-Cache") != "BYPASS" || upstreamHits.Load() != 3 || !sawBypassHeader.Load() || forceHookCalls.Load() != 2 {
		t.Fatalf("expected query BYPASS penetration: cache=%s hits=%d header=%v hook=%d", r3.Header().Get("X-Moenotes-Cache"), upstreamHits.Load(), sawBypassHeader.Load(), forceHookCalls.Load())
	}

	// Subsequent normal GET hits the freshly updated HTMLCache without another upstream call.
	r4 := httptest.NewRecorder()
	gw.ServeHTTP(r4, httptest.NewRequest(http.MethodGet, "http://site/cards/71", nil))
	if r4.Header().Get("X-Moenotes-Cache") != "HIT" || upstreamHits.Load() != 3 {
		t.Fatalf("expected HTMLCache HIT after _refresh overwrite: cache=%s hits=%d", r4.Header().Get("X-Moenotes-Cache"), upstreamHits.Load())
	}
}

func TestStaticArchivePersistenceAndPublicServing(t *testing.T) {
	root := t.TempDir()
	buildAStatic := filepath.Join(root, "build-a", ".next", "static")
	buildBStatic := filepath.Join(root, "build-b", ".next", "static")
	archiveDir := filepath.Join(root, "data", "static_archive")
	publicDir := filepath.Join(root, "public")

	writeFile := func(base, rel, body string) string {
		t.Helper()
		full := filepath.Join(base, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
		return full
	}

	writeFile(buildAStatic, "chunks/old-only.js", "console.log('old');")
	writeFile(buildAStatic, "chunks/shared.js", "console.log('shared');")
	copied, refreshed := SyncStaticArchive(buildAStatic, archiveDir, 30)
	if copied != 2 || refreshed != 0 {
		t.Fatalf("first sync copied=%d refreshed=%d, want 2/0", copied, refreshed)
	}

	// Backdate both archived files to 31 days ago; build B reuses shared.js so its mtime is refreshed and kept,
	// whereas old-only.js is older than 30 days and gets swept.
	staleTime := time.Now().Add(-31 * 24 * time.Hour)
	_ = os.Chtimes(filepath.Join(archiveDir, "chunks", "old-only.js"), staleTime, staleTime)
	_ = os.Chtimes(filepath.Join(archiveDir, "chunks", "shared.js"), staleTime, staleTime)

	writeFile(buildBStatic, "chunks/shared.js", "console.log('shared');")
	writeFile(buildBStatic, "chunks/new-only.js", "console.log('new');")
	copied2, refreshed2 := SyncStaticArchive(buildBStatic, archiveDir, 30)
	if copied2 != 1 || refreshed2 != 1 {
		t.Fatalf("second sync copied=%d refreshed=%d, want 1/1", copied2, refreshed2)
	}
	if _, err := os.Stat(filepath.Join(archiveDir, "chunks", "old-only.js")); !os.IsNotExist(err) {
		t.Fatalf("expected 31-day-old unused chunk to be swept, err=%v", err)
	}
	if _, err := os.Stat(filepath.Join(archiveDir, "chunks", "shared.js")); err != nil {
		t.Fatalf("expected reused chunk to remain in archive: %v", err)
	}

	// Archive also keeps recent chunks (<30d) from previous builds when NextStaticDir moves to a newer build.
	recentOld := writeFile(archiveDir, "chunks/prev-build.js", "console.log('prev');")
	_ = recentOld
	writeFile(publicDir, "haneoka-team-engine/engine.wasm", "\x00asm")

	var upstreamHits atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamHits.Add(1)
		http.NotFound(w, r)
	}))
	defer upstream.Close()

	gw, err := NewGateway(GatewayOptions{
		UpstreamURL:      upstream.URL,
		Cache:            NewHTMLCache(filepath.Join(root, "html_cache"), "build-b", "tw@1"),
		StaticArchiveDir: archiveDir,
		NextStaticDir:    buildBStatic,
		PublicDir:        publicDir,
		Ready:            func() bool { return false },
	})
	if err != nil {
		t.Fatal(err)
	}

	// Even while Ready() == false, /_next/static/* and public/* serve directly from disk/volume.
	recPrev := httptest.NewRecorder()
	gw.ServeHTTP(recPrev, httptest.NewRequest(http.MethodGet, "http://site/_next/static/chunks/prev-build.js", nil))
	if recPrev.Code != http.StatusOK || !strings.Contains(recPrev.Header().Get("Cache-Control"), "immutable") {
		t.Fatalf("archived chunk failed: code=%d cc=%q", recPrev.Code, recPrev.Header().Get("Cache-Control"))
	}

	recWasm := httptest.NewRecorder()
	gw.ServeHTTP(recWasm, httptest.NewRequest(http.MethodGet, "http://site/haneoka-team-engine/engine.wasm", nil))
	if recWasm.Code != http.StatusOK || recWasm.Header().Get("Content-Type") != "application/wasm" {
		t.Fatalf("public wasm failed: code=%d ct=%q", recWasm.Code, recWasm.Header().Get("Content-Type"))
	}
	if upstreamHits.Load() != 0 {
		t.Fatalf("expected 0 upstream hits for static/public files, got %d", upstreamHits.Load())
	}
}

func TestHTMLCachePersistsActiveBuildAcrossPrune(t *testing.T) {
	dir := t.TempDir()
	c1 := NewHTMLCache(dir, "build-1", "tw@1")
	c1.Write("tw@1", "html", "/cards", cacheMeta{ContentType: "text/html; charset=utf-8"}, []byte("<html>old-build</html>"))

	c2 := NewHTMLCache(dir, "build-2", "tw@2")
	c2.Write("tw@2", "html", "/cards", cacheMeta{ContentType: "text/html; charset=utf-8"}, []byte("<html>active-build</html>"))

	// Backdate every file in dir to 5 hours ago (> 2h prune cutoff).
	past := time.Now().Add(-5 * time.Hour)
	_ = filepath.WalkDir(dir, func(p string, d os.DirEntry, err error) error {
		if err == nil && !d.IsDir() {
			_ = os.Chtimes(p, past, past)
		}
		return nil
	})

	c2.pruneOldEntries(2 * time.Hour)

	// Active (build-2, tw@2) entry MUST still be readable on the persistent volume!
	if _, _, ok := c2.Read("html", "/cards"); !ok {
		t.Fatal("active (buildID, dataVersion) entry was unexpectedly pruned")
	}

	// Superseded (build-1, tw@1) entry older than cutoff MUST be pruned from disk.
	if _, _, ok := c1.Read("html", "/cards"); ok {
		t.Fatal("stale previous-build entry should have been pruned")
	}
}

func TestDoCoalescedDetachesContextAndWaitersCancel(t *testing.T) {
	c := NewHTMLCache(t.TempDir(), "build-1", "tw@1.0.0")

	// Pre-cancelled context must return immediately without invoking fn.
	preCtx, preCancel := context.WithCancel(context.Background())
	preCancel()
	var fnCalls atomic.Int32
	_, _, _, err := c.DoCoalesced(preCtx, "pre", func(context.Context) (int, http.Header, []byte, error) {
		fnCalls.Add(1)
		return http.StatusOK, nil, []byte("ok"), nil
	})
	if !errors.Is(err, context.Canceled) || fnCalls.Load() != 0 {
		t.Fatalf("expected immediate context.Canceled without calling fn, got err=%v calls=%d", err, fnCalls.Load())
	}

	started := make(chan struct{})
	release := make(chan struct{})
	var flightCtxCancelled atomic.Bool

	ctx1, cancel1 := context.WithCancel(context.Background())
	err1Ch := make(chan error, 1)
	go func() {
		_, _, _, err := c.DoCoalesced(ctx1, "shared-key", func(flightCtx context.Context) (int, http.Header, []byte, error) {
			fnCalls.Add(1)
			close(started)
			<-release
			flightCtxCancelled.Store(flightCtx.Err() != nil)
			return http.StatusOK, http.Header{"Content-Type": []string{"text/html"}}, []byte("shared-body"), nil
		})
		err1Ch <- err
	}()

	<-started

	// Caller #2 and Caller #3 join the same in-flight call.
	type res struct {
		status int
		body   string
		err    error
	}
	res2Ch := make(chan res, 1)
	go func() {
		st, _, body, err := c.DoCoalesced(context.Background(), "shared-key", func(context.Context) (int, http.Header, []byte, error) {
			t.Error("coalesced waiter #2 must not invoke fn")
			return 0, nil, nil, nil
		})
		res2Ch <- res{status: st, body: string(body), err: err}
	}()

	ctx3, cancel3 := context.WithCancel(context.Background())
	err3Ch := make(chan error, 1)
	go func() {
		_, _, _, err := c.DoCoalesced(ctx3, "shared-key", func(context.Context) (int, http.Header, []byte, error) {
			t.Error("coalesced waiter #3 must not invoke fn")
			return 0, nil, nil, nil
		})
		err3Ch <- err
	}()

	// Give waiters a moment to register on call.done.
	time.Sleep(20 * time.Millisecond)

	// Cancelling caller #1 and waiter #3 must unblock both promptly while leaving shared fn running.
	cancel1()
	cancel3()

	select {
	case err := <-err1Ch:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("caller #1 got %v, want context.Canceled", err)
		}
	case <-time.After(time.Second):
		t.Fatal("caller #1 blocked after context cancellation")
	}

	select {
	case err := <-err3Ch:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("caller #3 got %v, want context.Canceled", err)
		}
	case <-time.After(time.Second):
		t.Fatal("caller #3 blocked after context cancellation")
	}

	// Release shared fn and confirm caller #2 receives the full response.
	close(release)
	select {
	case r2 := <-res2Ch:
		if r2.err != nil || r2.status != http.StatusOK || r2.body != "shared-body" {
			t.Fatalf("caller #2 failed after caller #1 cancelled: %+v", r2)
		}
	case <-time.After(time.Second):
		t.Fatal("caller #2 timed out waiting for shared fn")
	}

	if flightCtxCancelled.Load() {
		t.Fatal("shared flightCtx was unexpectedly cancelled when caller #1 disconnected")
	}
	if fnCalls.Load() != 1 {
		t.Fatalf("expected exactly 1 upstream fn execution, got %d", fnCalls.Load())
	}
}

func TestGatewayCoalescedPageSurvivesFirstCallerCancel(t *testing.T) {
	started := make(chan struct{})
	release := make(chan struct{})
	var upstreamHits atomic.Int32

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := upstreamHits.Add(1)
		if n == 1 {
			close(started)
			<-release
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte("<!doctype html><h1>Card 1001</h1>"))
	}))
	defer upstream.Close()

	gw, err := NewGateway(GatewayOptions{
		UpstreamURL: upstream.URL,
		Cache:       NewHTMLCache(t.TempDir(), "build-1", "tw@1.0.0"),
	})
	if err != nil {
		t.Fatal(err)
	}

	ctx1, cancel1 := context.WithCancel(context.Background())
	req1 := httptest.NewRequest(http.MethodGet, "http://site/cards/1001", nil).WithContext(ctx1)
	rec1 := httptest.NewRecorder()
	done1 := make(chan struct{})
	go func() {
		gw.ServeHTTP(rec1, req1)
		close(done1)
	}()

	<-started

	rec2 := httptest.NewRecorder()
	done2 := make(chan struct{})
	go func() {
		gw.ServeHTTP(rec2, httptest.NewRequest(http.MethodGet, "http://site/cards/1001", nil))
		close(done2)
	}()

	time.Sleep(20 * time.Millisecond)
	cancel1()

	select {
	case <-done1:
		if rec1.Code != http.StatusBadGateway {
			t.Fatalf("cancelled caller #1 status=%d, want 502", rec1.Code)
		}
	case <-time.After(time.Second):
		t.Fatal("caller #1 did not exit promptly on disconnect")
	}

	close(release)
	select {
	case <-done2:
	case <-time.After(time.Second):
		t.Fatal("caller #2 timed out")
	}

	if rec2.Code != http.StatusOK || rec2.Header().Get("X-Moenotes-Cache") != "MISS" || !strings.Contains(rec2.Body.String(), "Card 1001") {
		t.Fatalf("caller #2 failed: code=%d cache=%s body=%q", rec2.Code, rec2.Header().Get("X-Moenotes-Cache"), rec2.Body.String())
	}
	if upstreamHits.Load() != 1 {
		t.Fatalf("expected 1 upstream hit, got %d", upstreamHits.Load())
	}

	// Subsequent request must hit HTMLCache written by the completed shared flight.
	rec3 := httptest.NewRecorder()
	gw.ServeHTTP(rec3, httptest.NewRequest(http.MethodGet, "http://site/cards/1001", nil))
	if rec3.Code != http.StatusOK || rec3.Header().Get("X-Moenotes-Cache") != "HIT" || upstreamHits.Load() != 1 {
		t.Fatalf("expected cache HIT after coalesced write: code=%d cache=%s hits=%d", rec3.Code, rec3.Header().Get("X-Moenotes-Cache"), upstreamHits.Load())
	}
}

func TestNewGatewayConfiguresPooledTransport(t *testing.T) {
	gw, err := NewGateway(GatewayOptions{
		UpstreamURL: "http://127.0.0.1:3000",
		Cache:       NewHTMLCache(t.TempDir(), "build-1", "tw@1.0.0"),
	})
	if err != nil {
		t.Fatal(err)
	}
	tr, ok := gw.client.Transport.(*http.Transport)
	if !ok {
		t.Fatalf("expected *http.Transport, got %T", gw.client.Transport)
	}
	if tr.MaxIdleConnsPerHost < 64 {
		t.Fatalf("MaxIdleConnsPerHost=%d, want >= 64", tr.MaxIdleConnsPerHost)
	}
	if tr.MaxIdleConns < 128 {
		t.Fatalf("MaxIdleConns=%d, want >= 128", tr.MaxIdleConns)
	}
}

func TestRunIdleWarmupWaitsForRealVersionCoalescesAndAbortsOnTraffic(t *testing.T) {
	var mu sync.Mutex
	hitsByPath := make(map[string]int)
	cardsStarted := make(chan struct{})
	releaseCards := make(chan struct{})
	var cardsOnce sync.Once

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		hitsByPath[r.URL.Path]++
		mu.Unlock()
		if r.URL.Path == "/cards" {
			cardsOnce.Do(func() { close(cardsStarted) })
			<-releaseCards
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte("<html>" + r.URL.Path + "</html>"))
	}))
	defer upstream.Close()

	cache := NewHTMLCache(t.TempDir(), "build-1", "initial")
	// Pre-populate "/" html & md so warmup skips "/" and hits "/cards" first.
	cache.Write("tw@1.0.0", "html", "/", cacheMeta{ContentType: "text/html; charset=utf-8"}, []byte("<html>cached root</html>"))
	cache.Write("tw@1.0.0", "md", "/", cacheMeta{ContentType: "text/markdown; charset=utf-8"}, []byte("# cached root"))

	var clockMu sync.Mutex
	now := time.Unix(1700000000, 0)
	nowFn := func() time.Time {
		clockMu.Lock()
		defer clockMu.Unlock()
		return now
	}
	advance := func(d time.Duration) {
		clockMu.Lock()
		now = now.Add(d)
		clockMu.Unlock()
	}

	gw, err := NewGateway(GatewayOptions{
		UpstreamURL: upstream.URL,
		Cache:       cache,
		Ready:       func() bool { return true },
	})
	if err != nil {
		t.Fatal(err)
	}
	gw.nowFn = nowFn
	gw.warmupTick = 10 * time.Millisecond
	gw.warmupIdle = 1500 * time.Millisecond
	gw.warmupStep = 5 * time.Millisecond
	gw.lastTraffic.Store(nowFn().Add(-5 * time.Second).UnixNano())

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan struct{})
	go func() {
		gw.RunIdleWarmup(ctx)
		close(done)
	}()

	// While DataVersion is "initial", warmup must do zero fetches.
	time.Sleep(50 * time.Millisecond)
	mu.Lock()
	initialHits := len(hitsByPath)
	mu.Unlock()
	if initialHits != 0 {
		t.Fatalf("expected 0 warmup hits while DataVersion == initial, got %d", initialHits)
	}

	// Switching to a real version allows warmup to start; "/" is skipped because already cached, so "/cards" runs first.
	cache.SetDataVersion("tw@1.0.0")
	select {
	case <-cardsStarted:
	case <-time.After(time.Second):
		t.Fatal("warmup did not start after SetDataVersion")
	}

	// Send live traffic for "/cards" while warmup is mid-flight:
	// 1. Live request must coalesce with warmup's DoCoalesced (still 1 upstream hit for /cards).
	// 2. ServeHTTP updates lastTraffic, causing warmup to abort before fetching subsequent routes (/support-cards, etc.).
	liveRec := httptest.NewRecorder()
	liveDone := make(chan struct{})
	go func() {
		gw.ServeHTTP(liveRec, httptest.NewRequest(http.MethodGet, "http://site/cards", nil))
		close(liveDone)
	}()

	// Wait briefly for live request to enter ServeHTTP, update lastTraffic, and join DoCoalesced.
	time.Sleep(25 * time.Millisecond)
	close(releaseCards)

	select {
	case <-liveDone:
		if liveRec.Code != http.StatusOK {
			t.Fatalf("live /cards status=%d, want 200", liveRec.Code)
		}
	case <-time.After(time.Second):
		t.Fatal("live /cards request timed out")
	}

	// Give warmup a couple of ticks while still within idle threshold; it must stay aborted and NOT touch /music or /events.
	time.Sleep(60 * time.Millisecond)
	mu.Lock()
	cardsHits := hitsByPath["/cards"]
	rootHits := hitsByPath["/"]
	musicHits := hitsByPath["/music"]
	eventsHits := hitsByPath["/events"]
	mu.Unlock()

	if rootHits != 0 {
		t.Fatalf("expected pre-cached / to be skipped, got %d hits", rootHits)
	}
	if cardsHits != 1 {
		t.Fatalf("expected live /cards + warmup to coalesce into 1 upstream hit, got %d", cardsHits)
	}
	if musicHits != 0 || eventsHits != 0 {
		t.Fatalf("expected warmup to abort on live traffic before /music and /events, got music=%d events=%d", musicHits, eventsHits)
	}

	// Advance clock past idle threshold and confirm warmup resumes and completes remaining routes.
	advance(2 * time.Second)
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if _, _, ok := cache.Read("md", "/about"); ok {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if _, _, ok := cache.Read("md", "/about"); !ok {
		t.Fatal("expected warmup to resume after idle threshold and cache /about")
	}

	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("RunIdleWarmup did not exit on context cancellation")
	}
}

func TestGatewayReadOnlyEndpointsCoalescedAndCached(t *testing.T) {
	var mu sync.Mutex
	hits := make(map[string]int)
	searchStarted := make(chan struct{})
	releaseSearch := make(chan struct{})
	var searchOnce sync.Once
	var noStoreMode atomic.Bool

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		key := r.URL.RequestURI()
		mu.Lock()
		hits[key]++
		count := hits[key]
		mu.Unlock()

		switch r.URL.Path {
		case "/search-index.json":
			if r.URL.Query().Get("v") == "block" {
				searchOnce.Do(func() { close(searchStarted) })
				<-releaseSearch
			}
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			if noStoreMode.Load() {
				w.Header().Set("Cache-Control", "no-store")
			} else {
				w.Header().Set("Cache-Control", "public, max-age=3600")
			}
			if r.Header.Get("X-Moenotes-Bypass-Cache") == "1" {
				_, _ = w.Write([]byte(`{"bypassed":true}`))
				return
			}
			_, _ = w.Write([]byte(`{"hit":` + string(rune('0'+count)) + `}`))
		case "/api/v1/story-site/index":
			srv := r.URL.Query().Get("server")
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			w.Header().Set("Cache-Control", "public, max-age=30")
			w.Header().Set("X-Moenotes-Story-Region", srv)
			_, _ = w.Write([]byte(`{"server":"` + srv + `"}`))
		case "/sitemaps/en-US.xml":
			w.Header().Set("Content-Type", "application/xml; charset=utf-8")
			_, _ = w.Write([]byte(`<urlset/>`))
		case "/llms.txt", "/llms-full.txt", "/band-item-upgrades.json", "/character-voices.json":
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			_, _ = w.Write([]byte("ok:" + r.URL.Path))
		default:
			http.NotFound(w, r)
		}
	}))
	defer upstream.Close()

	var clockMu sync.Mutex
	now := time.Unix(1700000000, 0)
	cache := NewHTMLCache(t.TempDir(), "build-1", "tw@1.0.0")
	gw, err := NewGateway(GatewayOptions{
		UpstreamURL: upstream.URL,
		Cache:       cache,
	})
	if err != nil {
		t.Fatal(err)
	}
	gw.nowFn = func() time.Time {
		clockMu.Lock()
		defer clockMu.Unlock()
		return now
	}
	advance := func(d time.Duration) {
		clockMu.Lock()
		now = now.Add(d)
		clockMu.Unlock()
	}

	// 1. Concurrent /search-index.json?v=block requests coalesce to 1 upstream call;
	// cancelling caller #1 does not break caller #2.
	ctx1, cancel1 := context.WithCancel(context.Background())
	r1 := httptest.NewRecorder()
	done1 := make(chan struct{})
	go func() {
		gw.ServeHTTP(r1, httptest.NewRequest(http.MethodGet, "http://site/search-index.json?v=block", nil).WithContext(ctx1))
		close(done1)
	}()
	<-searchStarted

	r2 := httptest.NewRecorder()
	done2 := make(chan struct{})
	go func() {
		gw.ServeHTTP(r2, httptest.NewRequest(http.MethodGet, "http://site/search-index.json?v=block", nil))
		close(done2)
	}()
	time.Sleep(20 * time.Millisecond)
	cancel1()
	<-done1
	if r1.Code != http.StatusBadGateway {
		t.Fatalf("cancelled caller #1 status=%d, want 502", r1.Code)
	}
	close(releaseSearch)
	<-done2
	if r2.Code != http.StatusOK || r2.Header().Get("X-Moenotes-Cache") != "MISS" || r2.Header().Get("Cache-Control") != "public, max-age=3600" {
		t.Fatalf("caller #2 unexpected response: code=%d cache=%s cc=%q", r2.Code, r2.Header().Get("X-Moenotes-Cache"), r2.Header().Get("Cache-Control"))
	}

	// 2. Subsequent hit uses shortCache (HIT) without hitting upstream.
	r3 := httptest.NewRecorder()
	gw.ServeHTTP(r3, httptest.NewRequest(http.MethodGet, "http://site/search-index.json?v=block", nil))
	if r3.Code != http.StatusOK || r3.Header().Get("X-Moenotes-Cache") != "HIT" {
		t.Fatalf("expected HIT on cached /search-index.json, got code=%d cache=%s", r3.Code, r3.Header().Get("X-Moenotes-Cache"))
	}

	// 3. Force bypass penetrates and returns BYPASS + no-store.
	rBypass := httptest.NewRecorder()
	gw.ServeHTTP(rBypass, httptest.NewRequest(http.MethodGet, "http://site/search-index.json?v=block&_refresh=1", nil))
	if rBypass.Code != http.StatusOK || rBypass.Header().Get("X-Moenotes-Cache") != "BYPASS" || rBypass.Header().Get("Cache-Control") != "no-store" || !strings.Contains(rBypass.Body.String(), "bypassed") {
		t.Fatalf("forceBypass failed: code=%d cache=%s cc=%q body=%q", rBypass.Code, rBypass.Header().Get("X-Moenotes-Cache"), rBypass.Header().Get("Cache-Control"), rBypass.Body.String())
	}

	// 4. Story-site index keys separately per ?server= and expires after 30s TTL.
	tw1 := httptest.NewRecorder()
	gw.ServeHTTP(tw1, httptest.NewRequest(http.MethodGet, "http://site/api/v1/story-site/index?server=tw", nil))
	jp1 := httptest.NewRecorder()
	gw.ServeHTTP(jp1, httptest.NewRequest(http.MethodGet, "http://site/api/v1/story-site/index?server=jp", nil))
	tw2 := httptest.NewRecorder()
	gw.ServeHTTP(tw2, httptest.NewRequest(http.MethodGet, "http://site/api/v1/story-site/index?server=tw", nil))
	if tw1.Header().Get("X-Moenotes-Cache") != "MISS" || tw2.Header().Get("X-Moenotes-Cache") != "HIT" ||
		tw2.Header().Get("X-Moenotes-Story-Region") != "tw" || jp1.Header().Get("X-Moenotes-Story-Region") != "jp" {
		t.Fatalf("story-site query isolation/caching failed: tw1=%s tw2=%s jp1Region=%s",
			tw1.Header().Get("X-Moenotes-Cache"), tw2.Header().Get("X-Moenotes-Cache"), jp1.Header().Get("X-Moenotes-Story-Region"))
	}

	advance(31 * time.Second)
	tw3 := httptest.NewRecorder()
	gw.ServeHTTP(tw3, httptest.NewRequest(http.MethodGet, "http://site/api/v1/story-site/index?server=tw", nil))
	if tw3.Header().Get("X-Moenotes-Cache") != "MISS" {
		t.Fatalf("expected MISS after 30s TTL expiry, got %s", tw3.Header().Get("X-Moenotes-Cache"))
	}

	// 5. Other read-only endpoints cache cleanly and invalidate on DataVersion bump.
	for _, ep := range []string{"/sitemaps/en-US.xml", "/llms.txt", "/llms-full.txt", "/band-item-upgrades.json", "/character-voices.json"} {
		a := httptest.NewRecorder()
		gw.ServeHTTP(a, httptest.NewRequest(http.MethodGet, "http://site"+ep, nil))
		b := httptest.NewRecorder()
		gw.ServeHTTP(b, httptest.NewRequest(http.MethodGet, "http://site"+ep, nil))
		if a.Header().Get("X-Moenotes-Cache") != "MISS" || b.Header().Get("X-Moenotes-Cache") != "HIT" {
			t.Fatalf("%s expected MISS then HIT, got %s then %s", ep, a.Header().Get("X-Moenotes-Cache"), b.Header().Get("X-Moenotes-Cache"))
		}
	}

	cache.SetDataVersion("tw@2.0.0")
	afterBump := httptest.NewRecorder()
	gw.ServeHTTP(afterBump, httptest.NewRequest(http.MethodGet, "http://site/sitemaps/en-US.xml", nil))
	if afterBump.Header().Get("X-Moenotes-Cache") != "MISS" {
		t.Fatalf("expected MISS on /sitemaps/en-US.xml after DataVersion bump, got %s", afterBump.Header().Get("X-Moenotes-Cache"))
	}

	// 6. Upstream Cache-Control: no-store must prevent storing in shortCache.
	noStoreMode.Store(true)
	ns1 := httptest.NewRecorder()
	gw.ServeHTTP(ns1, httptest.NewRequest(http.MethodGet, "http://site/search-index.json", nil))
	ns2 := httptest.NewRecorder()
	gw.ServeHTTP(ns2, httptest.NewRequest(http.MethodGet, "http://site/search-index.json", nil))
	if ns1.Header().Get("X-Moenotes-Cache") != "MISS" || ns2.Header().Get("X-Moenotes-Cache") != "MISS" {
		t.Fatalf("expected no-store response not to be cached, got %s then %s", ns1.Header().Get("X-Moenotes-Cache"), ns2.Header().Get("X-Moenotes-Cache"))
	}
}

func TestGatewayRSCAnd404CoalescingAndCaching(t *testing.T) {
	var mu sync.Mutex
	hits := make(map[string]int)

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		key := r.URL.RequestURI() + "|rsc=" + r.Header.Get("RSC") + "|prefetch=" + r.Header.Get("Next-Router-Prefetch")
		mu.Lock()
		hits[key]++
		mu.Unlock()

		if r.URL.Path == "/cards/missing" {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte("<h1>404</h1>"))
			return
		}
		if r.Header.Get("RSC") == "1" {
			w.Header().Set("Content-Type", "text/x-component")
			w.Header().Set("Vary", "RSC, Next-Router-State-Tree, Next-Router-Prefetch")
			if r.Header.Get("Next-Router-Prefetch") == "1" {
				_, _ = w.Write([]byte("0:prefetch"))
			} else {
				_, _ = w.Write([]byte("0:full"))
			}
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte("<html>html-fallback</html>"))
	}))
	defer upstream.Close()

	var clockMu sync.Mutex
	now := time.Unix(1700000000, 0)
	cache := NewHTMLCache(t.TempDir(), "build-1", "tw@1.0.0")
	gw, err := NewGateway(GatewayOptions{
		UpstreamURL: upstream.URL,
		Cache:       cache,
	})
	if err != nil {
		t.Fatal(err)
	}
	gw.nowFn = func() time.Time {
		clockMu.Lock()
		defer clockMu.Unlock()
		return now
	}
	advance := func(d time.Duration) {
		clockMu.Lock()
		now = now.Add(d)
		clockMu.Unlock()
	}

	// 1. RSC prefetch caches separately from non-prefetch RSC and preserves headers.
	reqPrefetch := httptest.NewRequest(http.MethodGet, "http://site/cards/81?_rsc=abc", nil)
	reqPrefetch.Header.Set("RSC", "1")
	reqPrefetch.Header.Set("Next-Router-Prefetch", "1")
	p1 := httptest.NewRecorder()
	gw.ServeHTTP(p1, reqPrefetch)
	p2 := httptest.NewRecorder()
	gw.ServeHTTP(p2, reqPrefetch.Clone(context.Background()))
	if p1.Header().Get("X-Moenotes-Cache") != "MISS" || p2.Header().Get("X-Moenotes-Cache") != "HIT" ||
		p2.Header().Get("Content-Type") != "text/x-component" || p2.Body.String() != "0:prefetch" {
		t.Fatalf("RSC prefetch cache failed: p1=%s p2=%s ct=%q body=%q", p1.Header().Get("X-Moenotes-Cache"), p2.Header().Get("X-Moenotes-Cache"), p2.Header().Get("Content-Type"), p2.Body.String())
	}

	reqFull := httptest.NewRequest(http.MethodGet, "http://site/cards/81?_rsc=abc", nil)
	reqFull.Header.Set("RSC", "1")
	f1 := httptest.NewRecorder()
	gw.ServeHTTP(f1, reqFull)
	if f1.Header().Get("X-Moenotes-Cache") != "MISS" || f1.Body.String() != "0:full" {
		t.Fatalf("full RSC must not collide with prefetch RSC: cache=%s body=%q", f1.Header().Get("X-Moenotes-Cache"), f1.Body.String())
	}

	// 2. Player page RSC (/u/*) must bypass shared shortCache.
	uReq := httptest.NewRequest(http.MethodGet, "http://site/u/123?_rsc=abc", nil)
	uReq.Header.Set("RSC", "1")
	u1 := httptest.NewRecorder()
	gw.ServeHTTP(u1, uReq)
	u2 := httptest.NewRecorder()
	gw.ServeHTTP(u2, uReq.Clone(context.Background()))
	if u1.Header().Get("X-Moenotes-Cache") != "" || u2.Header().Get("X-Moenotes-Cache") != "" {
		t.Fatalf("player /u/ RSC must bypass shared cache, got %q / %q", u1.Header().Get("X-Moenotes-Cache"), u2.Header().Get("X-Moenotes-Cache"))
	}

	// 3. 404 responses on normal HTML paths are short-cached for 30s (not persisted to HTMLCache).
	nf1 := httptest.NewRecorder()
	gw.ServeHTTP(nf1, httptest.NewRequest(http.MethodGet, "http://site/cards/missing", nil))
	nf2 := httptest.NewRecorder()
	gw.ServeHTTP(nf2, httptest.NewRequest(http.MethodGet, "http://site/cards/missing", nil))
	if nf1.Code != http.StatusNotFound || nf1.Header().Get("X-Moenotes-Cache") != "MISS" ||
		nf2.Code != http.StatusNotFound || nf2.Header().Get("X-Moenotes-Cache") != "HIT" {
		t.Fatalf("expected 404 MISS then HIT, got (%d,%s) then (%d,%s)", nf1.Code, nf1.Header().Get("X-Moenotes-Cache"), nf2.Code, nf2.Header().Get("X-Moenotes-Cache"))
	}
	if _, _, ok := cache.Read("html", "/cards/missing"); ok {
		t.Fatal("404 response must not be persisted to disk HTMLCache")
	}

	advance(31 * time.Second)
	nf3 := httptest.NewRecorder()
	gw.ServeHTTP(nf3, httptest.NewRequest(http.MethodGet, "http://site/cards/missing", nil))
	if nf3.Code != http.StatusNotFound || nf3.Header().Get("X-Moenotes-Cache") != "MISS" {
		t.Fatalf("expected 404 MISS after 30s TTL expiry, got (%d,%s)", nf3.Code, nf3.Header().Get("X-Moenotes-Cache"))
	}
}
