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
	if !cols["reply_to_id"] || !cols["edited_at"] || !cols["deleted_at"] {
		t.Fatalf("expected migrated message columns, got %#v", cols)
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
}
