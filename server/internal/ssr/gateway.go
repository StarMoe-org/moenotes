package ssr

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/StarMoe-org/moenotes/server/internal/logx"
	"github.com/StarMoe-org/moenotes/server/internal/siteconfig"
)

// GatewayOptions configures the semi-SSR HTTP gateway in front of Next.js standalone.
type GatewayOptions struct {
	UpstreamURL      string
	Cache            *HTMLCache
	StaticArchiveDir string
	NextStaticDir    string
	PublicDir        string
	Site             *siteconfig.Site
	Client           *http.Client
	Ready            func() bool
}

// Gateway fronts Next.js with persistent HTML/Markdown caching, Accept: text/markdown negotiation,
// immutable static chunk serving, and idle background warmup.
type Gateway struct {
	upstream      *url.URL
	cache         *HTMLCache
	staticArchive string
	nextStatic    string
	publicDir     string
	site          *siteconfig.Site
	client        *http.Client
	readyFn       func() bool
	lastTraffic   atomic.Int64
}

// NewGateway constructs a semi-SSR Gateway.
func NewGateway(opts GatewayOptions) (*Gateway, error) {
	parsed, err := url.Parse(opts.UpstreamURL)
	if err != nil {
		return nil, err
	}
	client := opts.Client
	if client == nil {
		client = &http.Client{Timeout: 30 * time.Second}
	}
	g := &Gateway{
		upstream:      parsed,
		cache:         opts.Cache,
		staticArchive: opts.StaticArchiveDir,
		nextStatic:    opts.NextStaticDir,
		publicDir:     opts.PublicDir,
		site:          opts.Site,
		client:        client,
		readyFn:       opts.Ready,
	}
	g.lastTraffic.Store(time.Now().UnixNano())
	return g, nil
}

// PrefersMarkdown reports whether an HTTP Accept header prefers text/markdown over text/html.
func PrefersMarkdown(accept string) bool {
	if accept == "" {
		return false
	}
	mdQ := -1.0
	htmlQ := -1.0
	for _, rawPart := range strings.Split(accept, ",") {
		segments := strings.Split(strings.ToLower(strings.TrimSpace(rawPart)), ";")
		media := strings.TrimSpace(segments[0])
		if media == "" {
			continue
		}
		q := 1.0
		for _, param := range segments[1:] {
			p := strings.TrimSpace(param)
			if strings.HasPrefix(p, "q=") {
				if parsed, err := strconv.ParseFloat(p[2:], 64); err == nil {
					q = parsed
				}
			}
		}
		if q <= 0 {
			continue
		}
		switch media {
		case "text/markdown", "text/x-markdown":
			if q > mdQ {
				mdQ = q
			}
		case "text/html", "application/xhtml+xml":
			if q > htmlQ {
				htmlQ = q
			}
		}
	}
	return mdQ > 0 && mdQ >= htmlQ
}

func isBypassCacheRequest(r *http.Request) bool {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		return true
	}
	if r.URL.RawQuery != "" {
		return true
	}
	if r.Header.Get("RSC") != "" || r.Header.Get("Next-Router-Prefetch") != "" || r.Header.Get("Next-Action") != "" {
		return true
	}
	p := r.URL.Path
	if strings.HasPrefix(p, "/_next/") ||
		strings.HasPrefix(p, "/api/") ||
		strings.HasPrefix(p, "/sitemaps/") ||
		p == "/sitemap.xml" ||
		p == "/robots.txt" ||
		p == "/llms.txt" ||
		p == "/llms-full.txt" ||
		p == "/search-index.json" ||
		p == "/band-item-upgrades.json" ||
		p == "/character-voices.json" ||
		p == "/internal-healthz" {
		return true
	}
	if gSite := p; strings.HasPrefix(gSite, "/u/") || strings.Contains(gSite, "/u/") {
		// Player profile pages depend on dynamic player API state; bypass shared HTML cache.
		return true
	}
	return false
}

func normalizeCachePath(p string) string {
	if p == "" || p == "/" {
		return "/"
	}
	return strings.TrimRight(p, "/")
}

