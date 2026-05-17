package web

import (
	"path/filepath"
	"testing"
	"time"

	"veil/internal/auth"
	"veil/internal/db"
)

func TestUserFromSignedTokenRejectsExpiredSession(t *testing.T) {
	store, err := db.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.DB.Exec("INSERT INTO users (id, display_name, role, active, created_at) VALUES (?, ?, ?, ?, ?)", "u1", "alice", "member", 1, time.Now().UTC().Format(time.RFC3339)); err != nil {
		t.Fatal(err)
	}
	srv := &Server{
		Store:         store,
		Secret:        "test-secret",
		SessionMaxAge: time.Hour,
	}
	old := time.Now().UTC().Add(-2 * time.Hour).Format(time.RFC3339)
	token := auth.Sign("u1|"+old, srv.Secret)
	if _, err := srv.userFromSignedToken(token); err == nil {
		t.Fatal("expected expired session to fail")
	}
}
