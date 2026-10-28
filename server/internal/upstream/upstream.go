// Package upstream reads the asset and metadata services' version manifests and derives the build key: what a
// site build depends on (the source digest, the exported data and the exact commit).
//
// The CI side (scripts/site-data.ts) computes the same values; tests/site-data.test.ts compares both.
package upstream

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync/atomic"
	"time"
)

// AssetManifest is the asset service's `versions/current_version.json`.
type AssetManifest struct {
	Regions map[string]AssetRegion `json:"regions"`
	// Releases still queued or running, by region.
	Pending map[string]json.RawMessage `json:"pending"`
}

// AssetRegion is one region's exported release.
type AssetRegion struct {
	ResourceVersion *string `json:"resource_version"`
	MasterVersion   *string `json:"master_version"`
	// The metadata service region the release was exported from; "" opts out of version tracking.
	MetadataRegion *string                   `json:"metadata_region"`
	Locales        map[string]LocaleSnapshot `json:"locales"`
}

// LocaleSnapshot identifies one locale's exported content.
type LocaleSnapshot struct {
	Snapshot *string `json:"snapshot"`
}

type masterdataManifest struct {
	Regions map[string]struct {
		Version *string `json:"version"`
	} `json:"regions"`
}

// DataVersion identifies the exported data a build renders.
type DataVersion struct {
	// Changes whenever an exported release differs: resource or MasterData version, or any locale snapshot.
	Fingerprint string `json:"fingerprint"`
	// Short human-readable form for logs and the status endpoint.
	Label string `json:"label"`
}

func str(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func sortedKeys[T any](record map[string]T) []string {
	keys := make([]string, 0, len(record))
	for key := range record {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

// Describe derives the data version of a release manifest.
func Describe(manifest *AssetManifest) (DataVersion, error) {
	names := sortedKeys(manifest.Regions)
	if len(names) == 0 {
		return DataVersion{}, errors.New("the asset manifest lists no released region")
	}
	fingerprints := make([]string, 0, len(names))
	labels := make([]string, 0, len(names))
	for _, name := range names {
		region := manifest.Regions[name]
		locales := make([]string, 0, len(region.Locales))
		for _, locale := range sortedKeys(region.Locales) {
			locales = append(locales, locale+"="+str(region.Locales[locale].Snapshot))
		}
		fingerprints = append(fingerprints, fmt.Sprintf("%s:%s:%s:%s", name, str(region.ResourceVersion), str(region.MasterVersion), strings.Join(locales, ",")))
		label := "?"
		if region.ResourceVersion != nil {
			label = *region.ResourceVersion
		}
		labels = append(labels, name+"@"+label)
	}
	return DataVersion{Fingerprint: strings.Join(fingerprints, ";"), Label: strings.Join(labels, " ")}, nil
}

// Fetcher reads the version manifests, sending public origins to their in-cluster replacements.
type Fetcher struct {
	Client *http.Client
	// Rewrites maps a public origin to the origin requests are sent to.
	Rewrites map[string]string
}

// Target is the URL a request for url is sent to.
func (f *Fetcher) Target(url string) string {
	for from, to := range f.Rewrites {
		from = strings.TrimRight(from, "/")
		if to == "" || from == "" {
			continue
		}
		if url == from || strings.HasPrefix(url, from+"/") || strings.HasPrefix(url, from+"?") {
			return strings.TrimRight(to, "/") + url[len(from):]
		}
	}
	return url
}

var cacheBustSeq atomic.Uint64

// WithCacheBust appends a unique `_t` query parameter so CDN and reverse-proxy URL caches
// never serve a stale `current_version.json` response.
func WithCacheBust(rawURL string) string {
	token := strconv.FormatInt(time.Now().UnixNano(), 10) + "-" + strconv.FormatUint(cacheBustSeq.Add(1), 10)
	parsed, err := url.Parse(rawURL)
	if err != nil {
		sep := "?"
		if strings.Contains(rawURL, "?") {
			sep = "&"
		}
		return rawURL + sep + "_t=" + token
	}
	q := parsed.Query()
	q.Set("_t", token)
	parsed.RawQuery = q.Encode()
	return parsed.String()
}

// JSON fetches and decodes a version-manifest JSON document, forcing penetration of any intermediate HTTP/CDN caches.
func (f *Fetcher) JSON(ctx context.Context, rawURL string, into any) error {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	target := WithCacheBust(f.Target(rawURL))
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return err
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Cache-Control", "no-cache, no-store, max-age=0, must-revalidate")
	request.Header.Set("Pragma", "no-cache")
	request.Header.Set("Expires", "0")
	client := f.Client
	if client == nil {
		client = http.DefaultClient
	}
	response, err := client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 1<<16))
		return fmt.Errorf("HTTP %d from %s", response.StatusCode, target)
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 32<<20)).Decode(into); err != nil {
		return fmt.Errorf("invalid JSON from %s: %w", target, err)
	}
	return nil
}