func (g *Gateway) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	g.lastTraffic.Store(time.Now().UnixNano())

	if g.readyFn != nil && !g.readyFn() {
		w.Header().Set("Cache-Control", "no-store")
		http.Error(w, "Service Unavailable", http.StatusServiceUnavailable)
		return
	}

	// Serve /_next/static/* directly from NextStaticDir or StaticArchiveDir with immutable caching.
	if strings.HasPrefix(r.URL.Path, "/_next/static/") && (r.Method == http.MethodGet || r.Method == http.MethodHead) {
		rel := strings.TrimPrefix(r.URL.Path, "/_next/static/")
		if !strings.Contains(rel, "..") {
			if g.serveImmutableFile(w, r, g.nextStatic, rel) || g.serveImmutableFile(w, r, g.staticArchive, rel) {
				return
			}
		}
	}

	if isBypassCacheRequest(r) || g.cache == nil {
		g.proxyDirect(w, r)
		return
	}

	isMdPath := strings.HasSuffix(r.URL.Path, ".md")
	wantsMd := isMdPath || PrefersMarkdown(r.Header.Get("Accept"))
	variant := "html"
	if wantsMd {
		variant = "md"
	}
	cachePath := normalizeCachePath(r.URL.Path)

	if meta, gzBody, ok := g.cache.Read(variant, cachePath); ok {
		ServeCached(w, r, meta, gzBody)
		return
	}

	ver := g.cache.DataVersion()
	flightKey := ver + "\n" + variant + "\n" + cachePath
	status, hdr, body, err := g.cache.DoCoalesced(flightKey, func() (int, http.Header, []byte, error) {
		return g.fetchUpstream(r.Context(), cachePath, wantsMd)
	})
	if err != nil {
		logx.Printf("ssr gateway upstream failed for %s: %v", r.URL.Path, err)
		w.Header().Set("Cache-Control", "no-store")
		http.Error(w, "Bad Gateway", http.StatusBadGateway)
		return
	}

	if status == http.StatusOK && len(body) > 0 {
		ct := hdr.Get("Content-Type")
		if wantsMd && ct == "" {
			ct = "text/markdown; charset=utf-8"
		} else if ct == "" {
			ct = "text/html; charset=utf-8"
		}
		meta := cacheMeta{
			ContentType:   ct,
			MarkdownToken: hdr.Get("X-Markdown-Tokens"),
			CanonicalLink: hdr.Get("Link"),
			DataVersion:   hdr.Get("X-Moenotes-Data-Version"),
		}
		if meta.DataVersion == "" {
			meta.DataVersion = ver
		}
		g.cache.Write(ver, variant, cachePath, meta, body)
	}

	outHdr := w.Header()
	for k, vals := range hdr {
		if strings.EqualFold(k, "Content-Length") || strings.EqualFold(k, "Content-Encoding") || strings.EqualFold(k, "Transfer-Encoding") || strings.EqualFold(k, "Connection") {
			continue
		}
		outHdr[k] = append([]string(nil), vals...)
	}
	outHdr.Set("Vary", "Accept, Accept-Encoding")
	outHdr.Set("X-Moenotes-Cache", "MISS")
	w.WriteHeader(status)
	if r.Method != http.MethodHead {
		_, _ = w.Write(body)
	}
}

func (g *Gateway) serveImmutableFile(w http.ResponseWriter, r *http.Request, baseDir, rel string) bool {
	if baseDir == "" {
		return false
	}
	full := filepath.Join(baseDir, filepath.FromSlash(rel))
	info, err := os.Stat(full)
	if err != nil || info.IsDir() {
		return false
	}
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	http.ServeFile(w, r, full)
	return true
}

func (g *Gateway) fetchUpstream(ctx context.Context, path string, wantsMd bool) (int, http.Header, []byte, error) {
	ctx, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()
	target := g.upstream.ResolveReference(&url.URL{Path: path}).String()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return 0, nil, nil, err
	}
	if wantsMd {
		req.Header.Set("Accept", "text/markdown; charset=utf-8")
	} else {
		req.Header.Set("Accept", "text/html,application/xhtml+xml")
	}
	// Request uncompressed body from loopback Next.js so HTMLCache compresses once cleanly.
	req.Header.Set("Accept-Encoding", "identity")
	resp, err := g.client.Do(req)
	if err != nil {
		return 0, nil, nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 32<<20))
	if err != nil {
		return 0, nil, nil, err
	}
	return resp.StatusCode, resp.Header.Clone(), body, nil
}

