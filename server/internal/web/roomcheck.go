package web

import (
	"context"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"

	"github.com/StarMoe-org/moenotes/server/internal/logx"
)

// Room Check calls the room-check service same-origin, through this proxy. Reads are anonymous; the actions that act
// on the visitor's behalf (creating a room, removing the observer) need the site session instead, and the service
// receives that identity in a header only this proxy sets.
const (
	roomCheckPrefix = "/api/room-check"

	// RoomCheckUserHeader carries the signed-in identity to the room-check service.
	RoomCheckUserHeader = "X-Room-Check-User"
	// RoomCheckKeyHeader carries the shared key when MOENOTES_ROOM_CHECK_KEY is set.
	RoomCheckKeyHeader = "X-Room-Check-Key"

	// roomCheckSessionTimeout bounds the identity lookup. The relay itself has no overall deadline: an event stream
	// stays open while the page watches the room.
	roomCheckSessionTimeout = 5 * time.Second
)

// IsRoomCheckPath reports whether a path belongs to the Room Check API.
func IsRoomCheckPath(pathname string) bool {
	return pathname == roomCheckPrefix || strings.HasPrefix(pathname, roomCheckPrefix+"/")
}

// RoomCheckProxy relays /api/room-check/* to the internal room-check service so the page calls it same-origin, with
// the site's session cookie staying first-party. Every request is forwarded with the visitor's identity in
// X-Room-Check-User (absent when anonymous); responses are passed through untouched, event streams immediately.
type RoomCheckProxy struct {
	// Origin is the room-check service's absolute http(s) base URL; empty disables the route.
	Origin string
	// Key is the optional shared key sent as X-Room-Check-Key.
	Key string
	// APIOrigin is the account API used for the session lookup (GET /api/me). Empty leaves every request anonymous,
	// so the account-bound actions answer 401.
	APIOrigin string
	// Client is used for the session lookup and supplies the relay's transport; nil uses the defaults.
	Client *http.Client
}

func (p *RoomCheckProxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	base, ok := roomCheckBase(p.Origin)
	if !ok {
		w.Header().Set("Cache-Control", "no-store")
		http.Error(w, "Not Found", http.StatusNotFound)
		return
	}
	// The prefix is stripped here; the rest of the path is kept as it arrived, escaped form included.
	path := strings.TrimPrefix(r.URL.Path, roomCheckPrefix)
	escaped := strings.TrimPrefix(r.URL.EscapedPath(), roomCheckPrefix)
	if path == "" {
		path, escaped = "/", "/"
	}

	user := ""
	// Several Cookie headers mean one cookie header, values joined.
	if cookie := strings.Join(r.Header.Values("Cookie"), "; "); cookie != "" {
		user = p.identify(r.Context(), cookie)
	}
	if user == "" && roomCheckNeedsLogin(r.Method, path) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Type", "application/json;charset=utf-8")
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":"login_required"}`))
		return
	}

	basePath := strings.TrimRight(base.Path, "/")
	baseEscaped := strings.TrimRight(base.EscapedPath(), "/")
	relay := &httputil.ReverseProxy{
		// Flush on every write, so server-sent events reach the page as they happen instead of sitting in a buffer.
		FlushInterval: -1,
		Transport:     p.transport(),
		ErrorHandler:  p.fail,
		ModifyResponse: func(response *http.Response) error {
			// An error answer is the room's state right now, never something to keep.
			if response.StatusCode >= http.StatusBadRequest {
				response.Header.Set("Cache-Control", "no-store")
			}
			return nil
		},
		Rewrite: func(pr *httputil.ProxyRequest) {
			pr.Out.URL.Scheme = base.Scheme
			pr.Out.URL.Host = base.Host
			pr.Out.URL.Path = basePath + path
			pr.Out.URL.RawPath = baseEscaped + escaped
			pr.Out.URL.RawQuery = r.URL.RawQuery
			// The service is reached by the configured address, not by the public site's name.
			pr.Out.Host = base.Host
			// Only this proxy speaks for the visitor: drop whatever the client claimed. The cookie stays here too,
			// the service needs no cookie and the identity header is the whole contract.
			pr.Out.Header.Del(RoomCheckUserHeader)
			pr.Out.Header.Del(RoomCheckKeyHeader)
			pr.Out.Header.Del("Cookie")
			// The service limits by visitor address. Only this relay may state it; a client-supplied value is dropped.
			pr.Out.Header.Del("X-Forwarded-For")
			if ip := visitorIP(r); ip != "" {
				pr.Out.Header.Set("X-Forwarded-For", ip)
			}
			// Ask for bytes as they are: an event stream must reach the page the way it was written, not decoded on
			// the way. Whole responses are small JSON.
			pr.Out.Header.Set("Accept-Encoding", "identity")
			if user != "" {
				pr.Out.Header.Set(RoomCheckUserHeader, user)
			}
			if p.Key != "" {
				pr.Out.Header.Set(RoomCheckKeyHeader, p.Key)
			}
		},
	}
	relay.ServeHTTP(w, r)
}

