package db

import (
	"database/sql"
	"path/filepath"
	"testing"
)

func TestMigrateAddsMessageColumnsToLegacySchema(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.db")
	dbRaw, err := sql.Open("sqlite3", path)
	if err != nil {
		t.Fatal(err)
	}
	defer dbRaw.Close()

	_, err = dbRaw.Exec(`
CREATE TABLE room_state (id INTEGER PRIMARY KEY CHECK (id=1), room_name TEXT, initialized INTEGER NOT NULL DEFAULT 0, room_key_enc TEXT, created_at TEXT);
INSERT INTO room_state (id, initialized) VALUES (1, 0);
CREATE TABLE users (id TEXT PRIMARY KEY, display_name TEXT NOT NULL, role TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE devices (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, public_key TEXT NOT NULL, credential_id TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE messages (id TEXT PRIMARY KEY, sender_id TEXT NOT NULL, ciphertext TEXT NOT NULL, nonce TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE invites (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, created_by TEXT NOT NULL, expires_at TEXT NOT NULL, max_uses INTEGER NOT NULL, uses INTEGER NOT NULL DEFAULT 0, revoked INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
`)
	if err != nil {
		t.Fatal(err)
	}

	if err := migrate(dbRaw); err != nil {
		t.Fatal(err)
	}

	rows, err := dbRaw.Query("PRAGMA table_info(messages)")
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	cols := map[string]bool{}
	for rows.Next() {
		var cid int
		var name, typ string
		var notNull, pk int
		var def any
		if err := rows.Scan(&cid, &name, &typ, &notNull, &def, &pk); err != nil {
			t.Fatal(err)
		}
		cols[name] = true
	}
	if !cols["reply_to_id"] || !cols["edited_at"] || !cols["deleted_at"] || !cols["deleted_by_id"] || !cols["deleted_by_name"] {
		t.Fatalf("expected migrated message columns, got %#v", cols)
	}
	var statusText string
	if err := dbRaw.QueryRow("SELECT room_status_text FROM room_state WHERE id=1").Scan(&statusText); err != nil {
		t.Fatal(err)
	}
	if statusText != DefaultRoomStatusText {
		t.Fatalf("expected migrated room_status_text default %q, got %q", DefaultRoomStatusText, statusText)
	}
	rows, err = dbRaw.Query("PRAGMA table_info(devices)")
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	deviceCols := map[string]bool{}
	for rows.Next() {
		var cid int
		var name, typ string
		var notNull, pk int
		var def any
		if err := rows.Scan(&cid, &name, &typ, &notNull, &def, &pk); err != nil {
			t.Fatal(err)
		}
		deviceCols[name] = true
	}
	if !deviceCols["device_secret_hash"] {
		t.Fatalf("expected migrated device_secret_hash column, got %#v", deviceCols)
	}
}

func TestMigrateAddsAndBackfillsUserChatColor(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy-chat-color.db")
	dbRaw, err := sql.Open("sqlite3", path)
	if err != nil {
		t.Fatal(err)
	}
	defer dbRaw.Close()

	_, err = dbRaw.Exec(`
CREATE TABLE room_state (id INTEGER PRIMARY KEY CHECK (id=1), room_name TEXT, initialized INTEGER NOT NULL DEFAULT 0, room_key_enc TEXT, created_at TEXT);
INSERT INTO room_state (id, initialized) VALUES (1, 0);
CREATE TABLE users (id TEXT PRIMARY KEY, display_name TEXT NOT NULL, role TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE devices (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, public_key TEXT NOT NULL, credential_id TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE messages (id TEXT PRIMARY KEY, sender_id TEXT NOT NULL, ciphertext TEXT NOT NULL, nonce TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE invites (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, created_by TEXT NOT NULL, expires_at TEXT NOT NULL, max_uses INTEGER NOT NULL, uses INTEGER NOT NULL DEFAULT 0, revoked INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
INSERT INTO users (id, display_name, role, active, created_at) VALUES ('u1','alice','member',1,'2026-01-01T00:00:00Z');
`)
	if err != nil {
		t.Fatal(err)
	}

	if err := migrate(dbRaw); err != nil {
		t.Fatal(err)
	}

	var color string
	if err := dbRaw.QueryRow("SELECT chat_color FROM users WHERE id='u1'").Scan(&color); err != nil {
		t.Fatal(err)
	}
	if color == "" {
		t.Fatal("expected migrated user chat_color to be backfilled")
	}
	var avatarURL string
	if err := dbRaw.QueryRow("SELECT avatar_url FROM users WHERE id='u1'").Scan(&avatarURL); err != nil {
		t.Fatal(err)
	}
	if avatarURL != "" {
		t.Fatalf("expected migrated user avatar_url default empty, got %q", avatarURL)
	}
	var ringColor, ringColor2, ringColor3, ringColor4, ringMode string
	if err := dbRaw.QueryRow("SELECT avatar_ring_color, avatar_ring_color2, avatar_ring_color3, avatar_ring_color4, avatar_ring_mode FROM users WHERE id='u1'").Scan(&ringColor, &ringColor2, &ringColor3, &ringColor4, &ringMode); err != nil {
		t.Fatal(err)
	}
	if ringColor != "" || ringColor2 != "" || ringColor3 != "" || ringColor4 != "" || ringMode != "none" {
		t.Fatalf("expected migrated avatar ring defaults empty/empty/empty/empty/none, got %q/%q/%q/%q/%q", ringColor, ringColor2, ringColor3, ringColor4, ringMode)
	}
	var statusColor, noteColor string
	if err := dbRaw.QueryRow("SELECT COALESCE(profile_status_color,''), COALESCE(profile_note_color,'') FROM users WHERE id='u1'").Scan(&statusColor, &noteColor); err != nil {
		t.Fatal(err)
	}
	if statusColor != "" || noteColor != "" {
		t.Fatalf("expected migrated profile text color defaults empty/empty, got %q/%q", statusColor, noteColor)
	}
	var disableBanner int
	if err := dbRaw.QueryRow("SELECT COALESCE(profile_disable_banner,0) FROM users WHERE id='u1'").Scan(&disableBanner); err != nil {
		t.Fatal(err)
	}
	if disableBanner != 0 {
		t.Fatalf("expected migrated profile disable banner default 0, got %d", disableBanner)
	}
}

func TestMigrateBackfillsActiveUsersIntoExistingRooms(t *testing.T) {
	path := filepath.Join(t.TempDir(), "room-memberships.db")
	store, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.DB.Exec("INSERT INTO users (id, display_name, role, active, created_at) VALUES ('u1','root','root_admin',1,'2026-01-01T00:00:00Z'), ('u2','member','member',1,'2026-01-01T00:00:00Z')"); err != nil {
		t.Fatal(err)
	}
	if _, err := store.DB.Exec("INSERT INTO rooms (id, name, status_text, created_by, created_at) VALUES ('ops','Ops',?,'u1','2026-01-01T00:00:00Z')", DefaultRoomStatusText); err != nil {
		t.Fatal(err)
	}
	if _, err := store.DB.Exec("INSERT OR IGNORE INTO room_memberships (room_id, user_id, joined_at) VALUES ('ops','u1','2026-01-01T00:00:00Z')"); err != nil {
		t.Fatal(err)
	}
	if err := store.DB.Close(); err != nil {
		t.Fatal(err)
	}

	store, err = Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer store.DB.Close()

	var count int
	if err := store.DB.QueryRow("SELECT COUNT(*) FROM room_memberships WHERE room_id='ops' AND user_id IN ('u1','u2')").Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 2 {
		t.Fatalf("expected migration to backfill both active users into ops, got %d", count)
	}
}
