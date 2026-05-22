package db

import (
	"database/sql"
	"fmt"
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
  room_status_text TEXT NOT NULL DEFAULT 'encrypted room',
  initialized INTEGER NOT NULL DEFAULT 0,
  room_key_enc TEXT,
  created_at TEXT
);
INSERT OR IGNORE INTO room_state (id, initialized) VALUES (1, 0);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL,
  status_text TEXT NOT NULL DEFAULT '',
  chat_color TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  avatar_ring_color TEXT NOT NULL DEFAULT '',
  avatar_ring_color2 TEXT NOT NULL DEFAULT '',
  avatar_ring_color3 TEXT NOT NULL DEFAULT '',
  avatar_ring_color4 TEXT NOT NULL DEFAULT '',
  avatar_ring_mode TEXT NOT NULL DEFAULT 'none',
  profile_about TEXT NOT NULL DEFAULT '',
  profile_accent TEXT NOT NULL DEFAULT '',
  profile_banner_url TEXT NOT NULL DEFAULT '',
  profile_card_bg_url TEXT NOT NULL DEFAULT '',
  profile_banner_opacity INTEGER NOT NULL DEFAULT 100,
  profile_card_bg_opacity INTEGER NOT NULL DEFAULT 100,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  credential_id TEXT NOT NULL,
  device_secret_hash TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL DEFAULT 'main',
  sender_id TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  nonce TEXT NOT NULL,
  reply_to_id TEXT,
  edited_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(sender_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status_text TEXT NOT NULL DEFAULT 'encrypted room',
  pinned INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS room_memberships (
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  joined_at TEXT NOT NULL,
  PRIMARY KEY (room_id, user_id),
  FOREIGN KEY(room_id) REFERENCES rooms(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS room_roles (
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (room_id, user_id),
  FOREIGN KEY(room_id) REFERENCES rooms(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS message_receipts (
  user_id TEXT PRIMARY KEY,
  last_seen_rowid INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS message_receipts_v2 (
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  last_seen_rowid INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (room_id, user_id),
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(room_id) REFERENCES rooms(id)
);

CREATE TABLE IF NOT EXISTS message_reactions (
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id, emoji),
  FOREIGN KEY(message_id) REFERENCES messages(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS pinned_messages (
  message_id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL DEFAULT 'main',
  pinned_by TEXT NOT NULL,
  pinned_at TEXT NOT NULL,
  FOREIGN KEY(message_id) REFERENCES messages(id),
  FOREIGN KEY(pinned_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS admin_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL DEFAULT 'main',
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
CREATE INDEX IF NOT EXISTS idx_message_reactions_message_id ON message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_user_id ON message_reactions(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created_at ON admin_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invites_token_hash ON invites(token_hash);
CREATE INDEX IF NOT EXISTS idx_users_active_created_at ON users(active, created_at);
CREATE INDEX IF NOT EXISTS idx_room_memberships_user_id ON room_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_room_roles_user_id ON room_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_receipts_v2_user_room ON message_receipts_v2(user_id, room_id);
CREATE INDEX IF NOT EXISTS idx_pinned_messages_room_pinned_at ON pinned_messages(room_id, pinned_at DESC);
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
	if err := ensureUsersStatusTextColumn(db); err != nil {
		return err
	}
	if err := ensureUsersProfileCardColumns(db); err != nil {
		return err
	}
	if err := ensureDevicesSecretHashColumn(db); err != nil {
		return err
	}
	if err := ensureRoomStateColumns(db); err != nil {
		return err
	}
	if err := backfillUsersChatColors(db); err != nil {
		return err
	}
	if err := ensureMessagesColumns(db); err != nil {
		return err
	}
	if err := ensureMessagesIndexes(db); err != nil {
		return err
	}
	if err := ensurePinnedMessagesColumns(db); err != nil {
		return err
	}
	if err := ensureInvitesColumns(db); err != nil {
		return err
	}
	if err := ensureDefaultRooms(db); err != nil {
		return err
	}
	if err := ensureRoomsMetadataColumns(db); err != nil {
		return err
	}
	if err := backfillMessageReceiptsV2(db); err != nil {
		return err
	}
	return nil
}

func now() string { return time.Now().UTC().Format(time.RFC3339) }

func tableColumns(db *sql.DB, table string) (map[string]struct{}, error) {
	switch table {
	case "messages", "room_state", "users", "pinned_messages", "invites", "rooms", "devices":
	default:
		return nil, fmt.Errorf("unsupported table for migration: %s", table)
	}
	rows, err := db.Query("PRAGMA table_info(" + table + ")")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	columns := make(map[string]struct{})
	for rows.Next() {
		var cid int
		var name, colType string
		var notNull, pk int
		var defaultValue any
		if err := rows.Scan(&cid, &name, &colType, &notNull, &defaultValue, &pk); err != nil {
			return nil, err
		}
		columns[name] = struct{}{}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return columns, nil
}

func addMissingColumns(db *sql.DB, table string, requiredColumns []columnDef) error {
	existing, err := tableColumns(db, table)
	if err != nil {
		return err
	}
	for _, col := range requiredColumns {
		if _, ok := existing[col.name]; ok {
			continue
		}
		if _, err := db.Exec("ALTER TABLE " + table + " ADD COLUMN " + col.name + " " + col.columnDef); err != nil {
			return err
		}
	}
	return nil
}

type columnDef struct {
	name      string
	columnDef string
}

func ensureUsersActiveColumn(db *sql.DB) error {
	return addMissingColumns(db, "users", []columnDef{{name: "active", columnDef: "INTEGER NOT NULL DEFAULT 1"}})
}

func ensureMessagesColumns(db *sql.DB) error {
	return addMissingColumns(db, "messages", []columnDef{
		{name: "room_id", columnDef: "TEXT NOT NULL DEFAULT 'main'"},
		{name: "reply_to_id", columnDef: "TEXT"},
		{name: "edited_at", columnDef: "TEXT"},
		{name: "deleted_at", columnDef: "TEXT"},
	})
}

func ensureMessagesIndexes(db *sql.DB) error {
	_, err := db.Exec("CREATE INDEX IF NOT EXISTS idx_messages_room_created_at ON messages(room_id, created_at DESC)")
	return err
}

func ensurePinnedMessagesColumns(db *sql.DB) error {
	return addMissingColumns(db, "pinned_messages", []columnDef{
		{name: "room_id", columnDef: "TEXT NOT NULL DEFAULT 'main'"},
	})
}

func ensureInvitesColumns(db *sql.DB) error {
	return addMissingColumns(db, "invites", []columnDef{
		{name: "room_id", columnDef: "TEXT NOT NULL DEFAULT 'main'"},
	})
}

func ensureRoomStateColumns(db *sql.DB) error {
	return addMissingColumns(db, "room_state", []columnDef{
		{name: "room_status_text", columnDef: "TEXT NOT NULL DEFAULT 'encrypted room'"},
	})
}

func ensureUsersChatColorColumn(db *sql.DB) error {
	return addMissingColumns(db, "users", []columnDef{{name: "chat_color", columnDef: "TEXT NOT NULL DEFAULT ''"}})
}

func ensureUsersAvatarURLColumn(db *sql.DB) error {
	return addMissingColumns(db, "users", []columnDef{{name: "avatar_url", columnDef: "TEXT NOT NULL DEFAULT ''"}})
}

func ensureUsersAvatarRingColumns(db *sql.DB) error {
	return addMissingColumns(db, "users", []columnDef{
		{name: "avatar_ring_color", columnDef: "TEXT NOT NULL DEFAULT ''"},
		{name: "avatar_ring_color2", columnDef: "TEXT NOT NULL DEFAULT ''"},
		{name: "avatar_ring_color3", columnDef: "TEXT NOT NULL DEFAULT ''"},
		{name: "avatar_ring_color4", columnDef: "TEXT NOT NULL DEFAULT ''"},
		{name: "avatar_ring_mode", columnDef: "TEXT NOT NULL DEFAULT 'none'"},
	})
}

func ensureUsersStatusTextColumn(db *sql.DB) error {
	return addMissingColumns(db, "users", []columnDef{{name: "status_text", columnDef: "TEXT NOT NULL DEFAULT ''"}})
}

func ensureUsersProfileCardColumns(db *sql.DB) error {
	return addMissingColumns(db, "users", []columnDef{
		{name: "profile_about", columnDef: "TEXT NOT NULL DEFAULT ''"},
		{name: "profile_accent", columnDef: "TEXT NOT NULL DEFAULT ''"},
		{name: "profile_banner_url", columnDef: "TEXT NOT NULL DEFAULT ''"},
		{name: "profile_card_bg_url", columnDef: "TEXT NOT NULL DEFAULT ''"},
		{name: "profile_banner_opacity", columnDef: "INTEGER NOT NULL DEFAULT 100"},
		{name: "profile_card_bg_opacity", columnDef: "INTEGER NOT NULL DEFAULT 100"},
	})
}

func ensureDevicesSecretHashColumn(db *sql.DB) error {
	return addMissingColumns(db, "devices", []columnDef{{name: "device_secret_hash", columnDef: "TEXT NOT NULL DEFAULT ''"}})
}

func ensureRoomsMetadataColumns(db *sql.DB) error {
	if err := addMissingColumns(db, "rooms", []columnDef{
		{name: "pinned", columnDef: "INTEGER NOT NULL DEFAULT 0"},
		{name: "sort_order", columnDef: "INTEGER NOT NULL DEFAULT 0"},
	}); err != nil {
		return err
	}
	_, err := db.Exec(`
UPDATE rooms
SET sort_order = (SELECT COUNT(*) FROM rooms r2 WHERE r2.rowid <= rooms.rowid)
WHERE sort_order=0
`)
	return err
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

func ensureDefaultRooms(db *sql.DB) error {
	_, err := db.Exec(`
INSERT OR IGNORE INTO rooms (id, name, status_text, created_by, created_at)
SELECT ?, COALESCE(NULLIF(TRIM(room_name), ''), 'Room Chat'), COALESCE(NULLIF(TRIM(room_status_text), ''), ?), 'system', ?
FROM room_state WHERE id=1;

INSERT OR IGNORE INTO room_memberships (room_id, user_id, joined_at)
SELECT r.id, u.id, ? FROM rooms r CROSS JOIN users u WHERE u.active=1;

UPDATE messages SET room_id=? WHERE TRIM(COALESCE(room_id,''))='';
UPDATE pinned_messages SET room_id=? WHERE TRIM(COALESCE(room_id,''))='';
UPDATE invites SET room_id=? WHERE TRIM(COALESCE(room_id,''))='';
`, DefaultRoomID, DefaultRoomStatusText, now(), now(), DefaultRoomID, DefaultRoomID, DefaultRoomID)
	return err
}

func backfillMessageReceiptsV2(db *sql.DB) error {
	_, err := db.Exec(`
INSERT OR IGNORE INTO message_receipts_v2 (room_id, user_id, last_seen_rowid, updated_at)
SELECT ?, user_id, last_seen_rowid, updated_at FROM message_receipts
`, DefaultRoomID)
	return err
}
