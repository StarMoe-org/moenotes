package web

import (
	"bufio"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

// roomCheckCall is one request the fake room-check service received.
type roomCheckCall struct {
	Method string
	Path   string
	URI    string
	Query  string
	Header http.Header
	Body   string
}

// fakeRoomCheck is a stand-in for the internal room-check service. answered records every request, so a test can
// assert that a refused request never reached it.
type fakeRoomCheck struct {
	*httptest.Server
	mu       sync.Mutex
	answered []roomCheckCall
}

func newFakeRoomCheck(t *testing.T) *fakeRoomCheck {
	t.Helper()
	fake := &fakeRoomCheck{}
	fake.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		fake.mu.Lock()
		fake.answered = append(fake.answered, roomCheckCall{Method: r.Method, Path: r.URL.Path, URI: r.URL.RequestURI(), Query: r.URL.RawQuery, Header: r.Header.Clone(), Body: string(body)})
		fake.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	t.Cleanup(fake.Close)
	return fake
}

func (f *fakeRoomCheck) calls() []roomCheckCall {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]roomCheckCall(nil), f.answered...)
}

// fakeAccount answers /api/me the way starmoe-api does: the cookie names the session, and a session the test did not
// register is signed out.
type fakeAccount struct {
	*httptest.Server
	users map[string]string // cookie value -> identity fields as JSON
}

func newFakeAccount(t *testing.T) *fakeAccount {
	t.Helper()
	account := &fakeAccount{users: map[string]string{}}
	account.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/me" {
			http.NotFound(w, r)
			return
		}
		session := ""
		if cookie, err := r.Cookie("session"); err == nil {
			session = cookie.Value
		}
		w.Header().Set("Content-Type", "application/json")
		user, ok := account.users[session]
		if session == "" || !ok {
			_, _ = w.Write([]byte(`{"user":null}`))
			return
		}
		_, _ = w.Write([]byte(`{"user":` + user + `}`))
	}))
	t.Cleanup(account.Close)
	return account
}

func (a *fakeAccount) signIn(session, userJSON string) { a.users[session] = userJSON }

func roomCheckRequest(method, path, body string, headers map[string]string) *http.Request {
	var reader io.Reader
	if body != "" {
		reader = strings.NewReader(body)
	}
	request := httptest.NewRequest(method, "http://site"+path, reader)
	for name, value := range headers {
		request.Header.Set(name, value)
	}
	return request
}

func TestIsRoomCheckPath(t *testing.T) {
	for path, want := range map[string]bool{
		"/api/room-check":                 true,
		"/api/room-check/":                true,
		"/api/room-check/v1/rooms/123456": true,
		"/api/room-checkx":                false,
		"/api/me":                         false,
		"/api":                            false,
		"":                                false,
	} {
		if got := IsRoomCheckPath(path); got != want {
			t.Errorf("%q: %v", path, got)
		}
	}
}

func TestRoomCheckAnonymousReadForwards(t *testing.T) {
	fake := newFakeRoomCheck(t)
	proxy := &RoomCheckProxy{Origin: fake.URL}
	recorder := httptest.NewRecorder()
	proxy.ServeHTTP(recorder, roomCheckRequest(http.MethodGet, "/api/room-check/v1/rooms/1234567?region=tw&x=1", "", map[string]string{
		"Accept":            "application/json",
		"X-Room-Check-User": "someone-else",
	}))
	if recorder.Code != http.StatusOK || recorder.Body.String() != `{"ok":true}` {
		t.Fatalf("got %d %q", recorder.Code, recorder.Body.String())
	}
	calls := fake.calls()
	if len(calls) != 1 {
		t.Fatalf("the service should have been called once, got %d", len(calls))
	}
	call := calls[0]
	if call.Method != http.MethodGet || call.Path != "/v1/rooms/1234567" || call.Query != "region=tw&x=1" {
		t.Fatalf("rewritten request: %s %s?%s", call.Method, call.Path, call.Query)
	}
	if got := call.Header.Get(RoomCheckUserHeader); got != "" {
		t.Fatalf("an anonymous read must not carry an identity, got %q", got)
	}
	if got := call.Header.Get("Accept"); got != "application/json" {
		t.Fatalf("other headers should be kept, got %q", got)
	}
	missing := httptest.NewRecorder()
	(&RoomCheckProxy{}).ServeHTTP(missing, roomCheckRequest(http.MethodGet, "/api/room-check/v1/rooms/1234567", "", nil))
	if missing.Code != http.StatusNotFound || missing.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("unset origin: %d %v", missing.Code, missing.Header())
	}
	invalid := httptest.NewRecorder()
	(&RoomCheckProxy{Origin: "room-check.svc:8080"}).ServeHTTP(invalid, roomCheckRequest(http.MethodGet, "/api/room-check/v1/rooms/1234567", "", nil))
	if invalid.Code != http.StatusNotFound {
		t.Fatalf("invalid origin: %d", invalid.Code)
	}
}

