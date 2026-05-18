package web

import (
	"path/filepath"
	"testing"

	"veil/internal/db"
)

func TestNewServerConfigAndRoleHelper(t *testing.T) {
	t.Setenv("SESSION_SECRET", "abc")
	t.Setenv("COOKIE_SECURE", "true")
	t.Setenv("MESSAGE_RETENTION_DAYS", "7")
	t.Setenv("MESSAGE_RETENTION_COUNT", "99")

	store, err := db.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	s := New(store)
	if s.Secret != "abc" || !s.CookieSecure || s.RetainDays != 7 || s.RetainCount != 99 {
		t.Fatalf("unexpected server config: %#v", s)
	}
	if !isAdminRole("admin") || !isAdminRole("root_admin") || isAdminRole("member") {
		t.Fatal("unexpected role helper behavior")
	}
}
