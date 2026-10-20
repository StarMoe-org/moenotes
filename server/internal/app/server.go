package app

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/StarMoe-org/moenotes/server/internal/artifact"
	"github.com/StarMoe-org/moenotes/server/internal/config"
	"github.com/StarMoe-org/moenotes/server/internal/github"
	"github.com/StarMoe-org/moenotes/server/internal/logx"
	"github.com/StarMoe-org/moenotes/server/internal/siteconfig"
	"github.com/StarMoe-org/moenotes/server/internal/upstream"
	"github.com/StarMoe-org/moenotes/server/internal/web"
)

const (
	retryBase = 10 * time.Minute
	retryMax  = 3 * time.Hour

	// defaultRoomCheckOrigin is the site's room-check service, used when
	// MOENOTES_ROOM_CHECK_INTERNAL is unset.
	defaultRoomCheckOrigin = "https://room.bdon.moe"
)

type failure struct {
	Key      string `json:"key"`
	Attempts int    `json:"attempts"`
	At       string `json:"at"`
	RetryAt  string `json:"retryAt"`
	retry    time.Time
}

type waiting struct {
	key    string
	since  time.Time
	reason string
}

type check struct {
	At string `json:"at"`
	OK bool   `json:"ok"`
}

// Server runs the HTTP server and the build scheduler.
type Server struct {
	cfg      *config.Config
	site     *siteconfig.Site
	store    *Store
	fetcher  *upstream.Fetcher
	github   *github.Client
	revision string
	handler  http.Handler

	mu        sync.Mutex
	building  *struct{ Data, StartedAt string }
	failure   *failure
	waiting   *waiting
	lastCheck *check
}

// New wires a server from its configuration; life bounds every background task.
func New(life context.Context, cfg *config.Config, site *siteconfig.Site) *Server {
	rewrites := map[string]string{}
	if cfg.AssetInternal != "" {
		rewrites[site.AssetAPI()] = cfg.AssetInternal
	}
	if cfg.MasterdataInternal != "" {
		rewrites[site.MasterdataOrigin()] = cfg.MasterdataInternal
	}
	s := &Server{
		cfg:     cfg,
		site:    site,
		store:   NewStore(life, cfg, site),
		fetcher: &upstream.Fetcher{Client: &http.Client{}, Rewrites: rewrites},
		github: github.New(github.Options{
			Repo: cfg.GithubRepo, Ref: cfg.GithubRef, Commit: cfg.GithubCommit, Token: cfg.GithubToken,
			Workflow: cfg.GithubWorkflow, PendingPath: cfg.PendingPath, Poll: cfg.GithubPoll, Environ: os.Environ(),
		}),
	}
	s.handler = s.routes()
	return s
}

// Store exposes the build store (tests, self-check).
func (s *Server) Store() *Store { return s.store }

// Handler returns the HTTP handler.
func (s *Server) Handler() http.Handler { return s.handler }

func (s *Server) routes() http.Handler {
	static := &web.Static{Roots: s.store.Roots, Site: s.site}
	api := &web.APIProxy{Origin: s.cfg.APIOrigin, Client: &http.Client{}}
	roomCheckOrigin := s.cfg.RoomCheckOrigin
	if roomCheckOrigin == "" && !s.cfg.RoomCheckInvalid {
		roomCheckOrigin = defaultRoomCheckOrigin
	}
	roomCheck := &web.RoomCheckProxy{Origin: roomCheckOrigin, Key: s.cfg.RoomCheckKey, APIOrigin: s.cfg.APIOrigin, Client: &http.Client{}}
	players := &web.PlayerPages{Roots: s.store.Roots, Site: s.site, APIOrigin: s.cfg.APIOrigin, Client: &http.Client{}, Fallback: static}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if recovered := recover(); recovered != nil {
				if recovered == http.ErrAbortHandler {
					panic(recovered)
				}
				logx.Printf("request failed: %v", recovered)
				http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			}
		}()
		switch path := r.URL.Path; {
		case path == "/healthz":
			_, _ = w.Write([]byte("ok\n"))
		case path == "/readyz":
			if s.store.Current() == nil {
				w.WriteHeader(http.StatusServiceUnavailable)
				_, _ = w.Write([]byte("no build yet\n"))
				return
			}
			_, _ = w.Write([]byte("ready\n"))
		case path == "/_moenotes/status":
			w.Header().Set("Cache-Control", "no-store")
			writeJSON(w, s.status())
		case web.IsRoomCheckPath(path):
			// Room Check also works before the first build, and its paths are under /api/, so they are matched first.
			roomCheck.ServeHTTP(w, r)
		case web.IsAPIPath(path):
			// The account API works before the first build too: it does not depend on the site output.
			api.ServeHTTP(w, r)
		default:
			if _, ok := s.site.PlayerShellPath(path); ok {
				players.ServeHTTP(w, r)
				return
			}
			static.ServeHTTP(w, r)
		}
	})
}