func (g *Gateway) proxyDirect(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	target := g.upstream.String() + r.URL.RequestURI()
	var reqBody io.Reader
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		buf, err := io.ReadAll(io.LimitReader(r.Body, 8<<20))
		if err != nil {
			http.Error(w, "Bad Request", http.StatusBadRequest)
			return
		}
		reqBody = bytes.NewReader(buf)
	}
	req, err := http.NewRequestWithContext(ctx, r.Method, target, reqBody)
	if err != nil {
		http.Error(w, "Bad Gateway", http.StatusBadGateway)
		return
	}
	req.Header = r.Header.Clone()
	req.Header.Del("Host")
	req.Header.Del("Connection")
	req.Header.Del("Accept-Encoding")

	relay := *g.client
	relay.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	resp, err := relay.Do(req)
	if err != nil {
		logx.Printf("ssr direct proxy failed for %s: %v", r.URL.Path, err)
		w.Header().Set("Cache-Control", "no-store")
		http.Error(w, "Bad Gateway", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	hdr := w.Header()
	for k, vals := range resp.Header {
		if strings.EqualFold(k, "Connection") || strings.EqualFold(k, "Transfer-Encoding") || strings.EqualFold(k, "Content-Length") {
			continue
		}
		hdr[k] = append([]string(nil), vals...)
	}
	w.WriteHeader(resp.StatusCode)
	if r.Method != http.MethodHead {
		_, _ = io.Copy(w, resp.Body)
	}
}

// RunIdleWarmup pre-warms high-value HTML and Markdown routes whenever traffic is idle.
func (g *Gateway) RunIdleWarmup(ctx context.Context) {
	if g.cache == nil {
		return
	}
	corePaths := []string{
		"/",
		"/cards",
		"/support-cards",
		"/music",
		"/events",
		"/gacha",
		"/characters",
		"/about",
	}
	if g.site != nil {
		for _, loc := range g.site.Locales() {
			if loc.Prefix != "" {
				corePaths = append(corePaths, "/"+loc.Prefix)
			}
		}
	}

	warmedVersion := ""
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
		if g.readyFn != nil && !g.readyFn() {
			continue
		}
		ver := g.cache.DataVersion()
		if ver == warmedVersion {
			continue
		}
		idleFor := time.Since(time.Unix(0, g.lastTraffic.Load()))
		if idleFor < 1500*time.Millisecond {
			continue
		}
		allDone := true
		for _, p := range corePaths {
			if ctx.Err() != nil {
				return
			}
			for _, variant := range []string{"html", "md"} {
				if _, _, ok := g.cache.Read(variant, p); ok {
					continue
				}
				status, hdr, body, err := g.fetchUpstream(ctx, p, variant == "md")
				if err != nil {
					allDone = false
					break
				}
				if status == http.StatusOK && len(body) > 0 {
					g.cache.Write(ver, variant, p, cacheMeta{
						ContentType:   hdr.Get("Content-Type"),
						MarkdownToken: hdr.Get("X-Markdown-Tokens"),
						CanonicalLink: hdr.Get("Link"),
						DataVersion:   ver,
					}, body)
				}
				time.Sleep(120 * time.Millisecond)
			}
		}
		if allDone {
			warmedVersion = ver
			logx.Printf("ssr warmup complete for data version %s (%d routes x html/md)", ver, len(corePaths))
		}
	}
}

// SyncStaticArchive copies current .next/static assets into archiveDir so rolling deploys never 404 old chunks.
func SyncStaticArchive(nextStaticDir, archiveDir string) {
	if nextStaticDir == "" || archiveDir == "" {
		return
	}
	_ = filepath.WalkDir(nextStaticDir, func(src string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		rel, relErr := filepath.Rel(nextStaticDir, src)
		if relErr != nil {
			return nil
		}
		dst := filepath.Join(archiveDir, rel)
		if _, statErr := os.Stat(dst); statErr == nil {
			return nil
		}
		if os.MkdirAll(filepath.Dir(dst), 0o755) != nil {
			return nil
		}
		if raw, readErr := os.ReadFile(src); readErr == nil {
			_ = os.WriteFile(dst, raw, 0o644)
		}
		return nil
	})
}
