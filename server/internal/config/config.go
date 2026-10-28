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

	// BuildMode selects "ssr" (Next.js semi-SSR + persistent HTML/Markdown disk cache) or "github" (CI artifact mode).
	BuildMode            string
	FrontendProxyURL     string
	FrontendProxyManaged bool
	NextjsStandaloneDir  string
	NextjsPort           string
	NextMaxOldSpaceMB    string
	NextBuildID          string
	HTMLCacheDir         string
	StaticArchiveDir     string
	WarmupEnabled        bool

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

	// SourceDigestFile is the image's source digest (see upstream.SourceDigest); empty when unavailable.
	SourceDigestFile string
	// AppDir is a source checkout to compute the digest from when no digest file is shipped (development).
	AppDir string

	// Warnings lists settings that are set but no longer have any effect.
	Warnings []string
}

// Retired settings of the Bun server; reported once at startup in github artifact mode.
var retired = map[string]string{
	"MOENOTES_SPLIT_LOCALES":     "the server no longer splits locale batches",
	"MOENOTES_SYNC_WAIT_SECONDS": "builds always wait for the asset export to catch up with MasterData",
	"MOENOTES_VERSION_URL":       "the server reads the public release manifest (or MOENOTES_ASSET_INTERNAL)",
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

func isZeaburEnvironment() bool {
	return env("ZEABUR_SERVICE_ID") != "" ||
		env("ZEABUR_PROJECT_ID") != "" ||
		env("ZEABUR_ENVIRONMENT_ID") != "" ||
		env("ZEABUR_GIT_COMMIT_SHA") != ""
}

func resolveSSRDataDir(rawDataDir string, explicit bool) string {
	if explicit {
		return rawDataDir
	}
	if os.MkdirAll(filepath.Join(rawDataDir, "html_cache"), 0o755) == nil {
		return rawDataDir
	}
	if os.MkdirAll("/app/data/html_cache", 0o755) == nil {
		return "/app/data"
	}
	fallback := filepath.Join(os.TempDir(), "moenotes-data")
	_ = os.MkdirAll(filepath.Join(fallback, "html_cache"), 0o755)
	return fallback
}

// Load reads the configuration from the process environment.
func Load() (*Config, error) {
	var errs []error
	check := func(err error) {
		if err != nil {
			errs = append(errs, err)
		}
	}
	rawDataDir := env("MOENOTES_DATA_DIR")
	explicitDataDir := rawDataDir != "" && rawDataDir != "/data"
	if rawDataDir == "" {
		rawDataDir = "/data"
	}
	dataDir, err := filepath.Abs(rawDataDir)
	check(err)

	rawMode := strings.ToLower(env("MOENOTES_BUILD_MODE"))
	frontendProxy, proxyErr := origin("FRONTEND_PROXY_URL")
	check(proxyErr)

	// One-click Zeabur k3s `docker build` deployments automatically start in semi-SSR mode without needing manual env vars,
	// while bare non-Zeabur containers keep legacy "github" default unless MOENOTES_BUILD_MODE=ssr or FRONTEND_PROXY_URL is set.
	buildMode := "github"
	if rawMode == "ssr" || (rawMode == "" && (frontendProxy != "" || isZeaburEnvironment())) {
		buildMode = "ssr"
	} else if rawMode != "" && rawMode != "github" {
		errs = append(errs, fmt.Errorf("MOENOTES_BUILD_MODE must be \"ssr\" or \"github\", got %q", rawMode))
	}

	if buildMode == "ssr" {
		dataDir = resolveSSRDataDir(dataDir, explicitDataDir)
	}

	port, portErr := positive("PORT", 80)
	check(portErr)
	if portErr == nil && (port != math.Trunc(port) || port > 65535) {
		check(fmt.Errorf("PORT must be a TCP port, got %v", port))
	}
	goPort := int(port)

	nextjsDir := env("MOENOTES_NEXTJS_DIR")
	if nextjsDir == "" {
		nextjsDir = "/app/nextjs"
	}
	nextjsPort := env("NEXTJS_PORT")
	if nextjsPort == "" {
		if goPort == 3000 {
			nextjsPort = "3001"
		} else {
			nextjsPort = "3000"
		}
	}
	managedNext := false
	if buildMode == "ssr" && frontendProxy == "" {
		frontendProxy = "http://127.0.0.1:" + nextjsPort
		managedNext = true
	}

	htmlCacheDir := env("HTML_CACHE_DIR")
	if htmlCacheDir == "" {
		htmlCacheDir = filepath.Join(dataDir, "html_cache")
	}
	nextBuildID := env("NEXT_BUILD_ID")
	if nextBuildID == "" {
		if rawID, readErr := os.ReadFile(filepath.Join(nextjsDir, ".next", "BUILD_ID")); readErr == nil {
			nextBuildID = strings.TrimSpace(string(rawID))
		}
	}
	nextMaxMem := env("MOENOTES_NEXT_MAX_OLD_SPACE_MB")
	if nextMaxMem == "" {
		nextMaxMem = "512"
	}
	warmup := env("MOENOTES_SSR_WARMUP") != "0" && env("MOENOTES_WARMUP") != "0"

	c := &Config{
		Host:                 env("HOST"),
		BuildMode:            buildMode,
		FrontendProxyURL:     frontendProxy,
		FrontendProxyManaged: managedNext,
		NextjsStandaloneDir:  nextjsDir,
		NextjsPort:           nextjsPort,
		NextMaxOldSpaceMB:    nextMaxMem,
		NextBuildID:          nextBuildID,
		HTMLCacheDir:         htmlCacheDir,
		StaticArchiveDir:     filepath.Join(dataDir, "static_archive"),
		WarmupEnabled:        warmup,
		DataDir:              dataDir,
		BuildsDir:            filepath.Join(dataDir, "builds"),
		LogsDir:              filepath.Join(dataDir, "logs"),
		StatePath:            filepath.Join(dataDir, "state.json"),
		PendingPath:          filepath.Join(dataDir, "github-build.json"),
		GithubToken:          env("MOENOTES_GITHUB_TOKEN"),
		GithubRepo:           env("MOENOTES_GITHUB_REPO"),
		GithubRef:            env("MOENOTES_GITHUB_REF"),
		GithubCommit:         env("MOENOTES_REVISION"),
		GithubWorkflow:       "build-site.yml",
		KeepLogs:             10,
		SourceDigestFile:     env("MOENOTES_SOURCE_DIGEST_FILE"),
		AppDir:               env("MOENOTES_APP_DIR"),
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
	c.Port = goPort
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

	for _, name := range []string{"MOENOTES_SPLIT_LOCALES", "MOENOTES_SYNC_WAIT_SECONDS", "MOENOTES_VERSION_URL"} {
		if env(name) != "" {
			c.Warnings = append(c.Warnings, fmt.Sprintf("%s is ignored: %s", name, retired[name]))
		}
	}
	return c, errors.Join(errs...)
}
