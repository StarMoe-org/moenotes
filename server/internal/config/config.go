// Package config reads the deploy server's settings from the environment (docs/deployment.md).
package config

import (
	"errors"
	"fmt"
	"math"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// Config holds every server setting.
type Config struct {
	Host string
	Port int

	DataDir     string
	BuildsDir   string
	LogsDir     string
	StatePath   string
	PendingPath string

	GithubToken    string
	GithubRepo     string
	GithubRef      string
	GithubCommit   string
	GithubPoll     time.Duration
	GithubWorkflow string

	Poll         time.Duration
	BuildTimeout time.Duration
	KeepBuilds   int
	KeepLogs     int
	// CompressWorkers is how many files the background compression works on at once.
	CompressWorkers int

	// AssetInternal / MasterdataInternal replace the public origins for the server's own version checks.
	AssetInternal      string
	MasterdataInternal string
	// APIOrigin is starmoe-api's origin; empty disables /api/*. APIInvalid reports a value that is not a URL.
	APIOrigin  string
	APIInvalid bool
	// RoomCheckOrigin is the room-check service's base URL behind /api/room-check/*; empty disables the route and
	// RoomCheckInvalid reports a value that is not one.
	RoomCheckOrigin  string
	RoomCheckInvalid bool
	// RoomCheckKey is the optional shared key sent to the room-check service. It is never logged.
	RoomCheckKey string

	// SourceDigest is the image's source digest (see upstream.SourceDigest); empty when unavailable.
	SourceDigestFile string
	// AppDir is a source checkout to compute the digest from when no digest file is shipped (development).
	AppDir string

	// Warnings lists settings that are set but no longer have any effect.
	Warnings []string
}

// Retired settings of the Bun server; reported once at startup.
var retired = map[string]string{
	"MOENOTES_SPLIT_LOCALES":     "the server no longer renders the site; GitHub Actions builds all locales together",
	"MOENOTES_SYNC_WAIT_SECONDS": "builds always wait for the asset export to catch up with MasterData",
	"MOENOTES_SERVERS":           "set it in the site build instead; the deploy server only installs CI builds",
	"MOENOTES_VERSION_URL":       "the server reads the public release manifest (or MOENOTES_ASSET_INTERNAL)",
	"MOENOTES_MASTERDATA_DIR":    "local MasterData overrides apply to local `astro build` runs only",
}

func env(name string) string { return strings.TrimSpace(os.Getenv(name)) }

func positive(name string, fallback float64) (float64, error) {
	raw := env(name)
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.ParseFloat(raw, 64)
	if err != nil || value <= 0 || math.IsInf(value, 0) || math.IsNaN(value) {
		return 0, fmt.Errorf("%s must be a positive number, got %q", name, raw)
	}
	return value, nil
}

func seconds(name string, fallback float64) (time.Duration, error) {
	value, err := positive(name, fallback)
	return time.Duration(value * float64(time.Second)), err
}

// ParseAPIOrigin reads MOENOTES_API_INTERNAL: an absolute http(s) URL, in-cluster or public. Anything else is
// reported as invalid and leaves /api/* disabled, so a typo does not take the site down.
func ParseAPIOrigin(raw string) (origin string, invalid bool) {
	if raw == "" {
		return "", false
	}
	parsed, err := url.Parse(raw)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		return "", true
	}
	return parsed.Scheme + "://" + parsed.Host, false
}

// ParseRoomCheckOrigin reads MOENOTES_ROOM_CHECK_INTERNAL: an absolute http(s) URL, in-cluster or public. Anything
// else is reported as invalid and leaves /api/room-check/* disabled, so a typo does not take the site down. A path in
// the value is kept as the base path the room-check paths are appended to.
func ParseRoomCheckOrigin(raw string) (origin string, invalid bool) {
	raw = strings.TrimRight(raw, "/")
	if raw == "" {
		return "", false
	}
	parsed, err := url.Parse(raw)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		return "", true
	}
	return raw, false
}

