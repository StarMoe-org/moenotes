// Package ssr implements the semi-SSR Next.js gateway, persistent HTML/Markdown disk cache,
// idle warmup, and standalone Node supervisor (modeled after StarMoe-org/Moesekai).
package ssr

import (
	"bytes"
	"compress/gzip"
	"container/list"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type cacheMeta struct {
	ContentType   string `json:"ct"`
	MarkdownToken string `json:"mt,omitempty"`
	CanonicalLink string `json:"cl,omitempty"`
	BuildID       string `json:"bid,omitempty"`
	DataVersion   string `json:"dv,omitempty"`
	CreatedAt     int64  `json:"ts"`
}

type inflightCall struct {
	done   chan struct{}
	status int
	header http.Header
	body   []byte
	err    error
}

type flightGroup struct {
	mu      sync.Mutex
	flights map[string]*inflightCall
}

func (fg *flightGroup) do(ctx context.Context, key string, fn func(context.Context) (int, http.Header, []byte, error)) (int, http.Header, []byte, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return 0, nil, nil, err
	}

	fg.mu.Lock()
	if call, ok := fg.flights[key]; ok {
		fg.mu.Unlock()
		select {
		case <-call.done:
			return call.status, call.header, call.body, call.err
		case <-ctx.Done():
			return 0, nil, nil, ctx.Err()
		}
	}
	call := &inflightCall{done: make(chan struct{})}
	if fg.flights == nil {
		fg.flights = make(map[string]*inflightCall)
	}
	fg.flights[key] = call
	fg.mu.Unlock()

	flightCtx := context.WithoutCancel(ctx)
	go func() {
		defer func() {
			fg.mu.Lock()
			delete(fg.flights, key)
			close(call.done)
			fg.mu.Unlock()
		}()
		call.status, call.header, call.body, call.err = fn(flightCtx)
	}()

	select {
	case <-call.done:
		return call.status, call.header, call.body, call.err
	case <-ctx.Done():
		return 0, nil, nil, ctx.Err()
	}
}

type shortCacheEntry struct {
	key       string
	status    int
	header    http.Header
	body      []byte
	expiresAt time.Time
	elem      *list.Element
}

type shortResponseCache struct {
	mu            sync.Mutex
	maxEntries    int
	maxBytes      int
	maxEntryBytes int
	totalBytes    int
	items         map[string]*shortCacheEntry
	lru           *list.List
}

func newShortResponseCache(maxEntries, maxBytes, maxEntryBytes int) *shortResponseCache {
	return &shortResponseCache{
		maxEntries:    maxEntries,
		maxBytes:      maxBytes,
		maxEntryBytes: maxEntryBytes,
		items:         make(map[string]*shortCacheEntry),
		lru:           list.New(),
	}
}

