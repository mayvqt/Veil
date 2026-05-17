package db

import (
	"database/sql"
	"errors"
	"strconv"

	"github.com/google/uuid"
)

type User struct {
	ID          string `json:"id"`
	DisplayName string `json:"display_name"`
	Role        string `json:"role"`
}

type Message struct {
	ID          string `json:"id"`
	DisplayName string `json:"display_name"`
	Ciphertext  string `json:"ciphertext"`
	Nonce       string `json:"nonce"`
	CreatedAt   string `json:"created_at"`
}

type InviteInfo struct {
	ID        string `json:"id"`
	ExpiresAt string `json:"expires_at"`
	MaxUses   int    `json:"max_uses"`
	Uses      int    `json:"uses"`
	Revoked   bool   `json:"revoked"`
	CreatedAt string `json:"created_at"`
}

func (s *Store) IsInitialized() (bool, error) {
	var initialized int
	err := s.DB.QueryRow("SELECT initialized FROM room_state WHERE id=1").Scan(&initialized)
	return initialized == 1, err
}

func (s *Store) GetRoomName() (string, error) {
	var roomName string
	err := s.DB.QueryRow("SELECT room_name FROM room_state WHERE id=1").Scan(&roomName)
	return roomName, err
}

func (s *Store) UserCount() (int, error) {
	var c int
	err := s.DB.QueryRow("SELECT COUNT(*) FROM users").Scan(&c)
	return c, err
}

func (s *Store) InitRoom(roomName, displayName, publicKey, credentialID, roomKeyEnc string) (*User, error) {
	tx, err := s.DB.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var count int
	if err := tx.QueryRow("SELECT COUNT(*) FROM users").Scan(&count); err != nil {
		return nil, err
	}
	if count > 0 {
		return nil, errors.New("room already initialized")
	}

	u := &User{ID: uuid.NewString(), DisplayName: displayName, Role: "root_admin"}
	if _, err := tx.Exec("INSERT INTO users (id, display_name, role, created_at) VALUES (?, ?, ?, ?)", u.ID, u.DisplayName, u.Role, now()); err != nil {
		return nil, err
	}
	if _, err := tx.Exec("INSERT INTO devices (id, user_id, public_key, credential_id, created_at) VALUES (?, ?, ?, ?, ?)", uuid.NewString(), u.ID, publicKey, credentialID, now()); err != nil {
		return nil, err
	}
	if _, err := tx.Exec("UPDATE room_state SET room_name=?, initialized=1, room_key_enc=?, created_at=? WHERE id=1", roomName, roomKeyEnc, now()); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return u, nil
}

func (s *Store) CreateInvite(tokenHash, createdBy string, ttlHours, maxUses int) (string, error) {
	id := uuid.NewString()
	_, err := s.DB.Exec(
		"INSERT INTO invites (id, token_hash, created_by, expires_at, max_uses, created_at) VALUES (?, ?, ?, datetime('now', ?), ?, ?)",
		id, tokenHash, createdBy, "+"+itoa(ttlHours)+" hours", maxUses, now(),
	)
	return id, err
}

func (s *Store) ValidateInvite(tokenHash string) (string, error) {
	tx, err := s.DB.Begin()
	if err != nil {
		return "", err
	}
	defer tx.Rollback()

	var id string
	err = tx.QueryRow(`
SELECT id FROM invites
WHERE token_hash=? AND revoked=0 AND uses < max_uses AND datetime(expires_at) > datetime('now')
LIMIT 1`, tokenHash).Scan(&id)
	if err != nil {
		return "", err
	}
	res, err := tx.Exec("UPDATE invites SET uses = uses + 1 WHERE id=? AND uses < max_uses", id)
	if err != nil {
		return "", err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return "", err
	}
	if affected != 1 {
		return "", errors.New("invite no longer available")
	}
	if err := tx.Commit(); err != nil {
		return "", err
	}
	return id, nil
}

func (s *Store) AddMember(displayName, publicKey, credentialID string) (*User, error) {
	u := &User{ID: uuid.NewString(), DisplayName: displayName, Role: "member"}
	tx, err := s.DB.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	if _, err := tx.Exec("INSERT INTO users (id, display_name, role, created_at) VALUES (?, ?, ?, ?)", u.ID, u.DisplayName, u.Role, now()); err != nil {
		return nil, err
	}
	if _, err := tx.Exec("INSERT INTO devices (id, user_id, public_key, credential_id, created_at) VALUES (?, ?, ?, ?, ?)", uuid.NewString(), u.ID, publicKey, credentialID, now()); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return u, nil
}

