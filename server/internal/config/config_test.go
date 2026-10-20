package config

import "testing"

func TestParseRoomCheckOrigin(t *testing.T) {
	valid := map[string]string{
		"http://room-check.internal:8080": "http://room-check.internal:8080",
		"https://room-check.example":      "https://room-check.example",
		"http://room-check.internal/":     "http://room-check.internal",
		"https://example.com/rc/":         "https://example.com/rc",
	}
	for raw, want := range valid {
		origin, invalid := ParseRoomCheckOrigin(raw)
		if invalid || origin != want {
			t.Errorf("%q: got %q invalid=%v, want %q", raw, origin, invalid, want)
		}
	}
	for _, raw := range []string{"room-check.internal:8080", "ftp://room-check.internal", "//room-check.internal", "/room-check", "http://"} {
		origin, invalid := ParseRoomCheckOrigin(raw)
		if !invalid || origin != "" {
			t.Errorf("%q should be refused, got %q invalid=%v", raw, origin, invalid)
		}
	}
	if origin, invalid := ParseRoomCheckOrigin(""); origin != "" || invalid {
		t.Errorf("unset should disable the route quietly, got %q invalid=%v", origin, invalid)
	}
}