func (c *shortResponseCache) get(key string, now time.Time) (int, http.Header, []byte, bool) {
	if c == nil {
		return 0, nil, nil, false
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	entry, ok := c.items[key]
	if !ok {
		return 0, nil, nil, false
	}
	if !now.Before(entry.expiresAt) {
		c.removeEntry(entry)
		return 0, nil, nil, false
	}
	c.lru.MoveToFront(entry.elem)
	return entry.status, entry.header, entry.body, true
}

func (c *shortResponseCache) set(key string, status int, header http.Header, body []byte, ttl time.Duration, now time.Time) {
	if c == nil || ttl <= 0 || len(body) > c.maxEntryBytes {
		return
	}
	bodyCopy := append([]byte(nil), body...)
	hdrCopy := header.Clone()

	c.mu.Lock()
	defer c.mu.Unlock()
	if existing, ok := c.items[key]; ok {
		c.removeEntry(existing)
	}
	entry := &shortCacheEntry{
		key:       key,
		status:    status,
		header:    hdrCopy,
		body:      bodyCopy,
		expiresAt: now.Add(ttl),
	}
	entry.elem = c.lru.PushFront(entry)
	c.items[key] = entry
	c.totalBytes += len(bodyCopy)

	for len(c.items) > c.maxEntries || c.totalBytes > c.maxBytes {
		back := c.lru.Back()
		if back == nil {
			break
		}
		c.removeEntry(back.Value.(*shortCacheEntry))
	}
}

func (c *shortResponseCache) removeEntry(entry *shortCacheEntry) {
	c.lru.Remove(entry.elem)
	delete(c.items, entry.key)
	c.totalBytes -= len(entry.body)
}

// HTMLCache stores rendered 200 OK HTML and Markdown responses on disk keyed by buildID + dataVersion.
// Bumping dataVersion immediately invalidates stale entries without blocking requests.
type HTMLCache struct {
	dir     string
	buildID string

	dataVersion atomic.Value // string

	flights flightGroup

	pruneMu sync.Mutex
	pruning bool
}

// NewHTMLCache creates a persistent disk cache rooted at dir.
func NewHTMLCache(dir, buildID, initialDataVersion string) *HTMLCache {
	if buildID == "" {
		buildID = "dev"
	}
	if initialDataVersion == "" {
		initialDataVersion = "initial"
	}
	c := &HTMLCache{
		dir:     dir,
		buildID: buildID,
	}
	c.dataVersion.Store(initialDataVersion)
	_ = os.MkdirAll(dir, 0o755)
	return c
}

// DataVersion returns the active MasterData version key.
func (c *HTMLCache) DataVersion() string {
	v, _ := c.dataVersion.Load().(string)
	return v
}

// SetDataVersion atomically switches the cache namespace to a new MasterData version
// and schedules background pruning of inactive build/version cache files.
func (c *HTMLCache) SetDataVersion(version string) bool {
	if version == "" {
		return false
	}
	prev := c.DataVersion()
	if prev == version {
		return false
	}
	c.dataVersion.Store(version)
	go c.pruneOldEntries(2 * time.Hour)
	return true
}

func (c *HTMLCache) entryPaths(version, variant, reqPath string) (metaPath, gzPath string) {
	sum := sha256.Sum256([]byte(c.buildID + "\n" + version + "\n" + variant + "\n" + reqPath))
	hexKey := hex.EncodeToString(sum[:])
	shard := filepath.Join(c.dir, hexKey[:2])
	base := filepath.Join(shard, hexKey)
	return base + ".json", base + ".gz"
}

// Read returns a cached entry if present for the active dataVersion.
func (c *HTMLCache) Read(variant, reqPath string) (meta cacheMeta, gzBody []byte, ok bool) {
	if c == nil || c.dir == "" {
		return cacheMeta{}, nil, false
	}
	ver := c.DataVersion()
	metaPath, gzPath := c.entryPaths(ver, variant, reqPath)
	rawMeta, err := os.ReadFile(metaPath)
	if err != nil {
		return cacheMeta{}, nil, false
	}
	if json.Unmarshal(rawMeta, &meta) != nil {
		return cacheMeta{}, nil, false
	}
	gzBody, err = os.ReadFile(gzPath)
	if err != nil {
		return cacheMeta{}, nil, false
	}
	return meta, gzBody, true
}

// Write persists a 200 OK response atomically to disk.
func (c *HTMLCache) Write(version, variant, reqPath string, meta cacheMeta, plainBody []byte) {
	if c == nil || c.dir == "" || len(plainBody) == 0 {
		return
	}
	metaPath, gzPath := c.entryPaths(version, variant, reqPath)
	if err := os.MkdirAll(filepath.Dir(metaPath), 0o755); err != nil {
		return
	}
	var buf bytes.Buffer
	gw, err := gzip.NewWriterLevel(&buf, gzip.BestSpeed)
	if err != nil {
		return
	}
	if _, err := gw.Write(plainBody); err != nil {
		_ = gw.Close()
		return
	}
	if gw.Close() != nil {
		return
	}
	meta.BuildID = c.buildID
	if meta.DataVersion == "" {
		meta.DataVersion = version
	}
	meta.CreatedAt = time.Now().Unix()
	rawMeta, err := json.Marshal(meta)
	if err != nil {
		return
	}
	if err := writeAtomically(gzPath, buf.Bytes()); err != nil {
		return
	}
	_ = writeAtomically(metaPath, rawMeta)
}

func writeAtomically(dst string, data []byte) error {
	f, err := os.CreateTemp(filepath.Dir(dst), filepath.Base(dst)+".*.tmp")
	if err != nil {
		return err
	}
	tmp := f.Name()
	cleanup := true
	defer func() {
		if cleanup {
			_ = os.Remove(tmp)
		}
	}()
	if _, err := f.Write(data); err != nil {
		_ = f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	_ = os.Chmod(tmp, 0o644)
	if err := os.Rename(tmp, dst); err != nil {
		return err
	}
	cleanup = false
	return nil
}

// BuildID returns the Next.js build identifier associated with this cache.
func (c *HTMLCache) BuildID() string {
	return c.buildID
}

// ServeCached writes a cached response, honoring Accept-Encoding: gzip.
func ServeCached(w http.ResponseWriter, r *http.Request, meta cacheMeta, gzBody []byte) {
	h := w.Header()
	if meta.ContentType != "" {
		h.Set("Content-Type", meta.ContentType)
	}
	if meta.MarkdownToken != "" {
		h.Set("X-Markdown-Tokens", meta.MarkdownToken)
	}
	if meta.CanonicalLink != "" {
		h.Set("Link", meta.CanonicalLink)
	}
	if meta.DataVersion != "" {
		h.Set("X-Moenotes-Data-Version", meta.DataVersion)
		if strings.HasPrefix(meta.ContentType, "text/html") {
			h.Set("Server-Timing", `page;desc="`+strings.ReplaceAll(meta.DataVersion, `"`, "")+`"`)
		}
	}
	h.Set("Vary", "Accept, Accept-Encoding")
	h.Set("Cache-Control", "public, max-age=0, must-revalidate")
	h.Set("X-Moenotes-Cache", "HIT")

	if acceptsGzip(r.Header.Get("Accept-Encoding")) {
		h.Set("Content-Encoding", "gzip")
		w.WriteHeader(http.StatusOK)
		if r.Method != http.MethodHead {
			_, _ = w.Write(gzBody)
		}
		return
	}
	gr, err := gzip.NewReader(bytes.NewReader(gzBody))
	if err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	defer gr.Close()
	w.WriteHeader(http.StatusOK)
	if r.Method != http.MethodHead {
		_, _ = io.Copy(w, gr)
	}
}

func acceptsGzip(header string) bool {
	for _, part := range strings.Split(header, ",") {
		sub := strings.TrimSpace(strings.ToLower(part))
		if sub == "gzip" || (strings.HasPrefix(sub, "gzip;") && !strings.Contains(sub, "q=0")) {
			return true
		}
	}
	return false
}

// DoCoalesced executes fn once for concurrent identical (version, variant, path) misses.
// Individual callers exit via ctx.Done() without cancelling the shared fn execution.
func (c *HTMLCache) DoCoalesced(ctx context.Context, key string, fn func(context.Context) (int, http.Header, []byte, error)) (int, http.Header, []byte, error) {
	if c == nil {
		if ctx == nil {
			ctx = context.Background()
		}
		if err := ctx.Err(); err != nil {
			return 0, nil, nil, err
		}
		return fn(context.WithoutCancel(ctx))
	}
	return c.flights.do(ctx, key, fn)
}

// pruneOldEntries removes expired cache entries belonging to older builds or superseded MasterData versions,
// while keeping entries of the active (buildID, dataVersion) intact across container restarts on a persistent volume.
func (c *HTMLCache) pruneOldEntries(maxAge time.Duration) {
	c.pruneMu.Lock()
	if c.pruning {
		c.pruneMu.Unlock()
		return
	}
	c.pruning = true
	c.pruneMu.Unlock()
	defer func() {
		c.pruneMu.Lock()
		c.pruning = false
		c.pruneMu.Unlock()
	}()

	activeBuild := c.buildID
	activeVersion := c.DataVersion()
	cutoff := time.Now().Add(-maxAge)

	_ = filepath.WalkDir(c.dir, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		info, statErr := d.Info()
		if statErr != nil || !info.ModTime().Before(cutoff) {
			return nil
		}
		switch {
		case strings.HasSuffix(path, ".tmp"):
			_ = os.Remove(path)
		case strings.HasSuffix(path, ".json"):
			var meta cacheMeta
			if raw, readErr := os.ReadFile(path); readErr == nil && json.Unmarshal(raw, &meta) == nil {
				if meta.BuildID == activeBuild && meta.DataVersion == activeVersion {
					return nil
				}
			}
			_ = os.Remove(path)
			_ = os.Remove(strings.TrimSuffix(path, ".json") + ".gz")
		case strings.HasSuffix(path, ".gz"):
			metaPath := strings.TrimSuffix(path, ".gz") + ".json"
			if _, mErr := os.Stat(metaPath); os.IsNotExist(mErr) {
				_ = os.Remove(path)
			}
		}
		return nil
	})
}
