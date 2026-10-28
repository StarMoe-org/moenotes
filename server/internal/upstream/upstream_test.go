package upstream

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func ptr(value string) *string { return &value }

func TestDescribe(t *testing.T) {
	manifest := &AssetManifest{Regions: map[string]AssetRegion{
		"tw": {ResourceVersion: ptr("1.0.1"), MasterVersion: ptr("m1"), Locales: map[string]LocaleSnapshot{"zh-Hant": {Snapshot: ptr("b")}, "en": {Snapshot: ptr("a")}}},
		"jp": {ResourceVersion: nil, MasterVersion: ptr("m2"), Locales: map[string]LocaleSnapshot{"ja": {}}},
	}}
	data, err := Describe(manifest)
	if err != nil {
		t.Fatal(err)
	}
	if data.Fingerprint != "jp::m2:ja=;tw:1.0.1:m1:en=a,zh-Hant=b" || data.Label != "jp@? tw@1.0.1" {
		t.Fatalf("got %+v", data)
	}
	if _, err := Describe(&AssetManifest{}); err == nil {
		t.Fatal("an empty manifest has no data version")
	}
}

func TestBuildKeyMatchesTheWorkflowCheck(t *testing.T) {
	// scripts/build-site-release.ts checks: sha256(`${revision}\n${fingerprint}\n${commit}`).slice(0, 16).
	sum := sha256.Sum256([]byte("0123456789abcdef\ntw:1\n" + "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"))
	if got := BuildKey("0123456789abcdef", "tw:1", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"); got != hex.EncodeToString(sum[:])[:16] {
		t.Fatalf("got %s", got)
	}
}

func TestSourceRevisionIncludesPublicSettingsOnly(t *testing.T) {
	digest := "d"
	base := SourceRevision(digest, []string{"PATH=/bin"})
	if base != SourceRevision(digest, []string{"PATH=/usr/bin", "MOENOTES_GITHUB_TOKEN=x"}) {
		t.Fatal("non-public variables must not change the revision")
	}
	if base == SourceRevision(digest, []string{"PUBLIC_ASSET_API=https://x"}) {
		t.Fatal("PUBLIC_* variables must change the revision")
	}
	if SourceRevision(digest, []string{"PUBLIC_B=2", "PUBLIC_A=1"}) != SourceRevision(digest, []string{"PUBLIC_A=1", "PUBLIC_B=2"}) {
		t.Fatal("order must not matter")
	}
	if len(base) != 16 {
		t.Fatal("revision length")
	}
}

func TestSourceDigestCoversSourcesOnly(t *testing.T) {
	root := t.TempDir()
	write := func(name, content string) {
		file := filepath.Join(root, filepath.FromSlash(name))
		_ = os.MkdirAll(filepath.Dir(file), 0o755)
		if err := os.WriteFile(file, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	for _, name := range []string{"next.config.ts", "postcss.config.mjs", "package.json", "bun.lock", "tsconfig.json", "src/a.ts", "public/b.txt"} {
		write(name, name)
	}
	first, err := SourceDigest(root)
	if err != nil {
		t.Fatal(err)
	}
	write("server/main.go", "package main")
	write("docs/x.md", "docs")
	if again, _ := SourceDigest(root); again != first {
		t.Fatal("files outside src/ and public/ must not change the digest")
	}
	write("src/a.ts", "changed")
	if again, _ := SourceDigest(root); again == first {
		t.Fatal("a source change must change the digest")
	}
}

func TestExportLagAndRewrites(t *testing.T) {
	var seenQueries []string
	var seenCacheControl []string
	masterdata := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/current_version.json" {
			http.NotFound(w, r)
			return
		}
		seenQueries = append(seenQueries, r.URL.Query().Get("_t"))
		seenCacheControl = append(seenCacheControl, r.Header.Get("Cache-Control"))
		_, _ = w.Write([]byte(`{"regions":{"hk-tw-mo":{"version":"m2"},"jp":{"version":"j1"}}}`))
	}))
	defer masterdata.Close()
	fetcher := &Fetcher{Rewrites: map[string]string{"https://metadata.example": masterdata.URL}}
	url := "https://metadata.example/current_version.json"
	if fetcher.Target(url) != masterdata.URL+"/current_version.json" || fetcher.Target("https://other.example/x") != "https://other.example/x" {
		t.Fatal("rewrites")
	}
	ctx := context.Background()
	behind := &AssetManifest{Regions: map[string]AssetRegion{"tw": {MasterVersion: ptr("m1"), MetadataRegion: ptr("hk-tw-mo")}}}
	if lag, err := ExportLag(ctx, behind, fetcher, url); err != nil || lag != "MasterData hk-tw-mo is at m2, assets exported m1" {
		t.Fatalf("got %q, %v", lag, err)
	}
	current := &AssetManifest{Regions: map[string]AssetRegion{
		"tw": {MasterVersion: ptr("m2"), MetadataRegion: ptr("hk-tw-mo")},
		"en": {MasterVersion: ptr("x"), MetadataRegion: ptr("")},
		"jp": {MasterVersion: ptr("j1")},
	}}
	if lag, err := ExportLag(ctx, current, fetcher, url); err != nil || lag != "" {
		t.Fatalf("got %q, %v", lag, err)
	}
	if len(seenQueries) < 2 || seenQueries[0] == "" || seenQueries[1] == "" || seenQueries[0] == seenQueries[1] {
		t.Fatalf("current_version.json must always carry unique _t cache-busting query tokens, got %v", seenQueries)
	}
	for _, cc := range seenCacheControl {
		if cc != "no-cache, no-store, max-age=0, must-revalidate" {
			t.Fatalf("expected strict no-cache, no-store header on current_version.json, got %q", cc)
		}
	}
	pending := &AssetManifest{Regions: current.Regions, Pending: map[string]json.RawMessage{"tw": json.RawMessage("{}"), "kr": json.RawMessage("{}")}}
	if lag, _ := ExportLag(ctx, pending, fetcher, url); lag != "asset release still running for tw" {
		t.Fatalf("only released regions hold builds back, got %q", lag)
	}
}
