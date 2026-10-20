package app

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/StarMoe-org/moenotes/server/internal/config"
	"github.com/StarMoe-org/moenotes/server/internal/siteconfig"
	"github.com/StarMoe-org/moenotes/server/internal/web"
)

// TestRoomCheckRoutePrecedesAPIRoute keeps the room-check relay reachable: its paths are under /api/ too, so the
// route switch has to match them first.
func TestRoomCheckRoutePrecedesAPIRoute(t *testing.T) {
	roomCheck := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Relayed", r.URL.Path+"?"+r.URL.RawQuery)
		_, _ = w.Write([]byte("room-check"))
	}))
	defer roomCheck.Close()
	account := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"user":null}`))
	}))
	defer account.Close()

	cfg := testConfig(t)
	cfg.APIOrigin = account.URL
	cfg.RoomCheckOrigin = roomCheck.URL
	handler := (&Server{cfg: cfg, site: siteconfig.Current(), store: &Store{Roots: &web.RootSource{}}}).routes()

	get := func(path string) *httptest.ResponseRecorder {
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "http://site"+path, nil))
		return recorder
	}
	relayed := get("/api/room-check/v1/rooms/1234567?region=tw")
	if relayed.Code != http.StatusOK || relayed.Body.String() != "room-check" {
		t.Fatalf("room-check should be relayed, got %d %q", relayed.Code, relayed.Body.String())
	}
	if got := relayed.Header().Get("X-Relayed"); got != "/v1/rooms/1234567?region=tw" {
		t.Fatalf("rewritten path: %q", got)
	}
	// The account API keeps receiving the rest of /api/*.
	me := get("/api/me")
	if me.Code != http.StatusOK || !strings.Contains(me.Body.String(), `"user":null`) {
		t.Fatalf("/api/me: %d %q", me.Code, me.Body.String())
	}
	// Without an origin the route is disabled, and it does not fall through to the account API.
	disabled := (&Server{cfg: func() *config.Config { c := testConfig(t); c.APIOrigin = account.URL; return c }(), site: siteconfig.Current(), store: &Store{Roots: &web.RootSource{}}}).routes()
	recorder := httptest.NewRecorder()
	disabled.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "http://site/api/room-check/v1/rooms/1234567", nil))
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("unset room-check origin should answer 404, got %d", recorder.Code)
	}
	invalid := func() *config.Config { c := testConfig(t); c.RoomCheckInvalid = true; return c }()
	handler = (&Server{cfg: invalid, site: siteconfig.Current(), store: &Store{Roots: &web.RootSource{}}}).routes()
	recorder = httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "http://site/api/room-check/v1/rooms/1234567", nil))
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("invalid room-check origin should answer 404, got %d", recorder.Code)
	}
}