// visitorIP is the browser address relayed to the service for its per-address limits. At the site edge Cloudflare
// sets CF-Connecting-IP; otherwise the socket peer is the visitor.
func visitorIP(r *http.Request) string {
	if ip := net.ParseIP(strings.TrimSpace(r.Header.Get("CF-Connecting-IP"))); ip != nil {
		return ip.String()
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// roomCheckNeedsLogin reports whether a request acts on the signed-in visitor's behalf: creating a room, and the
// observer's leave endpoint (with its kick alias). Everything else (reads, watches, events, pings) works anonymously.
func roomCheckNeedsLogin(method, path string) bool {
	if method != http.MethodPost {
		return false
	}
	rest := strings.TrimPrefix(path, "/")
	if rest == "v1/rooms/create" {
		return true
	}
	if !strings.HasPrefix(rest, "v1/rooms/") {
		return false
	}
	// The observer's leave endpoint, under either spelling of its last segment (/probe/leave, /probe/kick or /kick).
	return strings.HasSuffix(rest, "/probe/leave") || strings.HasSuffix(rest, "/probe/kick") || strings.HasSuffix(rest, "/kick")
}

// identify resolves the site session to a stable identity: GET /api/me answers {"user":{"name","username","picture"}
// |null} to the same cookie the site's own account button uses. The username is the stable name; the display name is
// the fallback. A missing user, a non-200 answer or an empty identity all mean logged out.
func (p *RoomCheckProxy) identify(ctx context.Context, cookie string) string {
	if p.APIOrigin == "" {
		return ""
	}
	ctx, cancel := context.WithTimeout(ctx, roomCheckSessionTimeout)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, p.APIOrigin+"/api/me", nil)
	if err != nil {
		return ""
	}
	request.Header.Set("Cookie", cookie)
	request.Header.Set("Accept", "application/json")
	client := p.Client
	if client == nil {
		client = http.DefaultClient
	}
	response, err := client.Do(request)
	if err != nil {
		logx.Printf("room check: session lookup failed: %v", err)
		return ""
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return ""
	}
	var body struct {
		User *struct {
			Name     any `json:"name"`
			Username any `json:"username"`
		} `json:"user"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&body); err != nil || body.User == nil {
		return ""
	}
	if username := headerValue(asString(body.User.Username)); username != "" {
		return username
	}
	return headerValue(asString(body.User.Name))
}

// transport relays through the configured client's transport; without one, net/http's default, which bounds dialing
// and TLS but sets no overall deadline.
func (p *RoomCheckProxy) transport() http.RoundTripper {
	if p.Client != nil && p.Client.Transport != nil {
		return p.Client.Transport
	}
	return http.DefaultTransport
}

func (p *RoomCheckProxy) fail(w http.ResponseWriter, r *http.Request, err error) {
	// The address stays in the log: it can name internal hosts. The client only learns that the relay failed.
	logx.Printf("room check proxy: %s %s failed: %v", r.Method, r.URL.Path, err)
	w.Header().Set("Cache-Control", "no-store")
	http.Error(w, "Bad Gateway", http.StatusBadGateway)
}

// roomCheckBase validates the configured base URL; a bad or missing value disables the route rather than relaying
// anywhere.
func roomCheckBase(raw string) (*url.URL, bool) {
	if raw == "" {
		return nil, false
	}
	base, err := url.Parse(raw)
	if err != nil || (base.Scheme != "http" && base.Scheme != "https") || base.Host == "" {
		return nil, false
	}
	return base, true
}

// asString reads one field of the identity; a missing or non-string value is empty.
func asString(value any) string {
	parsed, _ := value.(string)
	return parsed
}

// headerValue makes an identity safe as a header value: trimmed, and without control characters.
func headerValue(value string) string {
	trimmed := strings.TrimSpace(value)
	if strings.IndexFunc(trimmed, func(r rune) bool { return r < 0x20 || r == 0x7f }) < 0 {
		return trimmed
	}
	var safe strings.Builder
	for _, r := range trimmed {
		if r < 0x20 || r == 0x7f {
			continue
		}
		safe.WriteRune(r)
	}
	return strings.TrimSpace(safe.String())
}