func (s *Store) SaveMessage(senderID, displayName, ciphertext, nonce string) (*Message, error) {
	if len(ciphertext) > 4*1024*1024 || len(nonce) > 128 {
		return nil, errors.New("message too large")
	}
	msg := &Message{
		ID:          uuid.NewString(),
		DisplayName: displayName,
		Ciphertext:  ciphertext,
		Nonce:       nonce,
		CreatedAt:   now(),
	}
	_, err := s.DB.Exec("INSERT INTO messages (id, sender_id, ciphertext, nonce, created_at) VALUES (?, ?, ?, ?, ?)", msg.ID, senderID, ciphertext, nonce, msg.CreatedAt)
	if err != nil {
		return nil, err
	}
	return msg, nil
}

func (s *Store) ListRecentMessages(limit int) ([]map[string]string, error) {
	rows, err := s.DB.Query(`
SELECT m.id, u.display_name, m.ciphertext, m.nonce, m.created_at
FROM messages m JOIN users u ON u.id = m.sender_id
ORDER BY m.created_at DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]map[string]string, 0, limit)
	for rows.Next() {
		var id, name, ct, nonce, created string
		if err := rows.Scan(&id, &name, &ct, &nonce, &created); err != nil {
			return nil, err
		}
		out = append(out, map[string]string{"id": id, "display_name": name, "ciphertext": ct, "nonce": nonce, "created_at": created})
	}
	return out, rows.Err()
}

func (s *Store) ListInvites(limit int) ([]InviteInfo, error) {
	rows, err := s.DB.Query(`
SELECT id, expires_at, max_uses, uses, revoked, created_at
FROM invites
ORDER BY created_at DESC
LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]InviteInfo, 0, limit)
	for rows.Next() {
		var item InviteInfo
		var revoked int
		if err := rows.Scan(&item.ID, &item.ExpiresAt, &item.MaxUses, &item.Uses, &revoked, &item.CreatedAt); err != nil {
			return nil, err
		}
		item.Revoked = revoked == 1
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Store) RevokeInvite(inviteID string) error {
	_, err := s.DB.Exec("UPDATE invites SET revoked=1 WHERE id=?", inviteID)
	return err
}

func (s *Store) RevokeUnusedInvites() (int64, error) {
	res, err := s.DB.Exec("UPDATE invites SET revoked=1 WHERE revoked=0 AND uses=0")
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (s *Store) PurgeUsedOrRevokedInvites() (int64, error) {
	res, err := s.DB.Exec("DELETE FROM invites WHERE revoked=1 OR uses >= max_uses")
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (s *Store) FindUserByCredential(credentialID string) (*User, error) {
	row := s.DB.QueryRow(`
SELECT u.id, u.display_name, u.role
FROM users u JOIN devices d ON d.user_id=u.id
WHERE d.credential_id=? AND u.active=1 LIMIT 1`, credentialID)
	u := &User{}
	if err := row.Scan(&u.ID, &u.DisplayName, &u.Role); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return u, nil
}

func (s *Store) ListUsers() ([]User, error) {
	rows, err := s.DB.Query("SELECT id, display_name, role FROM users WHERE active=1 ORDER BY created_at ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	users := make([]User, 0)
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.DisplayName, &u.Role); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

func (s *Store) UpdateUserRole(userID, role string) error {
	_, err := s.DB.Exec("UPDATE users SET role=? WHERE id=? AND active=1", role, userID)
	return err
}

func (s *Store) DeactivateUser(userID string) error {
	_, err := s.DB.Exec("UPDATE users SET active=0 WHERE id=?", userID)
	return err
}

func (s *Store) GetRoomKeyEnc() (string, error) {
	var roomKeyEnc string
	if err := s.DB.QueryRow("SELECT room_key_enc FROM room_state WHERE id=1").Scan(&roomKeyEnc); err != nil {
		return "", err
	}
	return roomKeyEnc, nil
}

func (s *Store) IsUserActive(userID string) (bool, error) {
	var active int
	if err := s.DB.QueryRow("SELECT active FROM users WHERE id=?", userID).Scan(&active); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	return active == 1, nil
}

func itoa(v int) string { return strconv.Itoa(v) }

func (s *Store) PruneMessagesOlderThan(days int) error {
	if days <= 0 {
		return nil
	}
	_, err := s.DB.Exec("DELETE FROM messages WHERE datetime(created_at) < datetime('now', ?)", "-"+strconv.Itoa(days)+" days")
	return err
}

func (s *Store) PruneMessagesToLimit(limit int) error {
	if limit <= 0 {
		return nil
	}
	_, err := s.DB.Exec(`
DELETE FROM messages
WHERE id IN (
  SELECT id
  FROM messages
  ORDER BY datetime(created_at) DESC
  LIMIT -1 OFFSET ?
)`, limit)
	return err
}

func (s *Store) MessageCount() (int, error) {
	var c int
	err := s.DB.QueryRow("SELECT COUNT(*) FROM messages").Scan(&c)
	return c, err
}

func (s *Store) DeleteAllMessages() (int64, error) {
	res, err := s.DB.Exec("DELETE FROM messages")
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
