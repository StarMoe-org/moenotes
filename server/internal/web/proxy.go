package web

import (
	"bytes"
	"context"
	"encoding/json"
	"html"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/net/html/atom"

	xhtml "golang.org/x/net/html"

	"github.com/StarMoe-org/moenotes/server/internal/logx"
	"github.com/StarMoe-org/moenotes/server/internal/siteconfig"
)

const proxyTimeout = 15 * time.Second

// Hop-by-hop headers and the ones the transport recomputes; forwarding them would corrupt the relayed message.
var (
	droppedRequestHeaders  = []string{"Host", "Connection", "Content-Length", "Accept-Encoding", "Transfer-Encoding", "Keep-Alive", "Proxy-Connection", "Te", "Trailer", "Upgrade"}
	droppedResponseHeaders = []string{"Connection", "Content-Length", "Content-Encoding", "Transfer-Encoding", "Keep-Alive", "Trailer", "Upgrade"}
)

// IsAPIPath reports whether a path is relayed to starmoe-api.
// `/api/v1/meta/*` and `/api/v1/markdown` are served directly by the Next.js frontend rather than starmoe-api.
func IsAPIPath(pathname string) bool {
	if pathname == "/api/v1/meta" || strings.HasPrefix(pathname, "/api/v1/meta/") ||
		pathname == "/api/v1/markdown" || strings.HasPrefix(pathname, "/api/v1/markdown/") {
		return false
	}
	return pathname == "/api" || strings.HasPrefix(pathname, "/api/")
}

// APIProxy relays /api/* to starmoe-api so pages call it same-origin: its session cookie stays first-party and no
// CORS is involved. Redirects and every Set-Cookie pass through untouched.
type APIProxy struct {
	Origin string
	Client *http.Client
}

func (p *APIProxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if p.Origin == "" {
		w.Header().Set("Cache-Control", "no-store")
		http.Error(w, "Not Found", http.StatusNotFound)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), proxyTimeout)
	defer cancel()
	target := p.Origin + r.URL.EscapedPath()
	if r.URL.RawQuery != "" {
		target += "?" + r.URL.RawQuery
	}
	var body io.Reader
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		buffered, err := io.ReadAll(io.LimitReader(r.Body, 8<<20))
		if err != nil {
			http.Error(w, "Bad Request", http.StatusBadRequest)
			return
		}
		body = bytes.NewReader(buffered)
	}
	request, err := http.NewRequestWithContext(ctx, r.Method, target, body)
	if err != nil {
		http.Error(w, "Bad Gateway", http.StatusBadGateway)
		return
	}
	request.Header = r.Header.Clone()
	for _, name := range droppedRequestHeaders {
		request.Header.Del(name)
	}
	client := p.Client
	if client == nil {
		client = http.DefaultClient
	}
	relay := *client
	relay.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	response, err := relay.Do(request)
	if err != nil {
		// The address stays in the log: it can name in-cluster hosts.
		logx.Printf("api proxy: %s %s failed: %v", r.Method, r.URL.Path, err)
		w.Header().Set("Cache-Control", "no-store")
		http.Error(w, "Bad Gateway", http.StatusBadGateway)
		return
	}
	defer response.Body.Close()
	header := w.Header()
	for name, values := range response.Header {
		header[name] = append([]string(nil), values...)
	}
	for _, name := range droppedResponseHeaders {
		header.Del(name)
	}
	w.WriteHeader(response.StatusCode)
	_, _ = io.Copy(w, response.Body)
}

// Player link previews. Crawlers that build previews do not run the page's script, so for a player page the
// shell's title and description tags get the player's name and level, read from starmoe-api's public profile.
// Anything that goes wrong serves the plain shell.
const (
	lookupTimeout = 1500 * time.Millisecond
	hitTTL        = 5 * time.Minute
	missTTL       = 30 * time.Second
	cacheLimit    = 2000
)

type playerMeta struct {
	name      string
	level     int
	profileID string
}

type cached struct {
	meta  *playerMeta
	until time.Time
}

// PlayerPages serves player pages with the player in their link preview.
type PlayerPages struct {
	Roots     *RootSource
	Site      *siteconfig.Site
	APIOrigin string
	Client    *http.Client
	Fallback  http.Handler

	mu    sync.Mutex
	cache map[string]cached
}

func (p *PlayerPages) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	player, ok := p.Site.ParsePlayerPath(r.URL.Path)
	shell, shellOK := p.Site.PlayerShellPath(r.URL.Path)
	roots := p.Roots.Load()
	if !ok || !shellOK || p.APIOrigin == "" || roots.Current == "" || r.Method != http.MethodGet {
		p.Fallback.ServeHTTP(w, r)
		return
	}
	meta := p.lookup(r.Context(), player.Server, player.ProfileID)
	if meta == nil {
		p.Fallback.ServeHTTP(w, r)
		return
	}
	raw, err := os.ReadFile(filepath.Join(join(roots.Current, shell), "index.html"))
	if err != nil {
		p.Fallback.ServeHTTP(w, r)
		return
	}
	page, err := rewritePlayerShell(raw, meta, r.URL.Path)
	if err != nil {
		p.Fallback.ServeHTTP(w, r)
		return
	}
	// Built per request, so no ETag and no precompressed variant; the shell is small.
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	_, _ = w.Write(page)
}