func TestRoomCheckCreateNeedsLogin(t *testing.T) {
	fake := newFakeRoomCheck(t)
	account := newFakeAccount(t)
	account.signIn("signed-in", `{"name":"Moe","username":"moe-user","picture":null}`)
	proxy := &RoomCheckProxy{Origin: fake.URL, APIOrigin: account.URL}

	for _, headers := range []map[string]string{
		nil,
		{"Cookie": "session=unknown"},
	} {
		recorder := httptest.NewRecorder()
		proxy.ServeHTTP(recorder, roomCheckRequest(http.MethodPost, "/api/room-check/v1/rooms/create", `{"region":"tw"}`, headers))
		if recorder.Code != http.StatusUnauthorized {
			t.Fatalf("anonymous create: %d", recorder.Code)
		}
		if body := strings.TrimSpace(recorder.Body.String()); body != `{"error":"login_required"}` {
			t.Fatalf("anonymous create body: %q", body)
		}
		if recorder.Header().Get("Cache-Control") != "no-store" {
			t.Fatal("a refusal must not be cached")
		}
	}
	if calls := fake.calls(); len(calls) != 0 {
		t.Fatalf("a refused create must not reach the service, got %d calls", len(calls))
	}
	// Anonymous reads keep working without a session.
	read := httptest.NewRecorder()
	proxy.ServeHTTP(read, roomCheckRequest(http.MethodGet, "/api/room-check/v1/rooms/1234567?region=tw", "", nil))
	if read.Code != http.StatusOK {
		t.Fatalf("anonymous read: %d", read.Code)
	}
}

func TestRoomCheckSignedInActions(t *testing.T) {
	fake := newFakeRoomCheck(t)
	account := newFakeAccount(t)
	account.signIn("signed-in", `{"name":"Moe","username":"moe-user","picture":null}`)
	proxy := &RoomCheckProxy{Origin: fake.URL, Key: "shared-key", APIOrigin: account.URL}

	requests := []struct{ method, path string }{
		{http.MethodPost, "/api/room-check/v1/rooms/create"},
		{http.MethodPost, "/api/room-check/v1/rooms/1234567/probe/leave"},
		{http.MethodPost, "/api/room-check/v1/rooms/1234567/probe/kick"},
	}
	for _, entry := range requests {
		recorder := httptest.NewRecorder()
		proxy.ServeHTTP(recorder, roomCheckRequest(entry.method, entry.path, `{}`, map[string]string{
			"Cookie":            "session=signed-in",
			"X-Room-Check-User": "spoofed",
			"X-Room-Check-Key":  "spoofed-key",
			"X-Forwarded-For":   "198.51.100.9",
			"CF-Connecting-IP":  "198.51.100.7",
		}))
		if recorder.Code != http.StatusOK {
			t.Fatalf("%s %s: %d %q", entry.method, entry.path, recorder.Code, recorder.Body.String())
		}
	}
	calls := fake.calls()
	if len(calls) != len(requests) {
		t.Fatalf("expected %d calls, got %d", len(requests), len(calls))
	}
	for i, call := range calls {
		if call.Path != strings.TrimPrefix(requests[i].path, "/api/room-check") {
			t.Errorf("%d: path %q", i, call.Path)
		}
		if got := call.Header.Get(RoomCheckUserHeader); got != "moe-user" {
			t.Errorf("%d: identity %q", i, got)
		}
		if got := call.Header.Get(RoomCheckKeyHeader); got != "shared-key" {
			t.Errorf("%d: key %q", i, got)
		}
		if got := call.Header.Get("Cookie"); got != "" {
			t.Errorf("%d: the cookie must not be forwarded, got %q", i, got)
		}
		if got := call.Header.Get("X-Forwarded-For"); got != "198.51.100.7" {
			t.Errorf("%d: visitor address %q", i, got)
		}
		if call.Body != "{}" {
			t.Errorf("%d: body %q", i, call.Body)
		}
	}
}

