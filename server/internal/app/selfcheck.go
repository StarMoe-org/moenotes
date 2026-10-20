package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/StarMoe-org/moenotes/server/internal/artifact"
	"github.com/StarMoe-org/moenotes/server/internal/config"
	"github.com/StarMoe-org/moenotes/server/internal/finalize"
	"github.com/StarMoe-org/moenotes/server/internal/siteconfig"
	"github.com/StarMoe-org/moenotes/server/internal/upstream"
	"github.com/StarMoe-org/moenotes/server/internal/web"
)

func writeJSON(w http.ResponseWriter, value any) {
	w.Header().Set("Content-Type", "application/json;charset=utf-8")
	encoder := json.NewEncoder(w)
	encoder.SetEscapeHTML(false)
	_ = encoder.Encode(value)
}

// SelfCheck is an offline smoke test of the server: packing and installing an artifact, linking and compressing a
// build, serving it, and relaying /api. The image build runs it, so a broken server fails the image and the running
// deployment stays up.
func SelfCheck(ctx context.Context) error {
	site := siteconfig.Current()
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	if digest, err := LoadSourceDigest(cfg); err == nil {
		fmt.Printf("self-check: source digest %s\n", digest[:16])
	} else if cfg.SourceDigestFile != "" {
		return err
	}
	dir, err := os.MkdirTemp("", "moenotes-self-check-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(dir)
	failed := func(format string, args ...any) error { return fmt.Errorf("self-check failed: "+format, args...) }

	page := "<!doctype html><title>check</title>" + strings.Repeat("<p>moenotes</p>", 200)
	write := func(root, name, content string) error {
		file := filepath.Join(root, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
			return err
		}
		return os.WriteFile(file, []byte(content), 0o644)
	}
	writeSite := func(root string) error {
		names := []string{"music/1/index.html", "u/index.html", "ja/u/index.html"}
		for _, locale := range site.Locales() {
			home := "index.html"
			if locale.Prefix != "" {
				home = locale.Prefix + "/index.html"
			}
			names = append(names, home)
		}
		for _, name := range names {
			if err := write(root, name, page); err != nil {
				return err
			}
		}
		if err := write(root, "404.html", "<!doctype html><title>404</title>"); err != nil {
			return err
		}
		return write(root, "_astro/app.js", strings.Repeat("console.log(1);", 200))
	}

	// Pack a site the way CI does, publish it from a local HTTPS server and install it.
	source := filepath.Join(dir, "source", "site")
	if err := writeSite(source); err != nil {
		return err
	}
	var prefixes []string
	for _, locale := range site.Locales() {
		prefixes = append(prefixes, locale.Prefix)
	}
	packed, err := artifact.Pack(ctx, source, filepath.Join(dir, "release"), artifact.PackOptions{LocalePrefixes: prefixes, PartBytes: 4096})
	if err != nil {
		return err
	}
	if len(packed.Parts) < 1 || packed.Files != int64(len(site.Locales())+5) {
		return failed("packed %d parts / %d files", len(packed.Parts), packed.Files)
	}
	expected := artifact.Expected{Key: "0123456789abcdef", Revision: "fedcba9876543210", Commit: strings.Repeat("a", 40),
		Data: upstream.DataVersion{Fingerprint: "tw:1:1:en=x", Label: "tw@1"}}
	manifest := &artifact.Manifest{Schema: artifact.Schema, Key: expected.Key, Revision: expected.Revision, Commit: expected.Commit,
		Data: expected.Data, BuiltAt: time.Now().UTC().Format("2006-01-02T15:04:05.000Z"), Locales: site.LocaleCodes(),
		Format: artifact.Format, Size: packed.Size, SHA256: packed.SHA256, Parts: packed.Parts, Files: packed.Files,
		ExpandedBytes: packed.ExpandedBytes, Pages: packed.Pages}
	raw, _ := json.Marshal(manifest)
	if _, err := artifact.ParseManifest(raw, expected, site.LocaleCodes()); err != nil {
		return failed("own manifest rejected: %v", err)
	}
	release := httptest.NewTLSServer(http.FileServer(http.Dir(filepath.Join(dir, "release"))))
	defer release.Close()
	var urls []string
	for _, part := range packed.Parts {
		urls = append(urls, release.URL+"/"+part.Name)
	}
	staging := filepath.Join(dir, "staging")
	if err := os.Mkdir(staging, 0o755); err != nil {
		return err
	}
	store := NewStore(ctx, &config.Config{}, site)
	if err := artifact.Install(ctx, release.Client(), artifact.Source{Manifest: manifest, PartURLs: urls}, staging, store.Homepages()); err != nil {
		return failed("install: %v", err)
	}
	previous := filepath.Join(staging, "site")
	if _, err := os.Stat(filepath.Join(staging, "parts")); !errors.Is(err, os.ErrNotExist) {
		return failed("install should remove its downloaded parts")
	}
	tampered := *manifest
	tampered.SHA256 = strings.Repeat("0", 64)
	other := filepath.Join(dir, "tampered")
	_ = os.Mkdir(other, 0o755)
	if err := artifact.Install(ctx, release.Client(), artifact.Source{Manifest: &tampered, PartURLs: urls}, other, nil); err == nil {
		return failed("a checksum mismatch should be refused")
	}
	if _, err := os.Stat(filepath.Join(other, "site")); !errors.Is(err, os.ErrNotExist) {
		return failed("a refused install should leave nothing behind")
	}

	// Link and compress.
	if err := write(previous, "_astro/old.js", "console.log(0);"); err != nil {
		return err
	}
	if err := write(previous, ".prerender/entry.mjs", "export {};"); err != nil {
		return err
	}
	first, err := finalize.Link(ctx, previous, nil)
	if err != nil {
		return err
	}
	if first.Linked != 0 || first.Files != int(packed.Files)+1 {
		return failed("expected %d files and nothing linked, got %d / %d", packed.Files+1, first.Files, first.Linked)
	}
	if _, err := os.Stat(filepath.Join(previous, ".prerender")); !errors.Is(err, os.ErrNotExist) {
		return failed("link should drop .prerender/")
	}
	roots := &web.RootSource{}
	handler := (&Server{cfg: &config.Config{}, site: site, store: &Store{Roots: roots}}).routes()
	get := func(path string, headers map[string]string, method string) *httptest.ResponseRecorder {
		request := httptest.NewRequest(method, "http://self-check"+path, nil)
		for name, value := range headers {
			request.Header.Set(name, value)
		}
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, request)
		return recorder
	}
	roots.Store(web.Roots{})
	if code := get("/", nil, http.MethodGet).Code; code != http.StatusServiceUnavailable {
		return failed("no build should answer 503, got %d", code)
	}
	roots.Store(web.Roots{Current: previous})
	if response := get("/", map[string]string{"Accept-Encoding": "gzip, br"}, http.MethodGet); response.Code != 200 || response.Header().Get("Content-Encoding") != "" {
		return failed("a build without variants should be served as is")
	}
	if err := write(previous, "index.html.br.tmp-1", "partial"); err != nil {
		return err
	}
	compressed, err := finalize.Compress(ctx, previous, 2)
	if err != nil {
		return err
	}
	compressible := int(packed.Files) - 1 // the 404 page is too small
	if compressed.Compressed != compressible {
		return failed("expected %d compressed files, got %d", compressible, compressed.Compressed)
	}
	if _, err := os.Stat(filepath.Join(previous, "index.html.br.tmp-1")); !errors.Is(err, os.ErrNotExist) {
		return failed("compress should drop an interrupted run's temporary files")
	}
	if again, _ := finalize.Compress(ctx, previous, 2); again.Compressed != 0 {
		return failed("a second compression should find nothing to do")
	}
	_ = os.Remove(filepath.Join(previous, "index.html.gz"))
	if again, _ := finalize.Compress(ctx, previous, 2); again.Compressed != 1 {
		return failed("compress should complete a file an interrupted run left with one variant")
	}
	current := filepath.Join(dir, "current")
	if err := writeSite(current); err != nil {
		return err
	}
	second, err := finalize.Link(ctx, current, &finalize.Previous{Site: previous, Manifest: first.Manifest})
	if err != nil {
		return err
	}
	if second.Linked != int(packed.Files) {
		return failed("expected %d linked files, got %d", packed.Files, second.Linked)
	}
	if again, _ := finalize.Compress(ctx, current, 2); again.Compressed != 0 {
		return failed("linked files should come with the live build's variants")
	}

	// Serving.
	roots.Store(web.Roots{Current: current, Previous: []string{previous}})
	home := get("/", map[string]string{"Accept-Encoding": "gzip, br"}, http.MethodGet)
	if home.Code != 200 || home.Header().Get("Content-Encoding") != "br" {
		return failed("GET / should serve the brotli variant")
	}
	etag := home.Header().Get("ETag")
	if code := get("/", map[string]string{"Accept-Encoding": "br", "If-None-Match": etag}, http.MethodGet).Code; code != http.StatusNotModified {
		return failed("a matching ETag should answer 304, got %d", code)
	}
	version := home.Header().Get("Server-Timing")
	if !regexp.MustCompile(`^page;desc="[0-9a-z]+-[0-9a-z]+"$`).MatchString(version) {
		return failed("HTML should carry its page version, got %q", version)
	}
	if get("/", map[string]string{"Accept-Encoding": "identity"}, http.MethodGet).Header().Get("Server-Timing") != version {
		return failed("the page version should not depend on the encoding")
	}
	roots.Store(web.Roots{Current: previous})
	if get("/", nil, http.MethodGet).Header().Get("Server-Timing") != version {
		return failed("a page linked unchanged into a new build should keep its version")
	}
	roots.Store(web.Roots{Current: current, Previous: []string{previous}})
	checks := []struct {
		path, method string
		status       int
		what         string
	}{
		{"/music/1", http.MethodGet, 200, "GET /music/1 should serve music/1/index.html"},
		{"/music/1", http.MethodHead, 200, "HEAD should be served"},
		{"/missing", http.MethodGet, 404, "unknown paths should answer 404"},
		{"/u/tw/21139118822", http.MethodGet, 200, "a player page should serve the /u/ shell"},
		{"/ja/u/jp/59336778464/", http.MethodGet, 200, "a localized player page should serve that locale's shell"},
		{"/u/tw/31139118822", http.MethodGet, 404, "an ID that cannot be on the server is not a player page"},
		{"/u/jp/9223372036854775808", http.MethodGet, 404, "a JP ID beyond int64 is not a player page"},
		{"/xx/u/tw/21139118822", http.MethodGet, 404, "an unknown locale prefix is not a player page"},
		{"/%2e%2e/%2e%2e/etc/hostname", http.MethodGet, 404, "paths must stay inside the site"},
		{"/_astro/old.js", http.MethodGet, 200, "/_astro/ should fall back to earlier builds"},
		{"/", http.MethodPost, 405, "only GET and HEAD are served"},
	}
	for _, check := range checks {
		if code := get(check.path, nil, check.method).Code; code != check.status {
			return failed("%s (got %d)", check.what, code)
		}
	}
	script := get("/_astro/app.js", nil, http.MethodGet)
	if !strings.Contains(script.Header().Get("Cache-Control"), "immutable") {
		return failed("/_astro/ should be immutable")
	}
	if script.Header().Get("Server-Timing") != "" {
		return failed("only HTML should carry a page version")
	}
	if get("/healthz", nil, http.MethodGet).Code != 200 || get("/readyz", nil, http.MethodGet).Code != 503 {
		return failed("health endpoints")
	}

	// /api relay: status, redirect, every Set-Cookie and the request body pass through.
	if code := get("/api/me", nil, http.MethodGet).Code; code != 404 {
		return failed("/api without MOENOTES_API_INTERNAL should answer 404, got %d", code)
	}
	for _, bad := range []string{"passport.bdon.moe", "ftp://api.star.moe", "/api"} {
		if origin, invalid := config.ParseAPIOrigin(bad); !invalid || origin != "" {
			return failed("%q should be refused as MOENOTES_API_INTERNAL", bad)
		}
	}
	if origin, _ := config.ParseAPIOrigin("https://api.star.moe/"); origin != "https://api.star.moe" {
		return failed("an https origin should be accepted")
	}
	upstreamAPI := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		cookie, _ := r.Cookie("s")
		value := ""
		if cookie != nil {
			value = cookie.Value
		}
		w.Header().Set("Location", "/after")
		w.Header().Set("X-Echo", value+"|"+string(body)+"|"+r.URL.RawQuery)
		w.Header().Add("Set-Cookie", "a=1; Path=/")
		w.Header().Add("Set-Cookie", "b=2; Path=/")
		w.WriteHeader(http.StatusSeeOther)
	}))
	defer upstreamAPI.Close()
	proxy := &web.APIProxy{Origin: upstreamAPI.URL, Client: upstreamAPI.Client()}
	request := httptest.NewRequest(http.MethodPost, "http://self-check/api/auth/logout?x=1", bytes.NewReader([]byte("hello")))
	request.Header.Set("Cookie", "s=1")
	relayed := httptest.NewRecorder()
	proxy.ServeHTTP(relayed, request)
	if relayed.Code != http.StatusSeeOther || relayed.Header().Get("Location") != "/after" {
		return failed("the proxy should pass redirects through")
	}
	if len(relayed.Header().Values("Set-Cookie")) != 2 {
		return failed("the proxy should keep every Set-Cookie")
	}
	if relayed.Header().Get("X-Echo") != "1|hello|x=1" {
		return failed("the proxy should forward cookies, the body and the query, got %q", relayed.Header().Get("X-Echo"))
	}

	// /api/room-check relay: refused without its origin, and its account-bound actions need a session.
	if code := get("/api/room-check/v1/rooms/1234567", nil, http.MethodGet).Code; code != 404 {
		return failed("/api/room-check without MOENOTES_ROOM_CHECK_INTERNAL should answer 404, got %d", code)
	}
	for _, bad := range []string{"room-check.internal:8080", "ftp://room-check.internal", "//room-check.internal"} {
		if origin, invalid := config.ParseRoomCheckOrigin(bad); !invalid || origin != "" {
			return failed("%q should be refused as MOENOTES_ROOM_CHECK_INTERNAL", bad)
		}
	}
	if origin, invalid := config.ParseRoomCheckOrigin("http://room-check.internal:8080/"); invalid || origin != "http://room-check.internal:8080" {
		return failed("an http origin should be accepted, got %q", origin)
	}
	roomCheck := &web.RoomCheckProxy{Origin: upstreamAPI.URL}
	create := httptest.NewRecorder()
	roomCheck.ServeHTTP(create, httptest.NewRequest(http.MethodPost, "http://self-check/api/room-check/v1/rooms/create", bytes.NewReader([]byte("{}"))))
	if create.Code != http.StatusUnauthorized || strings.TrimSpace(create.Body.String()) != `{"error":"login_required"}` {
		return failed("an anonymous room create should answer 401, got %d %q", create.Code, create.Body.String())
	}
	fmt.Println("self-check passed")
	return nil
}
