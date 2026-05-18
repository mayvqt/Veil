package auth

import (
	"strings"
	"testing"
)

func TestSignVerifyRoundTrip(t *testing.T) {
	signed := Sign("u1|2026-01-01T00:00:00Z", "secret")
	raw, ok := Verify(signed, "secret")
	if !ok {
		t.Fatal("expected verify to succeed")
	}
	if raw != "u1|2026-01-01T00:00:00Z" {
		t.Fatalf("unexpected raw payload: %q", raw)
	}
}

func TestVerifyRejectsTamperAndWrongSecret(t *testing.T) {
	signed := Sign("payload", "secret")
	if _, ok := Verify(signed+"x", "secret"); ok {
		t.Fatal("expected tampered token to fail")
	}
	if _, ok := Verify(signed, "other-secret"); ok {
		t.Fatal("expected wrong secret to fail")
	}
	if _, ok := Verify("no-dot", "secret"); ok {
		t.Fatal("expected malformed token to fail")
	}
}

func TestNewSessionFormat(t *testing.T) {
	s := NewSession("user123")
	if !strings.HasPrefix(s, "user123|") {
		t.Fatalf("expected prefix user123|, got %q", s)
	}
}
