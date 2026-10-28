// Package ssr implements the semi-SSR Next.js gateway, persistent HTML/Markdown disk cache,
// idle warmup, and standalone Node supervisor (modeled after StarMoe-org/Moesekai).
package ssr

import (
	"bytes"
	"compress/gzip"
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

// HTMLCache stores rendered 200 OK HTML and Markdown responses on disk keyed by buildID + dataVersion.
// Bumping dataVersion immediately invalidates stale entries without blocking requests.
type HTMLCache struct {
	dir     string
	buildID string

	dataVersion atomic.Value // string

	flightMu sync.Mutex
	flights  map[string]*inflightCall

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
		flights: make(map[string]*inflightCall),
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
// and schedules background pruning of older cache files.
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
	meta.CreatedAt = time.Now().Unix()
	rawMeta, err := json.Marshal(meta)
	if err != nil {
		return
	}
	tmpGz := gzPath + ".tmp"
	tmpMeta := metaPath + ".tmp"
	if os.WriteFile(tmpGz, buf.Bytes(), 0o644) != nil {
		return
	}
	if os.Rename(tmpGz, gzPath) != nil {
		_ = os.Remove(tmpGz)
		return
	}
	if os.WriteFile(tmpMeta, rawMeta, 0o644) != nil {
		return
	}
	if os.Rename(tmpMeta, metaPath) != nil {
		_ = os.Remove(tmpMeta)
	}
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
func (c *HTMLCache) DoCoalesced(key string, fn func() (int, http.Header, []byte, error)) (int, http.Header, []byte, error) {
	c.flightMu.Lock()
	if call, ok := c.flights[key]; ok {
		c.flightMu.Unlock()
		<-call.done
		return call.status, call.header, call.body, call.err
	}
	call := &inflightCall{done: make(chan struct{})}
	c.flights[key] = call
	c.flightMu.Unlock()

	call.status, call.header, call.body, call.err = fn()

	c.flightMu.Lock()
	delete(c.flights, key)
	close(call.done)
	c.flightMu.Unlock()
	return call.status, call.header, call.body, call.err
}

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

	cutoff := time.Now().Add(-maxAge)
	_ = filepath.WalkDir(c.dir, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		info, statErr := d.Info()
		if statErr == nil && info.ModTime().Before(cutoff) {
			_ = os.Remove(path)
		}
		return nil
	})
}