// ExportLag explains why the published assets may not cover the MasterData a build would read right now, or
// returns "" when they do. MasterData moves first and the asset export follows; a build in between would render
// pages whose files are not published yet. Only regions with an exported release count.
func ExportLag(ctx context.Context, manifest *AssetManifest, fetcher *Fetcher, masterdataVersionURL string) (string, error) {
	var pending []string
	for _, name := range sortedKeys(manifest.Pending) {
		if _, released := manifest.Regions[name]; released {
			pending = append(pending, name)
		}
	}
	if len(pending) > 0 {
		return "asset release still running for " + strings.Join(pending, ", "), nil
	}
	var masterdata masterdataManifest
	if err := fetcher.JSON(ctx, masterdataVersionURL, &masterdata); err != nil {
		return "", err
	}
	for _, name := range sortedKeys(manifest.Regions) {
		region := manifest.Regions[name]
		metadataRegion := name
		if region.MetadataRegion != nil {
			metadataRegion = *region.MetadataRegion
		}
		master := str(region.MasterVersion)
		if metadataRegion == "" || master == "" {
			continue
		}
		current := str(masterdata.Regions[metadataRegion].Version)
		if current != "" && current != master {
			return fmt.Sprintf("MasterData %s is at %s, assets exported %s", metadataRegion, current, master), nil
		}
	}
	return "", nil
}

// SourceRoots are the files of the repository that shape the built site.
var (
	sourceFiles = []string{"next.config.ts", "postcss.config.mjs", "package.json", "bun.lock", "tsconfig.json"}
	sourceDirs  = []string{"src", "public"}
)

// SourceDigest hashes everything in a source checkout that shapes the site: the files under src/ and public/, the
// dependency lock and the build configuration. Images ship the digest instead of the sources.
func SourceDigest(root string) (string, error) {
	files := append([]string(nil), sourceFiles...)
	for _, dir := range sourceDirs {
		base := filepath.Join(root, dir)
		err := filepath.WalkDir(base, func(path string, entry fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if entry.Type().IsRegular() {
				rel, err := filepath.Rel(root, path)
				if err != nil {
					return err
				}
				files = append(files, filepath.ToSlash(rel))
			}
			return nil
		})
		if err != nil {
			return "", err
		}
	}
	sort.Strings(files)
	hash := sha256.New()
	for _, file := range files {
		handle, err := os.Open(filepath.Join(root, filepath.FromSlash(file)))
		if err != nil {
			return "", err
		}
		hash.Write([]byte(file + "\x00"))
		_, err = io.Copy(hash, handle)
		handle.Close()
		if err != nil {
			return "", err
		}
		hash.Write([]byte{0})
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

// PublicEnvironment returns the PUBLIC_* variables of an environment (`NAME=value` entries), sorted by name.
func PublicEnvironment(environ []string) [][2]string {
	var entries [][2]string
	for _, entry := range environ {
		name, value, ok := strings.Cut(entry, "=")
		if ok && strings.HasPrefix(name, "PUBLIC_") {
			entries = append(entries, [2]string{name, value})
		}
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i][0] < entries[j][0] })
	return entries
}

// SourceRevision combines the source digest with the PUBLIC_* variables, which pages inline: a new image or a new
// public setting rebuilds even when the data did not move.
func SourceRevision(digest string, environ []string) string {
	hash := sha256.New()
	hash.Write([]byte("moenotes-source-v2\n" + digest + "\n"))
	for _, entry := range PublicEnvironment(environ) {
		hash.Write([]byte(entry[0] + "=" + entry[1] + "\x00"))
	}
	return hex.EncodeToString(hash.Sum(nil))[:16]
}

// BuildKey identifies one site build: its source revision, its data and the exact commit CI checks out.
func BuildKey(revision, fingerprint, commit string) string {
	sum := sha256.Sum256([]byte(revision + "\n" + fingerprint + "\n" + commit))
	return hex.EncodeToString(sum[:])[:16]
}
