package ssr

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/StarMoe-org/moenotes/server/internal/logx"
	"github.com/StarMoe-org/moenotes/server/internal/siteconfig"
	"github.com/StarMoe-org/moenotes/server/internal/web"
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
	OnForceRefresh   func(ctx context.Context)
}

// Gateway fronts Next.js with persistent HTML/Markdown caching, Accept: text/markdown negotiation,
// immutable static chunk serving, and idle background warmup.
type Gateway struct {
	upstream       *url.URL
	cache          *HTMLCache
	staticArchive  string
	nextStatic     string
	publicDir      string
	site           *siteconfig.Site
	client         *http.Client
	readyFn        func() bool
	onForceRefresh func(ctx context.Context)
	lastTraffic    atomic.Int64

	flights    flightGroup
	shortCache *shortResponseCache
	nowFn      func() time.Time

	warmupTick time.Duration
	warmupIdle time.Duration
	warmupStep time.Duration
}

// NewGateway constructs a semi-SSR Gateway.
func NewGateway(opts GatewayOptions) (*Gateway, error) {
	parsed, err := url.Parse(opts.UpstreamURL)
	if err != nil {
		return nil, err
	}
	client := opts.Client
	if client == nil {
		tr := http.DefaultTransport.(*http.Transport).Clone()
		tr.MaxIdleConns = 256
		tr.MaxIdleConnsPerHost = 128
		tr.IdleConnTimeout = 90 * time.Second
		client = &http.Client{
			Timeout:   30 * time.Second,
			Transport: tr,
		}
	}
	g := &Gateway{
		upstream:       parsed,
		cache:          opts.Cache,
		staticArchive:  opts.StaticArchiveDir,
		nextStatic:     opts.NextStaticDir,
		publicDir:      opts.PublicDir,
		site:           opts.Site,
		client:         client,
		readyFn:        opts.Ready,
		onForceRefresh: opts.OnForceRefresh,
		shortCache:     newShortResponseCache(512, 64<<20, 16<<20),
		nowFn:          time.Now,
		warmupTick:     5 * time.Second,
		warmupIdle:     1500 * time.Millisecond,
		warmupStep:     120 * time.Millisecond,
	}
	g.lastTraffic.Store(g.now().UnixNano())
	return g, nil
}

func (g *Gateway) now() time.Time {
	if g.nowFn != nil {
		return g.nowFn()
	}
	return time.Now()
}

func (g *Gateway) dataVersion() string {
	if g.cache == nil {
		return ""
	}
	return g.cache.DataVersion()
}

func (g *Gateway) doCoalesced(ctx context.Context, key string, fn func(context.Context) (int, http.Header, []byte, error)) (int, http.Header, []byte, error) {
	if g.cache != nil {
		return g.cache.DoCoalesced(ctx, key, fn)
	}
	return g.flights.do(ctx, key, fn)
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

func isTruthyFlag(v string) bool {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "1", "true", "yes":
		return true
	default:
		return false
	}
}

// IsForceBypassRequest reports whether r explicitly requests forced cache penetration.
func IsForceBypassRequest(r *http.Request) bool {
	if isTruthyFlag(r.Header.Get("X-Moenotes-Bypass-Cache")) || isTruthyFlag(r.Header.Get("X-Moenotes-Refresh-Masterdata")) {
		return true
	}
	if r.Method == http.MethodPost && r.URL.Path == "/api/v1/meta/version" {
		return true
	}
	if r.URL.RawQuery == "" {
		return false
	}
	q := r.URL.Query()
	if tok := strings.TrimSpace(q.Get("_refresh")); tok != "" && tok != "0" && !strings.EqualFold(tok, "false") {
		return true
	}
	for _, key := range []string{"refresh_masterdata", "__refresh", "nocache", "refresh"} {
		if isTruthyFlag(q.Get(key)) {
			return true
		}
	}
	return false
}

