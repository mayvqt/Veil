package db

import (
	"database/sql"
	"errors"
	"fmt"
	"strconv"

	"github.com/google/uuid"
)

func (s *Store) SaveMessage(senderID, displayName, ciphertext, nonce, replyToID string) (*Message, error) {
	if len(ciphertext) > 24*1024*1024 || len(nonce) > 128 {
		return nil, errors.New("message too large")
	}
	msg := &Message{
		ID:          uuid.NewString(),
		SenderID:    senderID,
		DisplayName: displayName,
		Ciphertext:  ciphertext,
		Nonce:       nonce,
		ReplyToID:   replyToID,
		CreatedAt:   now(),
	}
	_, err := s.DB.Exec("INSERT INTO messages (id, sender_id, ciphertext, nonce, reply_to_id, created_at) VALUES (?, ?, ?, ?, ?, ?)", msg.ID, senderID, ciphertext, nonce, replyToID, msg.CreatedAt)
	if err != nil {
		return nil, err
	}
	if err := s.DB.QueryRow("SELECT rowid FROM messages WHERE id=?", msg.ID).Scan(&msg.RowID); err != nil {
		return nil, err
	}
	return s.getMessageByID(msg.ID)
}

func (s *Store) ListRecentMessages(limit int, beforeRowID int64) ([]map[string]string, error) {
	query := `
SELECT m.rowid, m.id, m.sender_id, u.display_name, COALESCE(u.chat_color,''), COALESCE(u.avatar_url,''), COALESCE(u.avatar_ring_color,''), COALESCE(u.avatar_ring_color2,''), COALESCE(u.avatar_ring_color3,''), COALESCE(u.avatar_ring_color4,''), COALESCE(u.avatar_ring_mode,'none'), m.ciphertext, m.nonce, COALESCE(m.reply_to_id,''), COALESCE(m.edited_at,''), COALESCE(m.deleted_at,''), m.created_at
FROM messages m JOIN users u ON u.id = m.sender_id
%s
ORDER BY m.rowid DESC LIMIT ?`
	where := ""
	args := []any{}
	if beforeRowID > 0 {
		where = "WHERE m.rowid < ?"
		args = append(args, beforeRowID)
	}
	args = append(args, limit)
	rows, err := s.DB.Query(fmt.Sprintf(query, where), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]map[string]string, 0, limit)
	for rows.Next() {
		var rowID int64
		var id, senderID, name, chatColor, avatarURL, ringColor, ringColor2, ringColor3, ringColor4, ringMode, ct, nonce, replyToID, editedAt, deletedAt, created string
		if err := rows.Scan(&rowID, &id, &senderID, &name, &chatColor, &avatarURL, &ringColor, &ringColor2, &ringColor3, &ringColor4, &ringMode, &ct, &nonce, &replyToID, &editedAt, &deletedAt, &created); err != nil {
			return nil, err
		}
		out = append(out, messageMap(rowID, id, senderID, name, chatColor, avatarURL, ringColor, ringColor2, ringColor3, ringColor4, ringMode, ct, nonce, replyToID, editedAt, deletedAt, created))
	}
	return out, rows.Err()
}

func (s *Store) EditMessage(messageID, senderID, ciphertext, nonce string) (*Message, error) {
	if len(ciphertext) > 24*1024*1024 || len(nonce) > 128 {
		return nil, errors.New("message too large")
	}
	editedAt := now()
	res, err := s.DB.Exec("UPDATE messages SET ciphertext=?, nonce=?, edited_at=? WHERE id=? AND sender_id=? AND deleted_at IS NULL", ciphertext, nonce, editedAt, messageID, senderID)
	if err != nil {
		return nil, err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return nil, err
	}
	if affected == 0 {
		return nil, sql.ErrNoRows
	}
	return s.getMessageByID(messageID)
}

func (s *Store) DeleteMessage(messageID, senderID string) (*Message, error) {
	deletedAt := now()
	res, err := s.DB.Exec("UPDATE messages SET deleted_at=?, edited_at='' WHERE id=? AND sender_id=? AND deleted_at IS NULL", deletedAt, messageID, senderID)
	if err != nil {
		return nil, err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return nil, err
	}
	if affected == 0 {
		return nil, sql.ErrNoRows
	}
	return s.getMessageByID(messageID)
}

func (s *Store) UpsertReadReceipt(userID string, lastSeenRowID int64) error {
	_, err := s.DB.Exec(`
INSERT INTO message_receipts (user_id, last_seen_rowid, updated_at)
VALUES (?, ?, ?)
ON CONFLICT(user_id) DO UPDATE SET last_seen_rowid=MAX(last_seen_rowid, excluded.last_seen_rowid), updated_at=excluded.updated_at
`, userID, lastSeenRowID, now())
	return err
}

func (s *Store) ListReadReceipts() (map[string]int64, error) {
	rows, err := s.DB.Query("SELECT user_id, last_seen_rowid FROM message_receipts")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int64{}
	for rows.Next() {
		var userID string
		var rowID int64
		if err := rows.Scan(&userID, &rowID); err != nil {
			return nil, err
		}
		out[userID] = rowID
	}
	return out, rows.Err()
}

func messageMap(rowID int64, id, senderID, name, chatColor, avatarURL, ringColor, ringColor2, ringColor3, ringColor4, ringMode, ct, nonce, replyToID, editedAt, deletedAt, created string) map[string]string {
	return map[string]string{
		"row_id":             strconv.FormatInt(rowID, 10),
		"id":                 id,
		"sender_id":          senderID,
		"display_name":       name,
		"chat_color":         chatColor,
		"avatar_url":         avatarURL,
		"avatar_ring_color":  ringColor,
		"avatar_ring_color2": ringColor2,
		"avatar_ring_color3": ringColor3,
		"avatar_ring_color4": ringColor4,
		"avatar_ring_mode":   ringMode,
		"ciphertext":         ct,
		"nonce":              nonce,
		"reply_to_id":        replyToID,
		"edited_at":          editedAt,
		"deleted_at":         deletedAt,
		"created_at":         created,
	}
}

func (s *Store) getMessageByID(messageID string) (*Message, error) {
	msg := &Message{}
	if err := s.DB.QueryRow(`
SELECT m.rowid, m.id, m.sender_id, u.display_name, COALESCE(u.chat_color,''), COALESCE(u.avatar_url,''), COALESCE(u.avatar_ring_color,''), COALESCE(u.avatar_ring_color2,''), COALESCE(u.avatar_ring_color3,''), COALESCE(u.avatar_ring_color4,''), COALESCE(u.avatar_ring_mode,'none'), m.ciphertext, m.nonce, COALESCE(m.reply_to_id,''), COALESCE(m.edited_at,''), COALESCE(m.deleted_at,''), m.created_at
FROM messages m JOIN users u ON u.id = m.sender_id
WHERE m.id=?`, messageID).Scan(&msg.RowID, &msg.ID, &msg.SenderID, &msg.DisplayName, &msg.ChatColor, &msg.AvatarURL, &msg.AvatarRingColor, &msg.AvatarRingColor2, &msg.AvatarRingColor3, &msg.AvatarRingColor4, &msg.AvatarRingMode, &msg.Ciphertext, &msg.Nonce, &msg.ReplyToID, &msg.EditedAt, &msg.DeletedAt, &msg.CreatedAt); err != nil {
		return nil, err
	}
	return msg, nil
}
