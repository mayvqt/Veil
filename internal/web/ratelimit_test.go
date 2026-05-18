package web

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestRateLimiterAllowWindow(t *testing.T) {
	l := &rateLimiter{buckets: map[string]*rateBucket{}}
	if !l.allow("k", 2, 50*time.Millisecond) {
		t.Fatal("first request should pass")
	}
	if !l.allow("k", 2, 50*time.Millisecond) {
		t.Fatal("second request should pass")
	}
	if l.allow("k", 2, 50*time.Millisecond) {
		t.Fatal("third request should be limited")
	}
	time.Sleep(60 * time.Millisecond)
	if !l.allow("k", 2, 50*time.Millisecond) {
		t.Fatal("request should pass after window expiry")
	}
}

func TestClientIPResolution(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("X-Forwarded-For", "203.0.113.5, 10.0.0.1")
	if got := clientIP(req); got != "203.0.113.5" {
		t.Fatalf("expected forwarded IP, got %q", got)
	}

	req = httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "198.51.100.7:4321"
	if got := clientIP(req); got != "198.51.100.7" {
		t.Fatalf("expected host split, got %q", got)
	}
}

func TestCheckRateLimitWrites429(t *testing.T) {
	globalRateLimiter = &rateLimiter{buckets: map[string]*rateBucket{}}
	req := httptest.NewRequest(http.MethodPost, "/", nil)
	req.RemoteAddr = "192.0.2.1:9999"
	rr := httptest.NewRecorder()
	if !checkRateLimit(rr, req, "scope", 1, time.Minute) {
		t.Fatal("first request should pass")
	}
	rr = httptest.NewRecorder()
	if checkRateLimit(rr, req, "scope", 1, time.Minute) {
		t.Fatal("second request should be blocked")
	}
	if rr.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429, got %d", rr.Code)
	}
}