func isNonCacheablePathOrHeaders(r *http.Request) bool {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
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
	if strings.HasPrefix(p, "/u/") || strings.Contains(p, "/u/") {
		// Player profile pages depend on dynamic player API state; bypass shared HTML cache.
		return true
	}
	return false
}

func hasNonBypassQueryParams(rawQuery string) bool {
	if rawQuery == "" {
		return false
	}
	q, err := url.ParseQuery(rawQuery)
	if err != nil {
		return true
	}
	for key := range q {
		switch key {
		case "_refresh", "refresh_masterdata", "__refresh", "nocache", "refresh":
			continue
		default:
			return true
		}
	}
	return false
}

func isBypassCacheRequest(r *http.Request) bool {
	if IsForceBypassRequest(r) {
		return true
	}
	if r.URL.RawQuery != "" {
		return true
	}
	return isNonCacheablePathOrHeaders(r)
}

func readOnlyEndpointTTL(p string) (time.Duration, bool) {
	switch {
	case p == "/api/v1/story-site/index":
		return 30 * time.Second, true
	case p == "/search-index.json",
		p == "/band-item-upgrades.json",
		p == "/character-voices.json",
		p == "/llms.txt",
		p == "/llms-full.txt",
		p == "/sitemap.xml",
		p == "/robots.txt",
		strings.HasPrefix(p, "/sitemaps/"):
		return 2 * time.Minute, true
	default:
		return 0, false
	}
}

func isCoalescableRSCRequest(r *http.Request) bool {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		return false
	}
	if r.Header.Get("Authorization") != "" || r.Header.Get("Next-Action") != "" {
		return false
	}
	p := r.URL.Path
	if strings.HasPrefix(p, "/_next/") ||
		strings.HasPrefix(p, "/api/") ||
		p == "/internal-healthz" ||
		strings.HasPrefix(p, "/u/") ||
		strings.Contains(p, "/u/") {
		return false
	}
	return r.Header.Get("RSC") != "" || r.Header.Get("Next-Router-Prefetch") != "" || r.URL.Query().Has("_rsc")
}

func hasNoStoreOrPrivate(cc string) bool {
	if cc == "" {
		return false
	}
	lower := strings.ToLower(cc)
	return strings.Contains(lower, "no-store") || strings.Contains(lower, "private")
}

func rscHeaderDigest(r *http.Request) string {
	h := sha256.New()
	for _, name := range []string{
		"RSC",
		"Next-Router-Prefetch",
		"Next-Router-Segment-Prefetch",
		"Next-Router-State-Tree",
		"Next-Url",
		"Accept",
	} {
		_, _ = io.WriteString(h, name)
		_, _ = io.WriteString(h, ":")
		_, _ = io.WriteString(h, r.Header.Get(name))
		_, _ = io.WriteString(h, "\n")
	}
	return hex.EncodeToString(h.Sum(nil))[:16]
}

func normalizeCachePath(p string) string {
	if p == "" || p == "/" {
		return "/"
	}
	return strings.TrimRight(p, "/")
}

func cleanRelativeAssetPath(raw string) (string, bool) {
	if raw == "" || strings.ContainsRune(raw, '\\') || strings.ContainsRune(raw, 0) {
		return "", false
	}
	cleaned := path.Clean("/" + raw)
	rel := strings.TrimPrefix(cleaned, "/")
	if rel == "" || rel == "." || strings.HasPrefix(rel, "..") {
		return "", false
	}
	return rel, true
}

