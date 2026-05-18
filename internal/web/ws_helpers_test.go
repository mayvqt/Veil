package web

import (
	"net/http/httptest"
	"testing"
)

func TestBoolToFlag(t *testing.T) {
	if boolToFlag(true) != "1" {
		t.Fatal("true should map to 1")
	}
	if boolToFlag(false) != "0" {
		t.Fatal("false should map to 0")
	}
}

func TestCheckWebSocketOrigin(t *testing.T) {
	s := &Server{AllowedOrigins: map[string]struct{}{
		"https://allowed.example": {},
	}}
	req := httptest.NewRequest("GET", "http://localhost/ws", nil)
	req.Header.Set("Origin", "https://allowed.example")
	if !s.checkWebSocketOrigin(req) {
		t.Fatal("expected explicitly allowed origin to pass")
	}

	req = httptest.NewRequest("GET", "http://localhost/ws", nil)
	req.Header.Set("Origin", "https://blocked.example")
	if s.checkWebSocketOrigin(req) {
		t.Fatal("expected blocked origin to fail")
	}

	req = httptest.NewRequest("GET", "http://localhost/ws", nil)
	req.Header.Set("Origin", "http://localhost")
	if !s.checkWebSocketOrigin(req) {
		t.Fatal("expected same-origin fallback to pass")
	}
}
