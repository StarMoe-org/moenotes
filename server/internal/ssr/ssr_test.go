package ssr

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
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
