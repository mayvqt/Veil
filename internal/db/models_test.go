package db

import (
	"path/filepath"
	"testing"
)

func TestInviteSingleUse(t *testing.T) {
	store, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	hash := "hash-single-use"
	id, err := store.CreateInvite(hash, "creator", 24, 1)
	if err != nil {
		t.Fatal(err)
	}
	if id == "" {
		t.Fatal("expected invite id")
	}
	if _, err := store.ValidateInvite(hash); err != nil {
		t.Fatalf("first consume failed: %v", err)
	}
	if _, err := store.ValidateInvite(hash); err == nil {
		t.Fatal("expected second consume to fail")
	}
}

func TestRevokeUnusedInvites(t *testing.T) {
	store, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.CreateInvite("h1", "creator", 24, 1); err != nil {
		t.Fatal(err)
	}
	if _, err := store.CreateInvite("h2", "creator", 24, 1); err != nil {
		t.Fatal(err)
	}
	if _, err := store.ValidateInvite("h2"); err != nil {
		t.Fatal(err)
	}
	revoked, err := store.RevokeUnusedInvites()
	if err != nil {
		t.Fatal(err)
	}
	if revoked != 1 {
		t.Fatalf("expected 1 revoked invite, got %d", revoked)
	}
}
