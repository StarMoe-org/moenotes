package ssr

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
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