func (p *PlayerPages) lookup(ctx context.Context, server, profileID string) *playerMeta {
	key := server + "/" + profileID
	now := time.Now()
	p.mu.Lock()
	if p.cache == nil {
		p.cache = map[string]cached{}
	}
	if entry, ok := p.cache[key]; ok && entry.until.After(now) {
		p.mu.Unlock()
		return entry.meta
	}
	p.mu.Unlock()

	var meta *playerMeta
	ctx, cancel := context.WithTimeout(ctx, lookupTimeout)
	defer cancel()
	target := p.APIOrigin + "/api/players/" + url.PathEscape(server) + "/" + url.PathEscape(profileID)
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err == nil {
		request.Header.Set("Accept", "application/json")
		client := p.Client
		if client == nil {
			client = http.DefaultClient
		}
		var response *http.Response
		response, err = client.Do(request)
		if err == nil {
			if response.StatusCode == http.StatusOK {
				var body struct {
					Profile *struct {
						Name any `json:"name"`
					} `json:"profile"`
					Brief *struct {
						Level any `json:"level"`
					} `json:"brief"`
				}
				if json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&body) == nil && body.Profile != nil {
					if name, ok := body.Profile.Name.(string); ok && strings.TrimSpace(name) != "" {
						meta = &playerMeta{name: strings.TrimSpace(name), profileID: profileID}
						if body.Brief != nil {
							meta.level = level(body.Brief.Level)
						}
					}
				}
			}
			response.Body.Close()
		}
	}
	if err != nil {
		logx.Printf("player meta: %s lookup failed: %v", server, err)
	}

	p.mu.Lock()
	defer p.mu.Unlock()
	if len(p.cache) >= cacheLimit {
		for entry, value := range p.cache {
			if !value.until.After(now) {
				delete(p.cache, entry)
			}
		}
		if len(p.cache) >= cacheLimit {
			p.cache = map[string]cached{}
		}
	}
	ttl := missTTL
	if meta != nil {
		ttl = hitTTL
	}
	p.cache[key] = cached{meta: meta, until: now.Add(ttl)}
	return meta
}

func level(value any) int {
	var number float64
	switch v := value.(type) {
	case float64:
		number = v
	case string:
		parsed, err := strconv.ParseFloat(strings.TrimSpace(v), 64)
		if err != nil {
			return 0
		}
		number = parsed
	default:
		return 0
	}
	if number > 0 && number < 1e9 {
		return int(number)
	}
	return 0
}

// rewritePlayerShell prefixes the title and preview tags with the player and points og:url at the player page.
func rewritePlayerShell(raw []byte, meta *playerMeta, pathname string) ([]byte, error) {
	summary := []string{meta.name}
	if meta.level > 0 {
		summary = append(summary, "Lv."+strconv.Itoa(meta.level))
	}
	summary = append(summary, "ID "+meta.profileID)
	titlePrefix := meta.name + " | "
	descriptionPrefix := strings.Join(summary, " · ") + " — "

	tokenizer := xhtml.NewTokenizer(bytes.NewReader(raw))
	var out bytes.Buffer
	inTitle := false
	for {
		kind := tokenizer.Next()
		switch kind {
		case xhtml.ErrorToken:
			if tokenizer.Err() == io.EOF {
				return out.Bytes(), nil
			}
			return nil, tokenizer.Err()
		case xhtml.StartTagToken, xhtml.SelfClosingTagToken:
			token := tokenizer.Token()
			switch token.DataAtom {
			case atom.Title:
				out.Write(tokenizer.Raw())
				if kind == xhtml.StartTagToken {
					out.WriteString(html.EscapeString(titlePrefix))
					inTitle = true
				}
				continue
			case atom.Meta:
				if rewriteMeta(&token, titlePrefix, descriptionPrefix, pathname) {
					out.WriteString(token.String())
					continue
				}
			}
			out.Write(tokenizer.Raw())
		case xhtml.EndTagToken:
			if inTitle {
				inTitle = false
			}
			out.Write(tokenizer.Raw())
		default:
			out.Write(tokenizer.Raw())
		}
	}
}

func rewriteMeta(token *xhtml.Token, titlePrefix, descriptionPrefix, pathname string) bool {
	key := ""
	content := -1
	for i, attribute := range token.Attr {
		switch attribute.Key {
		case "property", "name":
			key = attribute.Val
		case "content":
			content = i
		}
	}
	if content < 0 {
		return false
	}
	value := &token.Attr[content].Val
	switch key {
	case "og:title", "twitter:title", "og:image:alt", "twitter:image:alt":
		*value = titlePrefix + *value
	case "description", "og:description", "twitter:description":
		*value = descriptionPrefix + *value
	case "og:url":
		canonical, err := url.Parse(*value)
		if err != nil || canonical.Host == "" {
			return false
		}
		canonical.Path = pathname
		canonical.RawPath = ""
		*value = canonical.String()
	default:
		return false
	}
	return true
}