func (g *Gateway) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	g.lastTraffic.Store(g.now().UnixNano())

	isRead := r.Method == http.MethodGet || r.Method == http.MethodHead

	// Serve /_next/static/* directly from NextStaticDir or persistent StaticArchiveDir with immutable caching,
	// even while Next.js is starting or restarting across rolling deploys.
	if isRead && strings.HasPrefix(r.URL.Path, "/_next/static/") {
		if rel, ok := cleanRelativeAssetPath(strings.TrimPrefix(r.URL.Path, "/_next/static/")); ok {
			if g.serveDiskFile(w, r, g.nextStatic, rel, "public, max-age=31536000, immutable") ||
				g.serveDiskFile(w, r, g.staticArchive, rel, "public, max-age=31536000, immutable") {
				return
			}
		}
	}

	// Serve public/* static assets (/favicon.svg, /assets/*, /haneoka-team-engine/*.wasm, etc.) directly from disk
	// so binary/static assets never enter HTMLCache or hit the Node loop unnecessarily.
	if isRead && g.publicDir != "" && r.URL.Path != "/" && !strings.HasPrefix(r.URL.Path, "/_next/") && !strings.HasPrefix(r.URL.Path, "/api/") {
		if rel, ok := cleanRelativeAssetPath(r.URL.Path); ok {
			if g.serveDiskFile(w, r, g.publicDir, rel, "no-cache") {
				return
			}
		}
	}

	if g.readyFn != nil && !g.readyFn() {
		w.Header().Set("Cache-Control", "no-store")
		http.Error(w, "Service Unavailable", http.StatusServiceUnavailable)
		return
	}

	forceBypass := IsForceBypassRequest(r)
	if forceBypass && g.onForceRefresh != nil {
		g.onForceRefresh(r.Context())
	}

	// When a user manually refreshes a cacheable page (e.g. `?_refresh=<ts>` from Settings -> Data),
	// penetrate Next.js upstream AND overwrite HTMLCache for the clean path so subsequent normal visits see fresh HTML too.
	if forceBypass && g.cache != nil && !isNonCacheablePathOrHeaders(r) && !hasNonBypassQueryParams(r.URL.RawQuery) {
		g.refreshAndUpdateCache(w, r)
		return
	}

	if !forceBypass && isRead {
		if ttl, ok := readOnlyEndpointTTL(r.URL.Path); ok && r.Header.Get("Authorization") == "" {
			g.serveCoalescedDirect(w, r, "ep", ttl, true)
			return
		}
		if isCoalescableRSCRequest(r) {
			g.serveCoalescedDirect(w, r, "rsc", 15*time.Second, false)
			return
		}
	}

	if isBypassCacheRequest(r) || g.cache == nil {
		g.proxyDirect(w, r, forceBypass)
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
	negKey := "404\n" + ver + "\n" + variant + "\n" + cachePath
	if status, hdr, body, ok := g.shortCache.get(negKey, g.now()); ok {
		g.writePageResponse(w, r, status, hdr, body, wantsMd, ver, "HIT")
		return
	}

	status, hdr, body, err := g.fetchAndCachePage(r.Context(), ver, variant, cachePath, wantsMd)
	if err != nil {
		logx.Printf("ssr gateway upstream failed for %s: %v", r.URL.Path, err)
		w.Header().Set("Cache-Control", "no-store")
		http.Error(w, "Bad Gateway", http.StatusBadGateway)
		return
	}
	g.writePageResponse(w, r, status, hdr, body, wantsMd, ver, "MISS")
}

func (g *Gateway) fetchAndCachePage(ctx context.Context, ver, variant, cachePath string, wantsMd bool) (int, http.Header, []byte, error) {
	flightKey := ver + "\n" + variant + "\n" + cachePath
	return g.doCoalesced(ctx, flightKey, func(flightCtx context.Context) (int, http.Header, []byte, error) {
		status, hdr, body, err := g.fetchUpstream(flightCtx, cachePath, wantsMd)
		if err != nil {
			return 0, nil, nil, err
		}
		if status == http.StatusOK && len(body) > 0 && g.cache != nil {
			g.writePageToCache(ver, variant, cachePath, wantsMd, hdr, body)
		} else if status == http.StatusNotFound && g.shortCache != nil && hdr.Get("Set-Cookie") == "" {
			negKey := "404\n" + flightKey
			g.shortCache.set(negKey, status, hdr, body, 30*time.Second, g.now())
		}
		return status, hdr, body, nil
	})
}

