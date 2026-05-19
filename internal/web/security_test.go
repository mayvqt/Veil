package web

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

func TestDecodeJSONRejectsTrailingAndUnknown(t *testing.T) {
	var payload struct {
		Name string `json:"name"`
	}
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewBufferString(`{"name":"ok"} {"x":1}`))
	if err := decodeJSON(w, req, &payload); err == nil {
		t.Fatal("expected trailing JSON to fail")
	}
	w = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/", bytes.NewBufferString(`{"unknown":"x"}`))
	if err := decodeJSON(w, req, &payload); err == nil {
		t.Fatal("expected unknown field to fail")
	}
}

func TestCleanInputTrimAndMaxLen(t *testing.T) {
	got := cleanInput("  abcdef  ", 4)
	if got != "abcd" {
		t.Fatalf("expected abcd, got %q", got)
	}
}

func TestSecurityHeadersMiddleware(t *testing.T) {
	h := securityHeaders(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	h.ServeHTTP(rr, req)
	if rr.Header().Get("X-Frame-Options") != "DENY" {
		t.Fatalf("expected DENY frame options, got %q", rr.Header().Get("X-Frame-Options"))
	}
	if rr.Header().Get("Content-Security-Policy") == "" {
		t.Fatal("expected CSP header")
	}
}

func TestEnvParsers(t *testing.T) {
	t.Setenv("PUBLIC_ORIGIN", " https://a.example , ,http://b.example ")
	origins := allowedOriginsFromEnv()
	if _, ok := origins["https://a.example"]; !ok {
		t.Fatal("missing parsed origin a")
	}
	if _, ok := origins["http://b.example"]; !ok {
		t.Fatal("missing parsed origin b")
	}

	t.Setenv("SESSION_MAX_AGE_HOURS", "12")
	if got := sessionMaxAgeFromEnv(); got != 12*time.Hour {
		t.Fatalf("expected 12h, got %v", got)
	}
	t.Setenv("SESSION_MAX_AGE_HOURS", "bad")
	if got := sessionMaxAgeFromEnv(); got != 30*24*time.Hour {
		t.Fatalf("expected default duration, got %v", got)
	}

	t.Setenv("SOME_POSITIVE_INT", "42")
	if got := positiveIntFromEnv("SOME_POSITIVE_INT"); got != 42 {
		t.Fatalf("expected 42, got %d", got)
	}
	t.Setenv("SOME_POSITIVE_INT", "-1")
	if got := positiveIntFromEnv("SOME_POSITIVE_INT"); got != 0 {
		t.Fatalf("expected 0 for invalid value, got %d", got)
	}
}

func TestSetSessionCookie(t *testing.T) {
	rr := httptest.NewRecorder()
	setSessionCookie(rr, "signed-token", true, 2*time.Hour)
	resp := rr.Result()
	found := false
	for _, c := range resp.Cookies() {
		if c.Name == "veil_session" {
			found = true
			if c.Value != "signed-token" || !c.HttpOnly || !c.Secure {
				t.Fatalf("unexpected cookie fields: %#v", c)
			}
		}
	}
	if !found {
		t.Fatal("expected veil_session cookie")
	}
}

func TestRandomToken(t *testing.T) {
	a, err := randomToken()
	if err != nil {
		t.Fatalf("randomToken() error = %v", err)
	}
	b, err := randomToken()
	if err != nil {
		t.Fatalf("randomToken() error = %v", err)
	}
	if len(a) != 36 || len(b) != 36 {
		t.Fatalf("expected 36-char hex token, got %d and %d", len(a), len(b))
	}
	if a == b {
		t.Fatal("expected random tokens to differ")
	}
	if strings.Trim(a, "0123456789abcdef") != "" {
		t.Fatalf("expected lowercase hex token, got %q", a)
	}
}

func TestMainLikeEnvDefaultsHelpers(t *testing.T) {
	// Guard against accidental reliance on external environment in tests.
	if os.Getenv("PUBLIC_ORIGIN") == "" {
		_ = allowedOriginsFromEnv()
	}
}