func (s *Server) status() map[string]any {
	current := s.store.Current()
	progress, compressing := s.store.Snapshot()
	s.mu.Lock()
	defer s.mu.Unlock()
	var stage any
	var locales any
	pendingRest := false
	if current != nil {
		stage = current.Stage
		if current.Stage == "" {
			stage = "full"
		}
		locales = current.LocalesRendered
		pendingRest = current.PendingRest
	}
	result := map[string]any{
		"ready":           current != nil,
		"revision":        s.revision,
		"current":         current,
		"stage":           stage,
		"localesRendered": locales,
		"pendingRest":     pendingRest,
		"buildMode":       "github",
		"splitLocales":    false,
		"building":        nil,
		"compressing":     compressing,
		"waiting":         nil,
		"failure":         s.failure,
		"lastCheck":       s.lastCheck,
	}
	if s.building != nil {
		building := map[string]any{"data": s.building.Data, "startedAt": s.building.StartedAt}
		if progress != nil {
			building["id"], building["step"], building["pages"] = progress.ID, progress.Step, progress.Pages
		}
		result["building"] = building
	}
	if s.waiting != nil {
		result["waiting"] = map[string]any{"reason": s.waiting.reason, "since": s.waiting.since.UTC().Format(time.RFC3339Nano)}
	}
	return result
}

// Run listens and schedules builds until ctx is cancelled.
func (s *Server) Run(ctx context.Context) error {
	for _, warning := range s.cfg.Warnings {
		logx.Printf("%s", warning)
	}
	if err := s.store.Load(); err != nil {
		return err
	}
	// Listen before anything slow: the previous build is served while cleanup and the first check run.
	listener, err := net.Listen("tcp", net.JoinHostPort(s.cfg.Host, strconv.Itoa(s.cfg.Port)))
	if err != nil {
		return err
	}
	server := &http.Server{Handler: s.handler, ReadHeaderTimeout: 15 * time.Second, IdleTimeout: 2 * time.Minute}
	served := make(chan error, 1)
	go func() { served <- server.Serve(listener) }()
	current := s.store.Current()
	if current != nil {
		logx.Printf("listening on %s; serving %s (%s)", listener.Addr(), current.ID, current.Data)
	} else {
		logx.Printf("listening on %s; no build yet", listener.Addr())
	}
	if s.cfg.APIInvalid {
		logx.Printf("MOENOTES_API_INTERNAL is not an absolute http(s) URL (e.g. https://api.star.moe); /api/* is disabled")
	} else if s.cfg.APIOrigin != "" {
		logx.Printf("forwarding /api/* to %s", s.cfg.APIOrigin)
	}
	if s.cfg.RoomCheckInvalid {
		logx.Printf("MOENOTES_ROOM_CHECK_INTERNAL is not an absolute http(s) URL; /api/room-check/* is disabled")
	} else {
		origin := s.cfg.RoomCheckOrigin
		if origin == "" {
			origin = defaultRoomCheckOrigin
		}
		key := "no shared key"
		if s.cfg.RoomCheckKey != "" {
			key = "shared key set"
		}
		logx.Printf("forwarding /api/room-check/* to %s (%s)", origin, key)
	}

	scheduled := make(chan struct{})
	go func() {
		defer close(scheduled)
		s.schedule(ctx)
	}()
	select {
	case err := <-served:
		return err
	case <-ctx.Done():
	}
	logx.Printf("shutting down")
	shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	err = server.Shutdown(shutdown)
	<-scheduled
	if errors.Is(err, http.ErrServerClosed) {
		err = nil
	}
	return err
}