func origin(name string) (string, error) {
	raw := strings.TrimRight(env(name), "/")
	if raw == "" {
		return "", nil
	}
	parsed, err := url.Parse(raw)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		return "", fmt.Errorf("%s must be an absolute http(s) URL", name)
	}
	return raw, nil
}

// Load reads the configuration from the process environment.
func Load() (*Config, error) {
	var errs []error
	check := func(err error) {
		if err != nil {
			errs = append(errs, err)
		}
	}
	dataDir := env("MOENOTES_DATA_DIR")
	if dataDir == "" {
		dataDir = "/data"
	}
	dataDir, err := filepath.Abs(dataDir)
	check(err)
	c := &Config{
		Host:             env("HOST"),
		DataDir:          dataDir,
		BuildsDir:        filepath.Join(dataDir, "builds"),
		LogsDir:          filepath.Join(dataDir, "logs"),
		StatePath:        filepath.Join(dataDir, "state.json"),
		PendingPath:      filepath.Join(dataDir, "github-build.json"),
		GithubToken:      env("MOENOTES_GITHUB_TOKEN"),
		GithubRepo:       env("MOENOTES_GITHUB_REPO"),
		GithubRef:        env("MOENOTES_GITHUB_REF"),
		GithubCommit:     env("MOENOTES_REVISION"),
		GithubWorkflow:   "build-site.yml",
		KeepLogs:         10,
		SourceDigestFile: env("MOENOTES_SOURCE_DIGEST_FILE"),
		AppDir:           env("MOENOTES_APP_DIR"),
	}
	if c.Host == "" {
		c.Host = "0.0.0.0"
	}
	if c.GithubRepo == "" {
		c.GithubRepo = "StarMoe-org/moenotes"
	}
	if c.GithubRef == "" {
		c.GithubRef = "main"
	}
	port, err := positive("PORT", 80)
	check(err)
	if port != math.Trunc(port) || port > 65535 {
		check(fmt.Errorf("PORT must be a TCP port, got %v", port))
	}
	c.Port = int(port)
	c.GithubPoll, err = seconds("MOENOTES_GITHUB_POLL_SECONDS", 30)
	check(err)
	c.Poll, err = seconds("MOENOTES_POLL_SECONDS", 60)
	check(err)
	c.BuildTimeout, err = seconds("MOENOTES_BUILD_TIMEOUT_SECONDS", 3600)
	check(err)
	keep, err := positive("MOENOTES_KEEP_BUILDS", 4)
	check(err)
	c.KeepBuilds = max(2, int(keep))
	workers, err := positive("MOENOTES_COMPRESS_WORKERS", float64(max(1, runtime.NumCPU()/2)))
	check(err)
	c.CompressWorkers = max(1, int(workers))
	c.AssetInternal, err = origin("MOENOTES_ASSET_INTERNAL")
	check(err)
	c.MasterdataInternal, err = origin("MOENOTES_MASTERDATA_INTERNAL")
	check(err)
	c.APIOrigin, c.APIInvalid = ParseAPIOrigin(env("MOENOTES_API_INTERNAL"))
	c.RoomCheckOrigin, c.RoomCheckInvalid = ParseRoomCheckOrigin(env("MOENOTES_ROOM_CHECK_INTERNAL"))
	c.RoomCheckKey = env("MOENOTES_ROOM_CHECK_KEY")

	if mode := env("MOENOTES_BUILD_MODE"); mode != "" && mode != "github" {
		c.Warnings = append(c.Warnings, fmt.Sprintf("MOENOTES_BUILD_MODE=%s is no longer supported; the site is always built by GitHub Actions", mode))
	}
	for _, name := range []string{"MOENOTES_SPLIT_LOCALES", "MOENOTES_SYNC_WAIT_SECONDS", "MOENOTES_SERVERS", "MOENOTES_VERSION_URL", "MOENOTES_MASTERDATA_DIR"} {
		if env(name) != "" {
			c.Warnings = append(c.Warnings, fmt.Sprintf("%s is ignored: %s", name, retired[name]))
		}
	}
	return c, errors.Join(errs...)
}
