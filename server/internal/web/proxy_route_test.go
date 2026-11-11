package web

import "testing"

func TestIsAPIPathKeepsFrontendRoutesLocal(t *testing.T) {
	frontend := []string{
		"/api/v1/meta",
		"/api/v1/meta/version",
		"/api/v1/meta/deck-charts",
		"/api/v1/markdown",
		"/api/v1/markdown/",
		"/api/v1/live2d",
		"/api/v1/live2d/index",
		"/api/v1/live2d/tw/chart/models/adv_live2d_tomori_001_school_winter_hs_1st.json",
		"/api/v1/story-site",
		"/api/v1/story-site/index",
		"/api/v1/story-site/tw/stories/10000.json",
		"/api/v1/story-site/jp/stories/10000/assets/abc.png",
	}
	for _, path := range frontend {
		if IsAPIPath(path) {
			t.Errorf("%s: served by the frontend, but routed to starmoe-api", path)
		}
	}

	proxied := []string{
		"/api",
		"/api/",
		"/api/me",
		"/api/v1",
		"/api/v1/story-site-foo",
		"/api/v1/live2dx",
		"/api/v1/metadata",
		"/api/v1/markdownx",
		"/api/v1/players/tw/1",
	}
	for _, path := range proxied {
		if !IsAPIPath(path) {
			t.Errorf("%s: not a frontend route, but was kept away from starmoe-api", path)
		}
	}
}