func (s *Server) schedule(ctx context.Context) {
	if err := s.store.CleanUp(); err != nil {
		logx.Printf("cleanup failed: %v", err)
	}
	digest, err := LoadSourceDigest(s.cfg)
	if err != nil {
		logx.Printf("source digest unavailable, builds are disabled: %v", err)
		<-ctx.Done()
		return
	}
	s.mu.Lock()
	s.revision = upstream.SourceRevision(digest, os.Environ())
	s.mu.Unlock()
	logx.Printf("source revision %s, commit %s; watching %s every %s", s.revision, shortCommit(s.cfg.GithubCommit), s.site.AssetVersionURL(), s.cfg.Poll)
	for {
		if err := s.tick(ctx); err != nil && ctx.Err() == nil {
			s.mu.Lock()
			s.lastCheck = &check{At: now(), OK: false}
			s.mu.Unlock()
			logx.Printf("version check failed: %v", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(s.cfg.Poll):
		}
	}
}

func shortCommit(commit string) string {
	if len(commit) >= 12 {
		return commit[:12]
	}
	if commit == "" {
		return "(unset)"
	}
	return commit
}

func now() string { return time.Now().UTC().Format(time.RFC3339Nano) }

func (s *Server) tick(ctx context.Context) error {
	var manifest upstream.AssetManifest
	if err := s.fetcher.JSON(ctx, s.site.AssetVersionURL(), &manifest); err != nil {
		return err
	}
	s.mu.Lock()
	s.lastCheck = &check{At: now(), OK: true}
	revision := s.revision
	s.mu.Unlock()
	data, err := upstream.Describe(&manifest)
	if err != nil {
		return err
	}
	key := upstream.BuildKey(revision, data.Fingerprint, s.cfg.GithubCommit)
	s.mu.Lock()
	backoff := s.failure != nil && s.failure.Key == key && time.Now().Before(s.failure.retry)
	s.mu.Unlock()
	if backoff {
		return nil
	}
	if current := s.store.Current(); current != nil && current.Key == key && !current.PendingRest {
		s.mu.Lock()
		s.waiting = nil
		s.mu.Unlock()
		return nil
	}
	lag, err := upstream.ExportLag(ctx, &manifest, s.fetcher, s.site.MasterdataVersionURL())
	if err != nil {
		return err
	}
	if lag != "" {
		s.mu.Lock()
		since := time.Now()
		if s.waiting != nil && s.waiting.key == key {
			since = s.waiting.since
		}
		if s.waiting == nil || s.waiting.reason != lag {
			logx.Printf("waiting to build %s: %s", data.Label, lag)
		}
		s.waiting = &waiting{key: key, since: since, reason: lag}
		s.mu.Unlock()
		return nil
	}
	s.mu.Lock()
	s.waiting = nil
	s.mu.Unlock()
	s.runBuild(ctx, artifact.Expected{Key: key, Revision: revision, Commit: s.cfg.GithubCommit, Data: data})
	return nil
}

func (s *Server) runBuild(ctx context.Context, expected artifact.Expected) {
	s.mu.Lock()
	s.building = &struct{ Data, StartedAt string }{Data: expected.Data.Label, StartedAt: now()}
	s.mu.Unlock()
	defer func() {
		s.mu.Lock()
		s.building = nil
		s.mu.Unlock()
	}()
	logx.Printf("building %s (key %s)", expected.Data.Label, expected.Key)
	record, err := s.store.Build(ctx, s.github, expected)
	if err == nil {
		// Do not install a build for superseded data after a long queue, build and download.
		var latest upstream.AssetManifest
		if err = s.fetcher.JSON(ctx, s.site.AssetVersionURL(), &latest); err == nil {
			var data upstream.DataVersion
			if data, err = upstream.Describe(&latest); err == nil {
				lag, lagErr := upstream.ExportLag(ctx, &latest, s.fetcher, s.site.MasterdataVersionURL())
				switch {
				case lagErr != nil:
					err = lagErr
				case data.Fingerprint != expected.Data.Fingerprint || lag != "":
					err = errors.New("release data changed while waiting for CI; keeping the live build until the next version is ready")
				}
			}
		}
		if err != nil {
			_ = os.RemoveAll(s.store.buildDir(record.ID))
		}
	}
	if err == nil && ctx.Err() == nil {
		err = s.store.Activate(record)
	}
	if ctx.Err() != nil {
		return
	}
	if err != nil {
		s.mu.Lock()
		attempts := 1
		if s.failure != nil && s.failure.Key == expected.Key {
			attempts = s.failure.Attempts + 1
		}
		delay := retryBase << min(attempts-1, 10)
		if delay > retryMax || delay <= 0 {
			delay = retryMax
		}
		retry := time.Now().Add(delay)
		s.failure = &failure{Key: expected.Key, Attempts: attempts, At: now(), RetryAt: retry.UTC().Format(time.RFC3339Nano), retry: retry}
		s.mu.Unlock()
		serving := "nothing to serve yet"
		if current := s.store.Current(); current != nil {
			serving = "still serving " + current.ID
		}
		logx.Printf("build failed (attempt %d, next in %s, %s): %v", attempts, logx.Duration(delay), serving, err)
		return
	}
	s.mu.Lock()
	s.failure = nil
	s.mu.Unlock()
	logx.Printf("build %s is live after %s (%d pages); compressing it in the background", record.ID, logx.Duration(time.Duration(record.DurationMs)*time.Millisecond), record.Pages)
	if err := s.store.Prune(); err != nil {
		logx.Printf("prune failed: %v", err)
	}
}

// LoadSourceDigest reads the image's source digest file, or computes it from a source checkout (development).
func LoadSourceDigest(cfg *config.Config) (string, error) {
	if cfg.SourceDigestFile != "" {
		raw, err := os.ReadFile(cfg.SourceDigestFile)
		if err != nil {
			return "", err
		}
		digest := string(trimSpace(raw))
		if len(digest) != 64 {
			return "", fmt.Errorf("%s does not hold a SHA-256 digest", cfg.SourceDigestFile)
		}
		return digest, nil
	}
	if cfg.AppDir != "" {
		return upstream.SourceDigest(cfg.AppDir)
	}
	return "", errors.New("set MOENOTES_SOURCE_DIGEST_FILE (the image does) or MOENOTES_APP_DIR to a source checkout")
}

func trimSpace(raw []byte) []byte {
	start, end := 0, len(raw)
	for start < end && (raw[start] == ' ' || raw[start] == '\n' || raw[start] == '\r' || raw[start] == '\t') {
		start++
	}
	for end > start && (raw[end-1] == ' ' || raw[end-1] == '\n' || raw[end-1] == '\r' || raw[end-1] == '\t') {
		end--
	}
	return raw[start:end]
}