func (g *Gateway) writePageToCache(ver, variant, cachePath string, wantsMd bool, hdr http.Header, body []byte) {
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

func copyUpstreamHeaders(dst, src http.Header) {
	for k, vals := range src {
		if strings.EqualFold(k, "Content-Length") || strings.EqualFold(k, "Content-Encoding") || strings.EqualFold(k, "Transfer-Encoding") || strings.EqualFold(k, "Connection") {
			continue
		}
		dst[k] = append([]string(nil), vals...)
	}
}

func (g *Gateway) writePageResponse(w http.ResponseWriter, r *http.Request, status int, hdr http.Header, body []byte, wantsMd bool, ver, cacheStatus string) {
	outHdr := w.Header()
	copyUpstreamHeaders(outHdr, hdr)
	outHdr.Set("Vary", "Accept, Accept-Encoding")
	outHdr.Set("X-Moenotes-Cache", cacheStatus)
	if !wantsMd {
		dv := hdr.Get("X-Moenotes-Data-Version")
		if dv == "" {
			dv = ver
		}
		if dv != "" {
			outHdr.Set("Server-Timing", `page;desc="`+strings.ReplaceAll(dv, `"`, "")+`"`)
		}
	}
	w.WriteHeader(status)
	if r.Method != http.MethodHead {
		_, _ = w.Write(body)
	}
}

func (g *Gateway) serveDiskFile(w http.ResponseWriter, r *http.Request, baseDir, rel, cacheControl string) bool {
	if baseDir == "" {
		return false
	}
	full := filepath.Join(baseDir, filepath.FromSlash(rel))
	info, err := os.Stat(full)
	if err != nil || !info.Mode().IsRegular() {
		return false
	}
	f, err := os.Open(full)
	if err != nil {
		return false
	}
	defer f.Close()
	if ct := web.ContentType(full); ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	w.Header().Set("Cache-Control", cacheControl)
	http.ServeContent(w, r, info.Name(), info.ModTime(), f)
	return true
}

func (g *Gateway) fetchUpstream(ctx context.Context, path string, wantsMd bool) (int, http.Header, []byte, error) {
	return g.fetchUpstreamWithOptions(ctx, path, wantsMd, false)
}

func (g *Gateway) fetchUpstreamWithOptions(ctx context.Context, path string, wantsMd bool, forceBypass bool) (int, http.Header, []byte, error) {
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
	if forceBypass {
		req.Header.Set("X-Moenotes-Bypass-Cache", "1")
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

func (g *Gateway) refreshAndUpdateCache(w http.ResponseWriter, r *http.Request) {
	isMdPath := strings.HasSuffix(r.URL.Path, ".md")
	wantsMd := isMdPath || PrefersMarkdown(r.Header.Get("Accept"))
	variant := "html"
	if wantsMd {
		variant = "md"
	}
	cachePath := normalizeCachePath(r.URL.Path)

	status, hdr, body, err := g.fetchUpstreamWithOptions(r.Context(), cachePath, wantsMd, true)
	if err != nil {
		logx.Printf("ssr force-bypass refresh failed for %s: %v", r.URL.Path, err)
		w.Header().Set("Cache-Control", "no-store")
		http.Error(w, "Bad Gateway", http.StatusBadGateway)
		return
	}

	ver := g.cache.DataVersion()
	if status == http.StatusOK && len(body) > 0 {
		g.writePageToCache(ver, variant, cachePath, wantsMd, hdr, body)
	}

	outHdr := w.Header()
	copyUpstreamHeaders(outHdr, hdr)
	outHdr.Set("Vary", "Accept, Accept-Encoding")
	outHdr.Set("Cache-Control", "no-store")
	outHdr.Set("X-Moenotes-Cache", "BYPASS")
	w.WriteHeader(status)
	if r.Method != http.MethodHead {
		_, _ = w.Write(body)
	}
}

func (g *Gateway) serveCoalescedDirect(w http.ResponseWriter, r *http.Request, kind string, ttl time.Duration, respectCacheControl bool) {
	ver := g.dataVersion()
	key := kind + "\n" + ver + "\n" + r.URL.RequestURI()
	if kind == "rsc" {
		key += "\n" + rscHeaderDigest(r)
	}

	if status, hdr, body, ok := g.shortCache.get(key, g.now()); ok {
		outHdr := w.Header()
		copyUpstreamHeaders(outHdr, hdr)
		outHdr.Set("X-Moenotes-Cache", "HIT")
		w.WriteHeader(status)
		if r.Method != http.MethodHead {
			_, _ = w.Write(body)
		}
		return
	}

	// Snapshot safe request headers before entering the detached singleflight goroutine.
	reqHdr := r.Header.Clone()
	reqHdr.Del("Host")
	reqHdr.Del("Connection")
	reqHdr.Del("Cookie")
	reqHdr.Del("If-None-Match")
	reqHdr.Del("If-Modified-Since")
	reqHdr.Del("If-Match")
	reqHdr.Del("If-Unmodified-Since")
	reqHdr.Del("Range")
	reqHdr.Set("Accept-Encoding", "identity")
	reqURI := r.URL.RequestURI()

	status, hdr, body, err := g.doCoalesced(r.Context(), key, func(flightCtx context.Context) (int, http.Header, []byte, error) {
		if st, h, b, ok := g.shortCache.get(key, g.now()); ok {
			return st, h, b, nil
		}
		st, h, b, fetchErr := g.fetchDirectUpstream(flightCtx, reqURI, reqHdr)
		if fetchErr != nil {
			return 0, nil, nil, fetchErr
		}
		if g.shortCache != nil && h.Get("Set-Cookie") == "" {
			if st == http.StatusNotFound {
				negTTL := ttl
				if negTTL > 30*time.Second {
					negTTL = 30 * time.Second
				}
				g.shortCache.set(key, st, h, b, negTTL, g.now())
			} else if st == http.StatusOK && (!respectCacheControl || !hasNoStoreOrPrivate(h.Get("Cache-Control"))) {
				g.shortCache.set(key, st, h, b, ttl, g.now())
			}
		}
		return st, h, b, nil
	})
	if err != nil {
		logx.Printf("ssr direct coalesce failed for %s: %v", r.URL.Path, err)
		w.Header().Set("Cache-Control", "no-store")
		http.Error(w, "Bad Gateway", http.StatusBadGateway)
		return
	}

	outHdr := w.Header()
	copyUpstreamHeaders(outHdr, hdr)
	outHdr.Set("X-Moenotes-Cache", "MISS")
	w.WriteHeader(status)
	if r.Method != http.MethodHead {
		_, _ = w.Write(body)
	}
}

func (g *Gateway) fetchDirectUpstream(ctx context.Context, reqURI string, reqHdr http.Header) (int, http.Header, []byte, error) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	target := g.upstream.String() + reqURI
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return 0, nil, nil, err
	}
	req.Header = reqHdr.Clone()

	relay := *g.client
	relay.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	resp, err := relay.Do(req)
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

func (g *Gateway) proxyDirect(w http.ResponseWriter, r *http.Request, forceBypass bool) {
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
	if forceBypass {
		req.Header.Set("X-Moenotes-Bypass-Cache", "1")
	}

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
	if forceBypass {
		hdr.Set("Cache-Control", "no-store")
		hdr.Set("X-Moenotes-Cache", "BYPASS")
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

	tickInterval := g.warmupTick
	if tickInterval <= 0 {
		tickInterval = 5 * time.Second
	}
	idleThreshold := g.warmupIdle
	if idleThreshold <= 0 {
		idleThreshold = 1500 * time.Millisecond
	}
	stepPause := g.warmupStep

	canContinue := func(ver string) bool {
		if ctx.Err() != nil {
			return false
		}
		if g.readyFn != nil && !g.readyFn() {
			return false
		}
		if g.cache.DataVersion() != ver {
			return false
		}
		idleFor := g.now().Sub(time.Unix(0, g.lastTraffic.Load()))
		return idleFor >= idleThreshold
	}

	warmedVersion := ""
	ticker := time.NewTicker(tickInterval)
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
		if ver == "" || ver == "initial" || ver == warmedVersion {
			continue
		}
		if !canContinue(ver) {
			continue
		}
		allDone := true
	warmLoop:
		for _, p := range corePaths {
			for _, variant := range []string{"html", "md"} {
				if !canContinue(ver) {
					allDone = false
					break warmLoop
				}
				if _, _, ok := g.cache.Read(variant, p); ok {
					continue
				}
				_, _, _, err := g.fetchAndCachePage(ctx, ver, variant, p, variant == "md")
				if err != nil {
					allDone = false
					break warmLoop
				}
				if !canContinue(ver) {
					allDone = false
					break warmLoop
				}
				if stepPause > 0 {
					select {
					case <-ctx.Done():
						return
					case <-time.After(stepPause):
					}
				}
			}
		}
		if allDone {
			warmedVersion = ver
			logx.Printf("ssr warmup complete for data version %s (%d routes x html/md)", ver, len(corePaths))
		}
	}
}

// SyncStaticArchive copies current .next/static assets into archiveDir on the persistent volume
// so rolling deploys never 404 previous builds' chunks, refreshes mtimes on reused chunks so active
// chunks are never prematurely evicted, and sweeps archived assets older than maxDays (when > 0).
func SyncStaticArchive(nextStaticDir, archiveDir string, maxDays int) (copied, refreshed int) {
	if archiveDir != "" {
		_ = os.MkdirAll(archiveDir, 0o755)
	}
	if nextStaticDir == "" || archiveDir == "" {
		return 0, 0
	}
	now := time.Now()
	_ = filepath.WalkDir(nextStaticDir, func(src string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		rel, relErr := filepath.Rel(nextStaticDir, src)
		if relErr != nil {
			return nil
		}
		dst := filepath.Join(archiveDir, rel)
		srcInfo, srcStatErr := d.Info()
		if dstInfo, statErr := os.Stat(dst); statErr == nil && srcStatErr == nil && dstInfo.Size() == srcInfo.Size() && !strings.HasSuffix(rel, "Manifest.js") {
			_ = os.Chtimes(dst, now, now)
			refreshed++
			return nil
		}
		if os.MkdirAll(filepath.Dir(dst), 0o755) != nil {
			return nil
		}
		raw, readErr := os.ReadFile(src)
		if readErr != nil {
			return nil
		}
		tmp := dst + ".tmp"
		if os.WriteFile(tmp, raw, 0o644) == nil {
			if os.Rename(tmp, dst) == nil {
				copied++
			} else {
				_ = os.Remove(tmp)
			}
		}
		return nil
	})
	if maxDays > 0 {
		cutoff := now.Add(-time.Duration(maxDays) * 24 * time.Hour)
		var dirs []string
		_ = filepath.WalkDir(archiveDir, func(p string, d os.DirEntry, err error) error {
			if err != nil {
				return nil
			}
			if d.IsDir() {
				if p != archiveDir {
					dirs = append(dirs, p)
				}
				return nil
			}
			if info, statErr := d.Info(); statErr == nil && info.ModTime().Before(cutoff) {
				_ = os.Remove(p)
			}
			return nil
		})
		for i := len(dirs) - 1; i >= 0; i-- {
			_ = os.Remove(dirs[i])
		}
	}
	return copied, refreshed
}
