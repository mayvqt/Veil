package db

import (
	"database/sql"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

type Store struct {
	DB *sql.DB
}

func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite3", path)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	if _, err := db.Exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;"); err != nil {
		return nil, err
	}
	if err := migrate(db); err != nil {
		return nil, err
	}
	return &Store{DB: db}, nil
}

func migrate(db *sql.DB) error {
	_, err := db.Exec(`
CREATE TABLE IF NOT EXISTS room_state (
  id INTEGER PRIMARY KEY CHECK (id=1),
  room_name TEXT,
  initialized INTEGER NOT NULL DEFAULT 0,
  room_key_enc TEXT,
  created_at TEXT
);
INSERT OR IGNORE INTO room_state (id, initialized) VALUES (1, 0);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL,
  chat_color TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  avatar_ring_color TEXT NOT NULL DEFAULT '',
  avatar_ring_color2 TEXT NOT NULL DEFAULT '',
  avatar_ring_color3 TEXT NOT NULL DEFAULT '',
  avatar_ring_color4 TEXT NOT NULL DEFAULT '',
  avatar_ring_mode TEXT NOT NULL DEFAULT 'none',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  credential_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  sender_id TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  nonce TEXT NOT NULL,
  reply_to_id TEXT,
  edited_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(sender_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS message_receipts (
  user_id TEXT PRIMARY KEY,
  last_seen_rowid INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  created_by TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  max_uses INTEGER NOT NULL,
  uses INTEGER NOT NULL DEFAULT 0,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_credential_id ON devices(credential_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invites_token_hash ON invites(token_hash);
CREATE INDEX IF NOT EXISTS idx_users_active_created_at ON users(active, created_at);
`)
	if err != nil {
		return err
	}
	if err := ensureUsersActiveColumn(db); err != nil {
		return err
	}
	if err := ensureUsersChatColorColumn(db); err != nil {
		return err
	}
	if err := ensureUsersAvatarURLColumn(db); err != nil {
		return err
	}
	if err := ensureUsersAvatarRingColumns(db); err != nil {
		return err
	}
	if err := backfillUsersChatColors(db); err != nil {
		return err
	}
	if err := ensureMessagesColumns(db); err != nil {
		return err
	}
	return nil
}

func now() string { return time.Now().UTC().Format(time.RFC3339) }

func ensureUsersActiveColumn(db *sql.DB) error {
	rows, err := db.Query("PRAGMA table_info(users)")
	if err != nil {
		return err
	}
	defer rows.Close()

	hasActive := false
	for rows.Next() {
		var cid int
		var name, colType string
		var notNull, pk int
		var defaultValue any
		if err := rows.Scan(&cid, &name, &colType, &notNull, &defaultValue, &pk); err != nil {
			return err
		}
		if name == "active" {
			hasActive = true
			break
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if hasActive {
		return nil
	}
	_, err = db.Exec("ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1")
	return err
}

func ensureMessagesColumns(db *sql.DB) error {
	rows, err := db.Query("PRAGMA table_info(messages)")
	if err != nil {
		return err
	}
	defer rows.Close()
	hasReplyTo := false
	hasEditedAt := false
	hasDeletedAt := false
	for rows.Next() {
		var cid int
		var name, colType string
		var notNull, pk int
		var defaultValue any
		if err := rows.Scan(&cid, &name, &colType, &notNull, &defaultValue, &pk); err != nil {
			return err
		}
		switch name {
		case "reply_to_id":
			hasReplyTo = true
		case "edited_at":
			hasEditedAt = true
		case "deleted_at":
			hasDeletedAt = true
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if !hasReplyTo {
		if _, err := db.Exec("ALTER TABLE messages ADD COLUMN reply_to_id TEXT"); err != nil {
			return err
		}
	}
	if !hasEditedAt {
		if _, err := db.Exec("ALTER TABLE messages ADD COLUMN edited_at TEXT"); err != nil {
			return err
		}
	}
	if !hasDeletedAt {
		if _, err := db.Exec("ALTER TABLE messages ADD COLUMN deleted_at TEXT"); err != nil {
			return err
		}
	}
	return nil
}

func ensureUsersChatColorColumn(db *sql.DB) error {
	rows, err := db.Query("PRAGMA table_info(users)")
	if err != nil {
		return err
	}
	defer rows.Close()
	hasChatColor := false
	for rows.Next() {
		var cid int
		var name, colType string
		var notNull, pk int
		var defaultValue any
		if err := rows.Scan(&cid, &name, &colType, &notNull, &defaultValue, &pk); err != nil {
			return err
		}
		if name == "chat_color" {
			hasChatColor = true
			break
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if hasChatColor {
		return nil
	}
	_, err = db.Exec("ALTER TABLE users ADD COLUMN chat_color TEXT NOT NULL DEFAULT ''")
	return err
}

func ensureUsersAvatarURLColumn(db *sql.DB) error {
	rows, err := db.Query("PRAGMA table_info(users)")
	if err != nil {
		return err
	}
	defer rows.Close()
	hasAvatarURL := false
	for rows.Next() {
		var cid int
		var name, colType string
		var notNull, pk int
		var defaultValue any
		if err := rows.Scan(&cid, &name, &colType, &notNull, &defaultValue, &pk); err != nil {
			return err
		}
		if name == "avatar_url" {
			hasAvatarURL = true
			break
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if hasAvatarURL {
		return nil
	}
	_, err = db.Exec("ALTER TABLE users ADD COLUMN avatar_url TEXT NOT NULL DEFAULT ''")
	return err
}

func ensureUsersAvatarRingColumns(db *sql.DB) error {
	rows, err := db.Query("PRAGMA table_info(users)")
	if err != nil {
		return err
	}
	defer rows.Close()
	existing := make(map[string]bool, 5)
	for rows.Next() {
		var cid int
		var name, colType string
		var notNull, pk int
		var defaultValue any
		if err := rows.Scan(&cid, &name, &colType, &notNull, &defaultValue, &pk); err != nil {
			return err
		}
		existing[name] = true
	}
	if err := rows.Err(); err != nil {
		return err
	}
	requiredColumns := []struct {
		name      string
		columnDef string
	}{
		{name: "avatar_ring_color", columnDef: "TEXT NOT NULL DEFAULT ''"},
		{name: "avatar_ring_color2", columnDef: "TEXT NOT NULL DEFAULT ''"},
		{name: "avatar_ring_color3", columnDef: "TEXT NOT NULL DEFAULT ''"},
		{name: "avatar_ring_color4", columnDef: "TEXT NOT NULL DEFAULT ''"},
		{name: "avatar_ring_mode", columnDef: "TEXT NOT NULL DEFAULT 'none'"},
	}
	for _, col := range requiredColumns {
		if existing[col.name] {
			continue
		}
		if _, err := db.Exec("ALTER TABLE users ADD COLUMN " + col.name + " " + col.columnDef); err != nil {
			return err
		}
	}
	return nil
}

func backfillUsersChatColors(db *sql.DB) error {
	rows, err := db.Query("SELECT id FROM users WHERE TRIM(chat_color)=''")
	if err != nil {
		return err
	}
	defer rows.Close()

	ids := make([]string, 0)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return err
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for _, id := range ids {
		if _, err := db.Exec("UPDATE users SET chat_color=? WHERE id=?", defaultChatColorForUserID(id), id); err != nil {
			return err
		}
	}
	return nil
}