// TestRoomCheckVisitorAddressFallback: without CF-Connecting-IP the socket peer is relayed, and a client-sent
// X-Forwarded-For is dropped.
func TestRoomCheckVisitorAddressFallback(t *testing.T) {
	fake := newFakeRoomCheck(t)
	proxy := &RoomCheckProxy{Origin: fake.URL}
	proxy.ServeHTTP(httptest.NewRecorder(), roomCheckRequest(http.MethodGet, "/api/room-check/v1/rooms/1234567", "", map[string]string{
		"X-Forwarded-For": "198.51.100.9",
	}))
	calls := fake.calls()
	if len(calls) != 1 {
		t.Fatalf("calls %d", len(calls))
	}
	if got := calls[0].Header.Get("X-Forwarded-For"); got != "192.0.2.1" {
		t.Fatalf("visitor address %q", got)
	}
}

func TestRoomCheckIdentityFallbacks(t *testing.T) {
	fake := newFakeRoomCheck(t)
	account := newFakeAccount(t)
	account.signIn("named", `{"name":"Display Name","username":null,"picture":null}`)
	account.signIn("username", `{"name":"Other","username":"stable-name","picture":null}`)
	account.signIn("blank", `{"name":"  ","username":"","picture":null}`)
	proxy := &RoomCheckProxy{Origin: fake.URL, APIOrigin: account.URL}

	create := func(session string) *httptest.ResponseRecorder {
		recorder := httptest.NewRecorder()
		proxy.ServeHTTP(recorder, roomCheckRequest(http.MethodPost, "/api/room-check/v1/rooms/create", "{}", map[string]string{"Cookie": "session=" + session}))
		return recorder
	}
	if code := create("named").Code; code != http.StatusOK {
		t.Fatalf("a display name should identify the user: %d", code)
	}
	if code := create("username").Code; code != http.StatusOK {
		t.Fatalf("a username should identify the user: %d", code)
	}
	if code := create("blank").Code; code != http.StatusUnauthorized {
		t.Fatalf("an empty identity is logged out: %d", code)
	}
	calls := fake.calls()
	if len(calls) != 2 {
		t.Fatalf("expected two forwarded creates, got %d", len(calls))
	}
	if got := calls[0].Header.Get(RoomCheckUserHeader); got != "Display Name" {
		t.Errorf("display name fallback: %q", got)
	}
	if got := calls[1].Header.Get(RoomCheckUserHeader); got != "stable-name" {
		t.Errorf("username preferred: %q", got)
	}
	// Without an account API every request is anonymous, so an account-bound action is refused rather than relayed.
	noAPI := &RoomCheckProxy{Origin: fake.URL}
	recorder := httptest.NewRecorder()
	noAPI.ServeHTTP(recorder, roomCheckRequest(http.MethodPost, "/api/room-check/v1/rooms/create", "{}", map[string]string{"Cookie": "session=named"}))
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("no account API: %d", recorder.Code)
	}
}

func TestRoomCheckPassesErrorsThrough(t *testing.T) {
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Retry-After", "7")
		w.WriteHeader(http.StatusConflict)
		_, _ = w.Write([]byte(`{"error":"room_full"}`))
	}))
	defer fake.Close()
	recorder := httptest.NewRecorder()
	(&RoomCheckProxy{Origin: fake.URL}).ServeHTTP(recorder, roomCheckRequest(http.MethodGet, "/api/room-check/v1/rooms/1234567", "", nil))
	if recorder.Code != http.StatusConflict || recorder.Body.String() != `{"error":"room_full"}` || recorder.Header().Get("Retry-After") != "7" {
		t.Fatalf("got %d %q %v", recorder.Code, recorder.Body.String(), recorder.Header())
	}
	if recorder.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("an error answer must not be cached: %v", recorder.Header())
	}
}

func TestRoomCheckTransportErrorIs502(t *testing.T) {
	closed := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	closed.Close()
	recorder := httptest.NewRecorder()
	(&RoomCheckProxy{Origin: closed.URL, Client: &http.Client{Timeout: time.Second}}).ServeHTTP(recorder, roomCheckRequest(http.MethodGet, "/api/room-check/v1/rooms/1234567", "", nil))
	if recorder.Code != http.StatusBadGateway {
		t.Fatalf("unreachable service: %d", recorder.Code)
	}
	if recorder.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("an error must not be cached")
	}
	if strings.Contains(recorder.Body.String(), closed.URL) || strings.Contains(recorder.Body.String(), "127.0.0.1") {
		t.Fatalf("the internal address must stay out of the answer: %q", recorder.Body.String())
	}
}

