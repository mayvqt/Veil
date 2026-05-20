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
	id, err := store.CreateInvite(DefaultRoomID, hash, "creator", 24, 1)
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
	if _, err := store.CreateInvite(DefaultRoomID, "h1", "creator", 24, 1); err != nil {
		t.Fatal(err)
	}
	if _, err := store.CreateInvite(DefaultRoomID, "h2", "creator", 24, 1); err != nil {
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

func TestRoomPinMoveAndProfileStatus(t *testing.T) {
	store, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	u, err := store.InitRoom("Room Chat", "root", "pub", "cred", "key")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.CreateRoom("", "Ops", DefaultRoomStatusText, u.ID); err != nil {
		t.Fatal(err)
	}
	design, err := store.CreateRoom("", "Design", DefaultRoomStatusText, u.ID)
	if err != nil {
		t.Fatal(err)
	}
	labs, err := store.CreateRoom("", "Labs", DefaultRoomStatusText, u.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.SetRoomPinned(design.ID, true); err != nil {
		t.Fatal(err)
	}
	if err := store.SetRoomPinned(labs.ID, true); err != nil {
		t.Fatal(err)
	}
	if err := store.MoveRoom(labs.ID, -1); err != nil {
		t.Fatal(err)
	}
	if err := store.SetUserStatusText(u.ID, "focusing"); err != nil {
		t.Fatal(err)
	}
	if err := store.SetRoomRole(DefaultRoomID, u.ID, "moderator"); err != nil {
		t.Fatal(err)
	}
	rooms, err := store.ListRoomsForUser(u.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(rooms) < 3 || rooms[0].ID != labs.ID || !rooms[0].Pinned || rooms[1].ID != design.ID {
		t.Fatalf("expected moved pinned rooms first, got %#v", rooms)
	}
	users, err := store.ListUsersByRoom(DefaultRoomID)
	if err != nil {
		t.Fatal(err)
	}
	if len(users) != 1 || users[0].StatusText != "focusing" || users[0].RoomRole != "moderator" {
		t.Fatalf("expected profile status and room role in room members, got %#v", users)
	}
}
