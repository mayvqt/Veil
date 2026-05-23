package db

import (
	"database/sql"
	"errors"
	"path/filepath"
	"testing"
	"time"
)

func makeStore(t *testing.T) *Store {
	t.Helper()
	store, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	return store
}

func insertUser(t *testing.T, s *Store, id, name, role string) {
	t.Helper()
	_, err := s.DB.Exec("INSERT INTO users (id, display_name, role, active, created_at) VALUES (?, ?, ?, 1, ?)", id, name, role, time.Now().UTC().Format(time.RFC3339))
	if err != nil {
		t.Fatal(err)
	}
	_, err = s.DB.Exec("INSERT OR IGNORE INTO room_memberships (room_id, user_id, joined_at) VALUES (?, ?, ?)", DefaultRoomID, id, time.Now().UTC().Format(time.RFC3339))
	if err != nil {
		t.Fatal(err)
	}
}

func TestMessageLifecycleAndPagination(t *testing.T) {
	s := makeStore(t)
	insertUser(t, s, "u1", "alice", "member")
	insertUser(t, s, "u2", "bob", "member")
	if err := s.SetUserChatColor("u1", "#aa11bb"); err != nil {
		t.Fatal(err)
	}
	if err := s.SetUserChatColor("u2", "#11bbaa"); err != nil {
		t.Fatal(err)
	}
	if err := s.SetUserAvatarURL("u1", "data:image/png;base64,abc"); err != nil {
		t.Fatal(err)
	}

	m1, err := s.SaveMessage(DefaultRoomID, "u1", "alice", "ct1", "n1", "")
	if err != nil {
		t.Fatal(err)
	}
	m2, err := s.SaveMessage(DefaultRoomID, "u2", "bob", "ct2", "n2", m1.ID)
	if err != nil {
		t.Fatal(err)
	}
	m3, err := s.SaveMessage(DefaultRoomID, "u1", "alice", "ct3", "n3", "")
	if err != nil {
		t.Fatal(err)
	}

	page1, err := s.ListRecentMessages(DefaultRoomID, 2, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(page1) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(page1))
	}
	if page1[0]["id"] != m3.ID || page1[1]["id"] != m2.ID {
		t.Fatalf("unexpected ordering: %#v", page1)
	}
	if page1[1]["reply_to_id"] != m1.ID {
		t.Fatalf("expected reply_to_id=%s, got %s", m1.ID, page1[1]["reply_to_id"])
	}
	if page1[0]["chat_color"] == "" || page1[1]["chat_color"] == "" {
		t.Fatalf("expected chat_color on listed messages, got %#v", page1)
	}
	if page1[0]["sender_id"] == "u1" && page1[0]["avatar_url"] == "" {
		t.Fatalf("expected avatar_url for u1 message, got %#v", page1[0])
	}

	page2, err := s.ListRecentMessages(DefaultRoomID, 2, m2.RowID)
	if err != nil {
		t.Fatal(err)
	}
	if len(page2) != 1 || page2[0]["id"] != m1.ID {
		t.Fatalf("unexpected second page: %#v", page2)
	}
}

func TestSetUserChatColorValidation(t *testing.T) {
	s := makeStore(t)
	insertUser(t, s, "u1", "alice", "member")
	if err := s.SetUserChatColor("u1", "#123abc"); err != nil {
		t.Fatalf("expected valid color to persist: %v", err)
	}
	if err := s.SetUserChatColor("u1", "nope"); err == nil {
		t.Fatal("expected invalid color to be rejected")
	}
}

func TestEditDeleteMessageOwnershipAndState(t *testing.T) {
	s := makeStore(t)
	insertUser(t, s, "u1", "alice", "member")
	insertUser(t, s, "u2", "bob", "member")

	msg, err := s.SaveMessage(DefaultRoomID, "u1", "alice", "ct1", "n1", "")
	if err != nil {
		t.Fatal(err)
	}
	edited, err := s.EditMessage(DefaultRoomID, msg.ID, "u1", "ct1-edit", "n1-edit")
	if err != nil {
		t.Fatal(err)
	}
	if edited.Ciphertext != "ct1-edit" || edited.Nonce != "n1-edit" || edited.EditedAt == "" {
		t.Fatalf("unexpected edited message: %#v", edited)
	}

	if _, err := s.EditMessage(DefaultRoomID, msg.ID, "u2", "x", "y"); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected sql.ErrNoRows for non-owner edit, got %v", err)
	}

	deleted, err := s.DeleteMessage(DefaultRoomID, msg.ID, "u1", "alice", false)
	if err != nil {
		t.Fatal(err)
	}
	if deleted.DeletedAt == "" {
		t.Fatalf("expected deleted_at to be set, got %#v", deleted)
	}
	if deleted.DeletedByID != "u1" || deleted.DeletedByName != "alice" {
		t.Fatalf("expected deleted_by metadata to be set, got %#v", deleted)
	}

	if _, err := s.EditMessage(DefaultRoomID, msg.ID, "u1", "x", "y"); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected sql.ErrNoRows editing deleted message, got %v", err)
	}
}

func TestDeleteMessageAllowsPrivilegedActor(t *testing.T) {
	s := makeStore(t)
	insertUser(t, s, "u1", "alice", "member")
	insertUser(t, s, "admin", "root", "admin")

	msg, err := s.SaveMessage(DefaultRoomID, "u1", "alice", "ct1", "n1", "")
	if err != nil {
		t.Fatal(err)
	}

	if _, err := s.DeleteMessage(DefaultRoomID, msg.ID, "admin", "root", false); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected sql.ErrNoRows for non-owner delete without privilege, got %v", err)
	}

	deleted, err := s.DeleteMessage(DefaultRoomID, msg.ID, "admin", "root", true)
	if err != nil {
		t.Fatal(err)
	}
	if deleted.DeletedByID != "admin" || deleted.DeletedByName != "root" {
		t.Fatalf("expected privileged actor metadata to be set, got %#v", deleted)
	}
}

func TestReadReceiptsMonotonic(t *testing.T) {
	s := makeStore(t)
	if err := s.UpsertReadReceipt(DefaultRoomID, "u1", 10); err != nil {
		t.Fatal(err)
	}
	if err := s.UpsertReadReceipt(DefaultRoomID, "u1", 7); err != nil {
		t.Fatal(err)
	}
	if err := s.UpsertReadReceipt(DefaultRoomID, "u1", 12); err != nil {
		t.Fatal(err)
	}
	got, err := s.ListReadReceipts(DefaultRoomID)
	if err != nil {
		t.Fatal(err)
	}
	if got["u1"] != 12 {
		t.Fatalf("expected monotonic receipt 12, got %d", got["u1"])
	}
}