// TestRoomCheckStreamsEvents proves the relay does not buffer: the fake writes one event and then waits, and the
// event still arrives on the client while the service is holding the stream open.
func TestRoomCheckStreamsEvents(t *testing.T) {
	release := make(chan struct{})
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/rooms/1234567/events" || r.URL.RawQuery != "region=tw&watch=w1" {
			http.Error(w, "unexpected "+r.URL.RequestURI(), http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, "event: snapshot\ndata: {\"n\":1}\n\n")
		w.(http.Flusher).Flush()
		<-release
	}))
	defer fake.Close()
	proxy := httptest.NewServer(&RoomCheckProxy{Origin: fake.URL})
	defer proxy.Close()

	response, err := proxy.Client().Get(proxy.URL + "/api/room-check/v1/rooms/1234567/events?region=tw&watch=w1")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK || !strings.HasPrefix(response.Header.Get("Content-Type"), "text/event-stream") {
		t.Fatalf("got %d %v", response.StatusCode, response.Header)
	}
	reader := bufio.NewReader(response.Body)
	first := make(chan string, 1)
	go func() {
		var lines []string
		for len(lines) < 3 {
			line, readErr := reader.ReadString('\n')
			if readErr != nil {
				first <- "error: " + readErr.Error()
				return
			}
			lines = append(lines, strings.TrimRight(line, "\r\n"))
		}
		first <- strings.Join(lines, "|")
	}()
	select {
	case got := <-first:
		if got != "event: snapshot|data: {\"n\":1}|" {
			t.Fatalf("first event: %q", got)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("the first event was buffered instead of streamed")
	}
	close(release)
	if _, err := io.Copy(io.Discard, response.Body); err != nil {
		t.Fatalf("stream should end cleanly: %v", err)
	}
}

func TestRoomCheckKeepsBasePathAndEscaping(t *testing.T) {
	fake := newFakeRoomCheck(t)
	proxy := &RoomCheckProxy{Origin: fake.URL + "/room-check/"}
	recorder := httptest.NewRecorder()
	proxy.ServeHTTP(recorder, roomCheckRequest(http.MethodGet, "/api/room-check/v1/rooms/a%2Fb?region=tw", "", nil))
	if recorder.Code != http.StatusOK {
		t.Fatalf("got %d", recorder.Code)
	}
	calls := fake.calls()
	if len(calls) != 1 {
		t.Fatalf("calls: %+v", calls)
	}
	// The rest of the path keeps its escaped form and the configured base path comes first.
	if calls[0].URI != "/room-check/v1/rooms/a%2Fb?region=tw" {
		t.Fatalf("relayed URI: %q", calls[0].URI)
	}
	if calls[0].Query != "region=tw" {
		t.Fatalf("query: %q", calls[0].Query)
	}
	// The bare prefix reaches the service's root, with no query at all.
	root := httptest.NewRecorder()
	proxy.ServeHTTP(root, roomCheckRequest(http.MethodGet, "/api/room-check", "", nil))
	if root.Code != http.StatusOK {
		t.Fatalf("bare prefix: %d", root.Code)
	}
	calls = fake.calls()
	if last := calls[len(calls)-1]; last.URI != "/room-check/" {
		t.Fatalf("bare prefix relayed URI: %q", last.URI)
	}
}

func TestRoomCheckNeedsLogin(t *testing.T) {
	cases := []struct {
		method, path string
		want         bool
	}{
		{http.MethodPost, "/v1/rooms/create", true},
		{http.MethodPost, "/v1/rooms/1234567/probe/leave", true},
		{http.MethodPost, "/v1/rooms/1234567/probe/kick", true},
		{http.MethodGet, "/v1/rooms/create", false},
		{http.MethodPost, "/v1/rooms/1234567", false},
		{http.MethodPost, "/v1/rooms/1234567/watch", false},
		{http.MethodPost, "/v1/rooms/1234567/watch/w1/ping", false},
		{http.MethodDelete, "/v1/rooms/1234567/watch/w1", false},
		{http.MethodGet, "/v1/rooms/1234567/events", false},
	}
	for _, entry := range cases {
		if got := roomCheckNeedsLogin(entry.method, entry.path); got != entry.want {
			t.Errorf("%s %s: %v", entry.method, entry.path, got)
		}
	}
}

func TestRoomCheckHeaderValue(t *testing.T) {
	for input, want := range map[string]string{
		"moe-user":         "moe-user",
		"  spaced  ":       "spaced",
		"a\r\nInjected: 1": "aInjected: 1",
		"":                 "",
	} {
		if got := headerValue(input); got != want {
			t.Errorf("%q: %q", input, got)
		}
	}
}
